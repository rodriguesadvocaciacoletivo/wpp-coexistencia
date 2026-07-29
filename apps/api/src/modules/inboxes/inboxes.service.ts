import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Inbox } from '@prisma/client';
import type {
  InboxDetailDto,
  InboxDto,
  InboxValidationDto,
} from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { toUserDto } from '../../common/mappers/user.mapper';
import { MetaGraphService } from '../meta/meta-graph.service';
import { MetaApiError, describeMetaError, toHttpException } from '../meta/meta.errors';
import { resolveThroughputMps } from '../meta/meta.types';
import type { ActorContext } from '../users/users.service';
import { TemplatesService } from '../templates/templates.service';
import type {
  CreateInboxDto,
  SetInboxMembersDto,
  UpdateInboxDto,
  ValidateInboxDto,
} from './dto/inboxes.dto';

type InboxWithCounts = Inbox & {
  _count?: { templates: number; members: number };
};

@Injectable()
export class InboxesService {
  private readonly logger = new Logger(InboxesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly meta: MetaGraphService,
    private readonly templates: TemplatesService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Leitura
  // ---------------------------------------------------------------------------

  async list(): Promise<InboxDto[]> {
    const inboxes = await this.prisma.inbox.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { templates: true, members: true } } },
    });

    return inboxes.map((inbox) => this.toDto(inbox));
  }

  async findOne(id: string): Promise<InboxDetailDto> {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { templates: true, members: true } },
        members: { include: { user: true }, orderBy: { user: { name: 'asc' } } },
      },
    });

    if (!inbox) {
      throw new NotFoundException('Caixa de entrada não encontrada.');
    }

    return {
      ...this.toDto(inbox),
      members: inbox.members.map((member) => toUserDto(member.user)),
    };
  }

  // ---------------------------------------------------------------------------
  // Validação e criação
  // ---------------------------------------------------------------------------

  /**
   * Confere as credenciais contra a Graph API antes de qualquer escrita.
   *
   * O wizard chama isto no passo anterior ao "salvar", para que o administrador
   * veja o nome do número e da empresa e confirme que conectou o ativo certo —
   * IDs numéricos de 15 dígitos são fáceis de trocar entre si.
   */
  async validateCredentials(input: ValidateInboxDto): Promise<InboxValidationDto> {
    try {
      const [phoneNumber, waba] = await Promise.all([
        this.meta.getPhoneNumber(input.phoneNumberId, input.token),
        this.meta.getWaba(input.wabaId, input.token),
      ]);

      // Cada ID isolado pode ser válido e ainda assim pertencer a empresas
      // diferentes. Sem esta conferência, a caixa é criada e só falha no
      // primeiro envio, com um erro que não aponta para a causa.
      const numbers = await this.meta.listPhoneNumbers(input.wabaId, input.token);
      const belongs = numbers.some((number) => number.id === input.phoneNumberId);

      let templateCount: number | undefined;
      try {
        templateCount = (await this.meta.listAllTemplates(input.wabaId, input.token)).length;
      } catch {
        // Não conseguir contar templates não invalida a conexão.
        templateCount = undefined;
      }

      return {
        valid: belongs,
        message: belongs
          ? 'Credenciais válidas. O número pertence à conta informada.'
          : 'O token e os IDs são válidos, mas este número não pertence à conta do WhatsApp Business informada. Confira os dois IDs.',
        phoneNumber: {
          displayPhoneNumber: phoneNumber.display_phone_number ?? null,
          verifiedName: phoneNumber.verified_name ?? null,
          qualityRating: phoneNumber.quality_rating ?? null,
          codeVerificationStatus: phoneNumber.code_verification_status ?? null,
          platformType: phoneNumber.platform_type ?? null,
        },
        waba: {
          name: waba.name ?? null,
          reviewStatus: waba.account_review_status ?? null,
        },
        phoneBelongsToWaba: belongs,
        templateCount,
      };
    } catch (error) {
      if (error instanceof MetaApiError) {
        return { valid: false, message: describeMetaError(error) };
      }

      throw error;
    }
  }

  /**
   * Cria a caixa de entrada no modo `manual` (Cloud API pura).
   *
   * O modo `coexistence` não passa por aqui: ele exige Embedded Signup e só
   * fica disponível após a aprovação como Tech Provider (ADR 001).
   */
  async create(input: CreateInboxDto, actor: ActorContext): Promise<InboxDetailDto> {
    const existing = await this.prisma.inbox.findUnique({
      where: { phoneNumberId: input.phoneNumberId },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        'Este número já está conectado a outra caixa de entrada.',
      );
    }

    const validation = await this.validateCredentials(input);

    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }

    const phoneNumber = await this.meta.getPhoneNumber(input.phoneNumberId, input.token);
    const waba = await this.meta.getWaba(input.wabaId, input.token);

    const data = {
      name: input.name,
      phoneNumber: input.phoneNumber,
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      tokenEncrypted: this.crypto.encrypt(input.token),
      tokenType: 'system_user' as const,
      onboardingType: 'manual' as const,
      connectionStatus: 'connected' as const,
      connectionError: null,
      lastValidatedAt: new Date(),
      throughputLimitMps: resolveThroughputMps(phoneNumber, false),
      verifiedName: phoneNumber.verified_name ?? null,
      qualityRating: phoneNumber.quality_rating ?? null,
      messagingTier: phoneNumber.messaging_limit_tier ?? null,
      wabaName: waba.name ?? null,
      wabaReviewStatus: waba.account_review_status ?? null,
      deletedAt: null,
    };

    // Reaproveita o registro de uma caixa excluída para o mesmo número, em vez
    // de violar a unicidade de phone_number_id.
    const inbox = existing
      ? await this.prisma.inbox.update({ where: { id: existing.id }, data })
      : await this.prisma.inbox.create({ data });

    if (input.memberIds?.length) {
      await this.replaceMembers(inbox.id, input.memberIds);
    }

    // Assinatura de webhooks e sync de templates não abortam a criação: a caixa
    // conectada com sync pendente é um estado recuperável por um clique, e
    // desfazer tudo aqui obrigaria o administrador a repetir o wizard inteiro.
    await this.subscribeWebhooks(inbox.id, input.wabaId, input.token);
    await this.syncTemplatesQuietly(inbox.id);

    await this.audit.record({
      userId: actor.actorId,
      action: 'inbox.created',
      entity: 'inbox',
      entityId: inbox.id,
      metadata: {
        name: inbox.name,
        phoneNumberId: inbox.phoneNumberId,
        wabaId: inbox.wabaId,
        onboardingType: inbox.onboardingType,
      },
      ipAddress: actor.ipAddress,
    });

    return this.findOne(inbox.id);
  }

  // ---------------------------------------------------------------------------
  // Atualização
  // ---------------------------------------------------------------------------

  async update(
    id: string,
    input: UpdateInboxDto,
    actor: ActorContext,
  ): Promise<InboxDetailDto> {
    const inbox = await this.requireInbox(id);

    const changes: Prisma.InboxUpdateInput = {};

    if (input.name) {
      changes.name = input.name;
    }

    // Trocar o token revalida a conexão — aceitar um token novo sem conferir
    // deixaria a caixa marcada como conectada sobre uma credencial inválida.
    if (input.token) {
      const validation = await this.validateCredentials({
        phoneNumberId: inbox.phoneNumberId,
        wabaId: inbox.wabaId,
        token: input.token,
      });

      if (!validation.valid) {
        throw new BadRequestException(validation.message);
      }

      changes.tokenEncrypted = this.crypto.encrypt(input.token);
      changes.connectionStatus = 'connected';
      changes.connectionError = null;
      changes.lastValidatedAt = new Date();
    }

    await this.prisma.inbox.update({ where: { id }, data: changes });

    if (input.memberIds) {
      await this.replaceMembers(id, input.memberIds);
    }

    if (input.token) {
      await this.subscribeWebhooks(id, inbox.wabaId, input.token);
      await this.syncTemplatesQuietly(id);
    }

    await this.audit.record({
      userId: actor.actorId,
      action: 'inbox.updated',
      entity: 'inbox',
      entityId: id,
      metadata: { nameChanged: Boolean(input.name), tokenRotated: Boolean(input.token) },
      ipAddress: actor.ipAddress,
    });

    return this.findOne(id);
  }

  async setMembers(
    id: string,
    input: SetInboxMembersDto,
    actor: ActorContext,
  ): Promise<InboxDetailDto> {
    await this.requireInbox(id);

    if (input.userIds.length > 0) {
      const found = await this.prisma.user.count({
        where: { id: { in: input.userIds } },
      });

      if (found !== input.userIds.length) {
        throw new BadRequestException('Um ou mais agentes informados não existem.');
      }
    }

    await this.replaceMembers(id, input.userIds);

    await this.audit.record({
      userId: actor.actorId,
      action: 'inbox.members_updated',
      entity: 'inbox',
      entityId: id,
      metadata: { memberCount: input.userIds.length },
      ipAddress: actor.ipAddress,
    });

    return this.findOne(id);
  }

  /** Revalida a conexão contra a Graph API e atualiza os dados espelhados. */
  async revalidate(id: string, actor?: ActorContext): Promise<InboxDetailDto> {
    const inbox = await this.requireInbox(id);
    const token = this.crypto.decrypt(inbox.tokenEncrypted);

    try {
      const [phoneNumber, waba] = await Promise.all([
        this.meta.getPhoneNumber(inbox.phoneNumberId, token),
        this.meta.getWaba(inbox.wabaId, token),
      ]);

      await this.prisma.inbox.update({
        where: { id },
        data: {
          connectionStatus: 'connected',
          connectionError: null,
          lastValidatedAt: new Date(),
          throughputLimitMps: resolveThroughputMps(
            phoneNumber,
            inbox.onboardingType === 'coexistence',
          ),
          verifiedName: phoneNumber.verified_name ?? null,
          qualityRating: phoneNumber.quality_rating ?? null,
          messagingTier: phoneNumber.messaging_limit_tier ?? null,
          wabaName: waba.name ?? null,
          wabaReviewStatus: waba.account_review_status ?? null,
        },
      });
    } catch (error) {
      if (error instanceof MetaApiError) {
        await this.markAsFailed(id, describeMetaError(error));

        if (actor) {
          throw toHttpException(error);
        }
      } else {
        throw error;
      }
    }

    return this.findOne(id);
  }

  /** Soft delete: histórico e conversas seguem consultáveis. */
  async remove(id: string, actor: ActorContext): Promise<void> {
    const inbox = await this.requireInbox(id);

    await this.prisma.inbox.update({
      where: { id },
      data: { deletedAt: new Date(), connectionStatus: 'pending' },
    });

    await this.audit.record({
      userId: actor.actorId,
      action: 'inbox.deleted',
      entity: 'inbox',
      entityId: id,
      metadata: { name: inbox.name, phoneNumberId: inbox.phoneNumberId },
      ipAddress: actor.ipAddress,
    });
  }

  // ---------------------------------------------------------------------------
  // Apoio
  // ---------------------------------------------------------------------------

  /** Token em claro para uso interno. Nunca exposto por controller. */
  async resolveToken(id: string): Promise<string> {
    const inbox = await this.requireInbox(id);
    return this.crypto.decrypt(inbox.tokenEncrypted);
  }

  async markAsFailed(id: string, reason: string): Promise<void> {
    await this.prisma.inbox.update({
      where: { id },
      data: {
        connectionStatus: 'error',
        connectionError: reason.slice(0, 500),
        lastValidatedAt: new Date(),
      },
    });

    this.logger.warn(`Caixa ${id} marcada com erro de conexão: ${reason}`);
  }

  private async requireInbox(id: string): Promise<Inbox> {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id, deletedAt: null },
    });

    if (!inbox) {
      throw new NotFoundException('Caixa de entrada não encontrada.');
    }

    return inbox;
  }

  private async replaceMembers(inboxId: string, userIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.inboxMember.deleteMany({ where: { inboxId } }),
      this.prisma.inboxMember.createMany({
        data: userIds.map((userId) => ({ inboxId, userId })),
      }),
    ]);
  }

  private async subscribeWebhooks(
    inboxId: string,
    wabaId: string,
    token: string,
  ): Promise<void> {
    try {
      await this.meta.subscribeApp(wabaId, token);

      await this.prisma.inbox.update({
        where: { id: inboxId },
        data: { webhookSubscribedAt: new Date() },
      });
    } catch (error) {
      const reason =
        error instanceof MetaApiError
          ? describeMetaError(error)
          : 'Falha ao assinar os webhooks na conta do WhatsApp Business.';

      this.logger.error(`Caixa ${inboxId}: ${reason}`);

      await this.prisma.inbox.update({
        where: { id: inboxId },
        data: { connectionError: reason.slice(0, 500) },
      });
    }
  }

  private async syncTemplatesQuietly(inboxId: string): Promise<void> {
    try {
      await this.templates.sync(inboxId);
    } catch (error) {
      this.logger.warn(
        `Caixa ${inboxId}: sincronização inicial de templates falhou — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private toDto(inbox: InboxWithCounts): InboxDto {
    return {
      id: inbox.id,
      name: inbox.name,
      phoneNumber: inbox.phoneNumber,
      phoneNumberId: inbox.phoneNumberId,
      wabaId: inbox.wabaId,
      onboardingType: inbox.onboardingType,
      connectionStatus: inbox.connectionStatus,
      connectionError: inbox.connectionError,
      lastValidatedAt: inbox.lastValidatedAt?.toISOString() ?? null,
      throughputLimitMps: inbox.throughputLimitMps,
      verifiedName: inbox.verifiedName,
      qualityRating: inbox.qualityRating,
      messagingTier: inbox.messagingTier,
      wabaName: inbox.wabaName,
      wabaReviewStatus: inbox.wabaReviewStatus,
      webhookSubscribedAt: inbox.webhookSubscribedAt?.toISOString() ?? null,
      templatesSyncedAt: inbox.templatesSyncedAt?.toISOString() ?? null,
      templateCount: inbox._count?.templates ?? 0,
      memberCount: inbox._count?.members ?? 0,
      createdAt: inbox.createdAt.toISOString(),
      // tokenEncrypted nunca entra aqui — este mapeamento é a garantia de que
      // o token não vaza por nenhuma rota.
    };
  }
}
