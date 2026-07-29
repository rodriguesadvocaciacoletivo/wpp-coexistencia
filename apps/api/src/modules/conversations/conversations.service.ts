import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type Attachment,
  type Contact,
  type Message,
  type User,
} from '@prisma/client';
import type {
  ConversationCountsDto,
  ConversationDto,
  ContactDto,
  MessageDto,
  Paginated,
} from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { toUserDto } from '../../common/mappers/user.mapper';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { ActorContext } from '../users/users.service';
import type {
  ListConversationsDto,
  UpdateConversationDto,
} from './dto/conversations.dto';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

type ConversationRecord = Prisma.ConversationGetPayload<{
  include: {
    contact: true;
    inbox: { select: { id: true; name: true } };
    assignee: true;
    team: { select: { id: true; name: true } };
  };
}>;

@Injectable()
export class ConversationsService {
  private readonly publicApiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    config: ConfigService,
  ) {
    this.publicApiUrl = (
      config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3333'
    ).replace(/\/$/, '');
  }

  async list(
    query: ListConversationsDto,
    viewerId: string,
  ): Promise<Paginated<ConversationDto>> {
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const conversations = await this.prisma.conversation.findMany({
      where: this.buildWhere(query, viewerId),
      include: {
        contact: true,
        inbox: { select: { id: true, name: true } },
        assignee: true,
        team: { select: { id: true, name: true } },
      },
      // Ordena por atividade, com o id como desempate — sem ele, conversas com
      // o mesmo carimbo poderiam aparecer duas vezes ou sumir na paginação.
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, limit) : conversations;

    return {
      items: items.map((conversation) => this.toDto(conversation)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  /** Contadores das três abas, calculados em uma única ida ao banco. */
  async counts(viewerId: string): Promise<ConversationCountsDto> {
    const [mine, unassigned, all] = await this.prisma.$transaction([
      this.prisma.conversation.count({
        where: { status: 'open', assigneeId: viewerId },
      }),
      this.prisma.conversation.count({
        where: { status: 'open', assigneeId: null },
      }),
      this.prisma.conversation.count({ where: { status: 'open' } }),
    ]);

    return { mine, unassigned, all };
  }

  async findOne(id: string): Promise<ConversationDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        inbox: { select: { id: true, name: true } },
        assignee: true,
        team: { select: { id: true, name: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    return this.toDto(conversation);
  }

  async messages(
    conversationId: string,
    cursor?: string,
    limit = 50,
  ): Promise<Paginated<MessageDto>> {
    await this.requireConversation(conversationId);

    const take = Math.min(limit, MAX_PAGE_SIZE);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: { attachments: true, author: true },
      // Do mais recente para o mais antigo: a tela abre no fim da conversa e
      // pagina para trás conforme o atendente rola.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > take;
    const items = hasMore ? messages.slice(0, take) : messages;

    return {
      items: items.map((message) => this.toMessageDto(message)).reverse(),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async update(
    id: string,
    input: UpdateConversationDto,
    actor: ActorContext,
  ): Promise<ConversationDto> {
    const conversation = await this.requireConversation(id);

    if (input.assigneeId) {
      const exists = await this.prisma.user.count({
        where: { id: input.assigneeId, status: 'active' },
      });

      if (exists === 0) {
        throw new BadRequestException('Agente informado não existe ou está inativo.');
      }
    }

    const data: Prisma.ConversationUpdateInput = {};
    const events: Array<{ text: string; metadata: Record<string, unknown> }> = [];

    if (input.assigneeId !== undefined) {
      data.assignee = input.assigneeId
        ? { connect: { id: input.assigneeId } }
        : { disconnect: true };

      const name = input.assigneeId
        ? ((await this.prisma.user.findUnique({
            where: { id: input.assigneeId },
            select: { name: true },
          })) ?? { name: 'alguém' }).name
        : null;

      events.push({
        text: name
          ? `Conversa atribuída a ${name}`
          : 'Conversa deixou de ter responsável',
        metadata: { assigneeId: input.assigneeId },
      });
    }

    if (input.teamId !== undefined) {
      data.team = input.teamId ? { connect: { id: input.teamId } } : { disconnect: true };
      events.push({ text: 'Time da conversa alterado', metadata: { teamId: input.teamId } });
    }

    if (input.priority !== undefined && input.priority !== conversation.priority) {
      data.priority = input.priority;
      events.push({
        text: `Prioridade alterada para ${input.priority}`,
        metadata: { priority: input.priority },
      });
    }

    if (input.status !== undefined && input.status !== conversation.status) {
      data.status = input.status;
      data.resolvedAt = input.status === 'resolved' ? new Date() : null;
      events.push({
        text:
          input.status === 'resolved'
            ? 'Conversa marcada como resolvida'
            : 'Conversa reaberta',
        metadata: { status: input.status },
      });
    }

    if (Object.keys(data).length === 0) {
      return this.findOne(id);
    }

    await this.prisma.conversation.update({ where: { id }, data });

    // Cada mudança relevante vira um evento na timeline. Sem isso, o atendente
    // que recebe a conversa não tem como saber por onde ela passou.
    for (const event of events) {
      await this.prisma.message.create({
        data: {
          conversationId: id,
          direction: 'out',
          type: 'system_event',
          origin: 'system',
          status: 'sent',
          content: event.text,
          payload: {
            ...event.metadata,
            actorId: actor.actorId,
          } as Prisma.InputJsonValue,
          authorId: actor.actorId,
          sentAt: new Date(),
        },
      });
    }

    await this.audit.record({
      userId: actor.actorId,
      action: 'conversation.updated',
      entity: 'conversation',
      entityId: id,
      metadata: { ...input } as Prisma.InputJsonValue,
      ipAddress: actor.ipAddress,
    });

    if (input.assigneeId && input.assigneeId !== actor.actorId) {
      this.realtime.emitAssignedToUser(input.assigneeId, id);
    }

    this.realtime.emitConversationUpdated(id);

    return this.findOne(id);
  }

  /** Edita o nome de exibição do contato. */
  async renameContact(
    conversationId: string,
    displayName: string,
    actor: ActorContext,
  ): Promise<ConversationDto> {
    const conversation = await this.requireConversation(conversationId);

    await this.prisma.contact.update({
      where: { id: conversation.contactId },
      data: { displayName: displayName.trim() || null },
    });

    await this.audit.record({
      userId: actor.actorId,
      action: 'contact.renamed',
      entity: 'contact',
      entityId: conversation.contactId,
      metadata: { displayName },
      ipAddress: actor.ipAddress,
    });

    this.realtime.emitConversationUpdated(conversationId);

    return this.findOne(conversationId);
  }

  private async requireConversation(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    return conversation;
  }

  private buildWhere(
    query: ListConversationsDto,
    viewerId: string,
  ): Prisma.ConversationWhereInput {
    const where: Prisma.ConversationWhereInput = {};

    switch (query.filter) {
      case 'mine':
        where.assigneeId = viewerId;
        break;
      case 'unassigned':
        where.assigneeId = null;
        break;
      default:
        break;
    }

    // Sem status explícito, as abas mostram só o que está aberto — resolvidas
    // poluiriam a fila de trabalho.
    where.status = query.status ?? 'open';

    if (query.inboxId) {
      where.inboxId = query.inboxId;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.search) {
      const term = query.search.trim();
      where.contact = {
        OR: [
          { profileName: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
          { waId: { contains: term } },
        ],
      };
    }

    return where;
  }

  private toDto(conversation: ConversationRecord): ConversationDto {
    return {
      id: conversation.id,
      inboxId: conversation.inboxId,
      inboxName: conversation.inbox.name,
      contact: toContactDto(conversation.contact),
      status: conversation.status,
      priority: conversation.priority,
      assignee: conversation.assignee ? toUserDto(conversation.assignee) : null,
      teamId: conversation.teamId,
      teamName: conversation.team?.name ?? null,
      windowExpiresAt: conversation.windowExpiresAt?.toISOString() ?? null,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: conversation.lastMessagePreview,
      unreadCount: conversation.unreadCount,
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  toMessageDto(
    message: Message & { attachments: Attachment[]; author: User | null },
  ): MessageDto {
    const error = message.errorPayload as { message?: string } | null;

    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      type: message.type,
      origin: message.origin,
      status: message.status,
      content: message.content,
      payload: (message.payload ?? null) as Record<string, unknown> | null,
      replyToWaId: message.replyToWaId,
      author: message.author
        ? { id: message.author.id, name: message.author.name }
        : null,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        // Servida pela própria API: as URLs da Meta expiram em minutos.
        url: `${this.publicApiUrl}/api/media/${attachment.id}`,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        originalName: attachment.originalName,
        durationSeconds: attachment.durationSeconds,
        caption: attachment.caption,
      })),
      errorMessage: error?.message ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

export function toContactDto(contact: Contact): ContactDto {
  return {
    id: contact.id,
    waId: contact.waId,
    profileName: contact.profileName,
    displayName: contact.displayName,
    avatarUrl: contact.avatarUrl,
    // O nome editado pela equipe tem precedência: ela conhece o cliente melhor
    // do que o nome que ele configurou no aparelho.
    name: contact.displayName ?? contact.profileName ?? `+${contact.waId}`,
  };
}
