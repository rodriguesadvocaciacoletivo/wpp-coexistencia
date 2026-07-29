import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  type Contact,
  type Conversation,
  type Inbox,
  type MessageStatus,
  type MessageType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { MetaGraphService } from '../meta/meta-graph.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type {
  WebhookMediaObject,
  WebhookMessage,
  WebhookStatus,
  WebhookValue,
} from '../webhooks/webhook.types';

/** A janela de atendimento da Meta dura 24 horas a partir da última entrada. */
const WINDOW_HOURS = 24;

@Injectable()
export class MessageIngestionService {
  private readonly logger = new Logger(MessageIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly meta: MetaGraphService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Processa mensagens recebidas de contatos. */
  async ingestMessages(value: WebhookValue): Promise<void> {
    const phoneNumberId = value.metadata?.phone_number_id;

    if (!phoneNumberId) {
      this.logger.warn('Evento de mensagem sem phone_number_id — ignorado.');
      return;
    }

    const inbox = await this.prisma.inbox.findFirst({
      where: { phoneNumberId, deletedAt: null },
    });

    if (!inbox) {
      // Acontece quando a caixa foi removida mas o app segue assinado na WABA.
      this.logger.warn(
        `Mensagem recebida para o número ${phoneNumberId}, que não tem caixa de entrada ativa.`,
      );
      return;
    }

    const profiles = new Map(
      (value.contacts ?? []).map((contact) => [
        contact.wa_id ?? '',
        contact.profile?.name ?? null,
      ]),
    );

    for (const message of value.messages ?? []) {
      await this.ingestOne(inbox, message, profiles.get(message.from ?? '') ?? null);
    }
  }

  private async ingestOne(
    inbox: Inbox,
    message: WebhookMessage,
    profileName: string | null,
  ): Promise<void> {
    if (!message.id || !message.from) {
      return;
    }

    // A idempotência real é o índice único em wa_message_id. Esta consulta só
    // evita o trabalho de baixar mídia de novo antes de bater na restrição.
    const already = await this.prisma.message.findUnique({
      where: { waMessageId: message.id },
      select: { id: true },
    });

    if (already) {
      this.logger.debug(`Mensagem ${message.id} já registrada — ignorada.`);
      return;
    }

    const contact = await this.upsertContact(message.from, profileName);
    const conversation = await this.upsertConversation(inbox, contact);

    const type = mapMessageType(message.type);
    const receivedAt = timestampToDate(message.timestamp);
    const { content, payload } = describeMessage(message, type);

    const created = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'in',
        type,
        origin: 'contact',
        status: 'delivered',
        content,
        payload: payload as Prisma.InputJsonValue,
        waMessageId: message.id,
        replyToWaId: message.context?.id ?? null,
        createdAt: receivedAt,
        deliveredAt: receivedAt,
      },
    });

    await this.downloadAttachment(inbox, created.id, message, type);

    // Toda mensagem recebida renova a janela de 24h. É esse carimbo que a
    // Fase 4 usa para liberar ou bloquear texto livre no composer.
    const windowExpiresAt = new Date(
      receivedAt.getTime() + WINDOW_HOURS * 3_600_000,
    );

    const updated = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        // Mensagem nova em conversa resolvida reabre o atendimento: o cliente
        // voltou, e deixar isso resolvido esconderia a conversa da equipe.
        status: 'open',
        resolvedAt: null,
        windowExpiresAt,
        lastMessageAt: receivedAt,
        lastMessagePreview: previewOf(content, type),
        unreadCount: { increment: 1 },
      },
      include: { contact: true },
    });

    this.realtime.emitMessageCreated(updated.id, created.id);
    this.realtime.emitConversationUpdated(updated.id);

    this.logger.log(
      `Mensagem ${type} recebida de ${contact.waId} na caixa "${inbox.name}".`,
    );
  }

  /**
   * Atualiza o status de mensagens enviadas.
   *
   * Os eventos podem chegar fora de ordem — `read` antes de `delivered`
   * acontece com frequência. A precedência abaixo garante que um status
   * atrasado nunca rebaixe o que já foi confirmado.
   */
  async applyStatuses(value: WebhookValue): Promise<void> {
    for (const status of value.statuses ?? []) {
      await this.applyStatus(status);
    }
  }

  private async applyStatus(status: WebhookStatus): Promise<void> {
    if (!status.id || !status.status) {
      return;
    }

    const message = await this.prisma.message.findUnique({
      where: { waMessageId: status.id },
      select: { id: true, status: true, conversationId: true },
    });

    if (!message) {
      // O status pode chegar antes da confirmação do envio ter sido gravada.
      this.logger.debug(`Status para mensagem desconhecida ${status.id}.`);
      return;
    }

    const incoming = mapStatus(status.status);

    if (statusRank(incoming) <= statusRank(message.status)) {
      return;
    }

    const at = timestampToDate(status.timestamp);
    const error = status.errors?.[0];

    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        status: incoming,
        ...(incoming === 'sent' ? { sentAt: at } : {}),
        ...(incoming === 'delivered' ? { deliveredAt: at } : {}),
        ...(incoming === 'read' ? { readAt: at } : {}),
        ...(incoming === 'failed'
          ? {
              failedAt: at,
              errorPayload: {
                code: error?.code ?? null,
                title: error?.title ?? null,
                message: error?.message ?? null,
                details: error?.error_data?.details ?? null,
              } as Prisma.InputJsonValue,
            }
          : {}),
      },
    });

    this.realtime.emitMessageStatus(message.conversationId, message.id, incoming);

    if (incoming === 'failed') {
      this.logger.warn(
        `Envio da mensagem ${status.id} falhou: ${error?.title ?? 'motivo não informado'} (${error?.code ?? '—'})`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Apoio
  // ---------------------------------------------------------------------------

  private async upsertContact(
    waId: string,
    profileName: string | null,
  ): Promise<Contact> {
    return this.prisma.contact.upsert({
      where: { waId },
      create: { waId, profileName },
      // O nome do perfil pode mudar; o nome editado pela equipe não é tocado.
      update: profileName ? { profileName } : {},
    });
  }

  private async upsertConversation(
    inbox: Inbox,
    contact: Contact,
  ): Promise<Conversation> {
    const existing = await this.prisma.conversation.findUnique({
      where: { inboxId_contactId: { inboxId: inbox.id, contactId: contact.id } },
    });

    if (existing) {
      return existing;
    }

    const created = await this.prisma.conversation.create({
      data: { inboxId: inbox.id, contactId: contact.id, status: 'open' },
    });

    this.realtime.emitConversationCreated(created.id);
    return created;
  }

  /**
   * Baixa a mídia da mensagem e guarda no storage próprio.
   *
   * Precisa acontecer agora: a URL que a Meta devolve expira em minutos. Se
   * falhar, a mensagem permanece na conversa sem o anexo — perder o texto
   * junto seria pior do que perder o arquivo.
   */
  private async downloadAttachment(
    inbox: Inbox,
    messageId: string,
    message: WebhookMessage,
    type: MessageType,
  ): Promise<void> {
    const media = mediaObjectOf(message, type);

    if (!media?.id) {
      return;
    }

    try {
      const token = this.crypto.decrypt(inbox.tokenEncrypted);
      const info = await this.meta.getMediaUrl(media.id, token);

      if (!info.url) {
        throw new Error('A Meta não devolveu a URL da mídia.');
      }

      const buffer = await this.meta.downloadMedia(info.url, token);
      const mimeType = info.mime_type ?? media.mime_type ?? 'application/octet-stream';
      const stored = await this.storage.save(buffer, mimeType, media.filename);

      await this.prisma.attachment.create({
        data: {
          messageId,
          metaMediaId: media.id,
          storageKey: stored.key,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          originalName: media.filename ?? null,
          caption: media.caption ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao baixar mídia ${media.id} da mensagem ${messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Funções puras
// -----------------------------------------------------------------------------

function mapMessageType(type: string | undefined): MessageType {
  switch (type) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'document':
      return 'document';
    case 'sticker':
      return 'sticker';
    case 'location':
      return 'location';
    case 'contacts':
      return 'contacts';
    case 'reaction':
      return 'reaction';
    case 'template':
      return 'template';
    default:
      // Tipos novos ou não suportados viram `unsupported` em vez de serem
      // descartados: o atendente precisa saber que algo chegou.
      return 'unsupported';
  }
}

function mediaObjectOf(
  message: WebhookMessage,
  type: MessageType,
): WebhookMediaObject | undefined {
  switch (type) {
    case 'image':
      return message.image;
    case 'video':
      return message.video;
    case 'audio':
      return message.audio;
    case 'document':
      return message.document;
    case 'sticker':
      return message.sticker;
    default:
      return undefined;
  }
}

function describeMessage(
  message: WebhookMessage,
  type: MessageType,
): { content: string | null; payload: Record<string, unknown> | null } {
  switch (type) {
    case 'text':
      return { content: message.text?.body ?? '', payload: null };

    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const media = mediaObjectOf(message, type);
      return {
        content: media?.caption ?? null,
        payload: media?.filename ? { filename: media.filename } : null,
      };
    }

    case 'location':
      return {
        content: message.location?.name ?? message.location?.address ?? null,
        payload: message.location as Record<string, unknown>,
      };

    case 'contacts':
      return { content: null, payload: { contacts: message.contacts ?? [] } };

    case 'reaction':
      return {
        content: message.reaction?.emoji ?? null,
        payload: { reactedTo: message.reaction?.message_id ?? null },
      };

    default:
      return {
        content: null,
        payload: { rawType: message.type ?? 'desconhecido' },
      };
  }
}

function previewOf(content: string | null, type: MessageType): string {
  if (content && content.trim().length > 0) {
    return content.slice(0, 280);
  }

  const labels: Partial<Record<MessageType, string>> = {
    image: '📷 Imagem',
    video: '🎥 Vídeo',
    audio: '🎤 Áudio',
    document: '📄 Documento',
    sticker: '🌟 Figurinha',
    location: '📍 Localização',
    contacts: '👤 Contato',
    reaction: '💬 Reação',
    unsupported: 'Mensagem não suportada',
  };

  return labels[type] ?? 'Mensagem';
}

function mapStatus(status: string): MessageStatus {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Ordena os status para tolerar eventos fora de ordem.
 * `failed` fica no topo: uma falha confirmada não deve ser sobrescrita.
 */
function statusRank(status: MessageStatus): number {
  const ranks: Record<MessageStatus, number> = {
    pending: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    failed: 4,
  };

  return ranks[status];
}

function timestampToDate(timestamp: string | undefined): Date {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : new Date();
}
