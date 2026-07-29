import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type MessageType } from '@prisma/client';
import { MEDIA_LIMITS, mediaKindOf } from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { MetaGraphService } from '../meta/meta-graph.service';
import { MetaApiError, describeMetaError } from '../meta/meta.errors';
import { StorageService } from '../storage/storage.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface OutgoingFile {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface SendMessageOptions {
  conversationId: string;
  authorId: string;
  content?: string;
  privateNote?: boolean;
  file?: OutgoingFile;
}

@Injectable()
export class MessageSendingService {
  private readonly logger = new Logger(MessageSendingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly meta: MetaGraphService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async send(options: SendMessageOptions): Promise<string> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: options.conversationId },
      include: { inbox: true, contact: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    const hasContent = Boolean(options.content?.trim());

    if (!hasContent && !options.file) {
      throw new BadRequestException('Informe um texto ou anexe um arquivo.');
    }

    if (options.privateNote) {
      return this.createPrivateNote(conversation.id, options);
    }

    if (conversation.inbox.deletedAt) {
      throw new BadRequestException(
        'Esta caixa de entrada foi removida e não envia mensagens.',
      );
    }

    if (conversation.inbox.connectionStatus !== 'connected') {
      throw new BadRequestException(
        'A caixa de entrada está com problema de conexão. Revalide as credenciais antes de enviar.',
      );
    }

    // A regra dos 24h é da Meta, não nossa: fora da janela ela recusa qualquer
    // coisa que não seja template. Bloquear aqui evita gastar um envio para
    // receber erro 131047 e deixar a mensagem como falha na conversa.
    const windowOpen =
      conversation.windowExpiresAt !== null &&
      conversation.windowExpiresAt.getTime() > Date.now();

    if (!windowOpen) {
      throw new ForbiddenException(
        'A janela de 24 horas está fechada. Use um template aprovado para retomar a conversa.',
      );
    }

    const token = this.crypto.decrypt(conversation.inbox.tokenEncrypted);

    let type: MessageType = 'text';
    let mediaId: string | null = null;
    let storedKey: string | null = null;

    if (options.file) {
      const kind = mediaKindOf(options.file.mimeType);
      const limit = MEDIA_LIMITS[kind] ?? MEDIA_LIMITS.document ?? 0;

      if (options.file.buffer.byteLength > limit) {
        throw new BadRequestException(
          `Arquivo maior que o limite da Meta para ${kind} (${Math.round(limit / 1024 / 1024)} MB).`,
        );
      }

      // Guarda antes de enviar: se a Meta recusar, o arquivo continua
      // disponível para o atendente ver o que tentou mandar.
      const stored = await this.storage.save(
        options.file.buffer,
        options.file.mimeType,
        options.file.originalName,
      );
      storedKey = stored.key;

      try {
        mediaId = await this.meta.uploadMedia(
          conversation.inbox.phoneNumberId,
          token,
          options.file.buffer,
          options.file.mimeType,
          options.file.originalName,
        );
      } catch (error) {
        await this.storage.remove(stored.key);
        throw this.translate(error);
      }

      type = kind === 'sticker' ? 'sticker' : (kind as MessageType);
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'out',
        type,
        origin: 'platform',
        status: 'pending',
        content: options.content?.trim() || null,
        authorId: options.authorId,
      },
    });

    if (storedKey && options.file) {
      await this.prisma.attachment.create({
        data: {
          messageId: message.id,
          metaMediaId: mediaId,
          storageKey: storedKey,
          mimeType: options.file.mimeType,
          sizeBytes: options.file.buffer.byteLength,
          originalName: options.file.originalName,
          caption: options.content?.trim() || null,
        },
      });
    }

    try {
      const response = await this.meta.sendMessage(
        conversation.inbox.phoneNumberId,
        token,
        buildPayload(conversation.contact.waId, type, {
          text: options.content?.trim(),
          mediaId,
          filename: options.file?.originalName,
        }),
      );

      const waMessageId = response.messages?.[0]?.id ?? null;

      await this.prisma.message.update({
        where: { id: message.id },
        data: { waMessageId, status: 'sent', sentAt: new Date() },
      });
    } catch (error) {
      const described =
        error instanceof MetaApiError
          ? describeMetaError(error)
          : error instanceof Error
            ? error.message
            : String(error);

      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'failed',
          failedAt: new Date(),
          errorPayload: { message: described } as Prisma.InputJsonValue,
        },
      });

      this.logger.error(
        `Falha ao enviar mensagem na conversa ${conversation.id}: ${described}`,
      );

      // A mensagem permanece na conversa marcada como falha — some da tela
      // seria pior, porque o atendente perderia o que escreveu.
      this.realtime.emitMessageCreated(conversation.id, message.id);
      throw this.translate(error);
    }

    await this.touchConversation(conversation.id, options.content, type);

    this.realtime.emitMessageCreated(conversation.id, message.id);
    this.realtime.emitConversationUpdated(conversation.id);

    return message.id;
  }

  /** Nota interna: fica na timeline da equipe e nunca chega ao contato. */
  private async createPrivateNote(
    conversationId: string,
    options: SendMessageOptions,
  ): Promise<string> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        direction: 'out',
        type: 'private_note',
        origin: 'system',
        status: 'sent',
        content: options.content?.trim() ?? '',
        authorId: options.authorId,
        sentAt: new Date(),
      },
    });

    // Nota não altera a prévia da conversa: a lista deve continuar mostrando a
    // última mensagem trocada com o cliente, não um comentário interno.
    this.realtime.emitMessageCreated(conversationId, message.id);

    return message.id;
  }

  /** Marca as mensagens recebidas como lidas no aparelho do contato. */
  async markConversationRead(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { inbox: true },
    });

    if (!conversation || conversation.unreadCount === 0) {
      return;
    }

    const lastInbound = await this.prisma.message.findFirst({
      where: { conversationId, direction: 'in', waMessageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { waMessageId: true },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    if (
      lastInbound?.waMessageId &&
      conversation.inbox.connectionStatus === 'connected'
    ) {
      try {
        const token = this.crypto.decrypt(conversation.inbox.tokenEncrypted);
        // Marcar a última recebida marca as anteriores junto, então uma
        // chamada basta.
        await this.meta.markAsRead(
          conversation.inbox.phoneNumberId,
          token,
          lastInbound.waMessageId,
        );
      } catch (error) {
        // O contador local já zerou. Não conseguir avisar a Meta é uma falha
        // cosmética — o "visto" não aparece para o contato, e só.
        this.logger.warn(
          `Não foi possível marcar como lida na Meta: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.realtime.emitConversationUpdated(conversationId);
  }

  private async touchConversation(
    conversationId: string,
    content: string | undefined,
    type: MessageType,
  ): Promise<void> {
    const preview = content?.trim()
      ? content.trim().slice(0, 280)
      : previewForType(type);

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: preview },
    });
  }

  private translate(error: unknown): Error {
    if (error instanceof MetaApiError) {
      return new BadRequestException(describeMetaError(error));
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}

function buildPayload(
  waId: string,
  type: MessageType,
  data: { text?: string; mediaId?: string | null; filename?: string },
): Record<string, unknown> {
  const base = { to: waId, recipient_type: 'individual' };

  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      // preview_url deixa o WhatsApp renderizar o cartão de links no texto.
      text: { body: data.text ?? '', preview_url: true },
    };
  }

  const media: Record<string, unknown> = { id: data.mediaId };

  // Figurinhas e áudios não aceitam legenda na Cloud API — enviar mesmo assim
  // faz a Meta recusar a mensagem inteira.
  if (data.text && type !== 'sticker' && type !== 'audio') {
    media.caption = data.text;
  }

  if (type === 'document' && data.filename) {
    media.filename = data.filename;
  }

  return { ...base, type, [type]: media };
}

function previewForType(type: MessageType): string {
  const labels: Partial<Record<MessageType, string>> = {
    image: '📷 Imagem',
    video: '🎥 Vídeo',
    audio: '🎤 Áudio',
    document: '📄 Documento',
    sticker: '🌟 Figurinha',
    template: '📋 Template',
  };

  return labels[type] ?? 'Mensagem';
}
