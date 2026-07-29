import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Template, type TemplateCategory, type TemplateStatus } from '@prisma/client';
import type {
  TemplateComponent,
  TemplateDto,
  TemplateSyncResultDto,
} from '@coexistente/shared';
import { extractVariables } from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { MetaGraphService } from '../meta/meta-graph.service';
import { MetaApiError, toHttpException } from '../meta/meta.errors';
import type { GraphTemplate } from '../meta/meta.types';
import type { ActorContext } from '../users/users.service';
import type { CreateTemplateDto } from './dto/templates.dto';

/**
 * Serviço de templates.
 *
 * Não depende de InboxesService — a dependência é ao contrário, e fechar o
 * ciclo criaria acoplamento circular. Aqui o acesso à caixa é direto pelo
 * Prisma, só para ler credenciais e identificadores.
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly meta: MetaGraphService,
    private readonly audit: AuditService,
  ) {}

  async listByInbox(inboxId: string): Promise<TemplateDto[]> {
    await this.requireInbox(inboxId);

    const templates = await this.prisma.template.findMany({
      where: { inboxId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return templates.map(toTemplateDto);
  }

  /**
   * Sincroniza os templates da WABA com o banco.
   *
   * A Meta é a fonte de verdade: o que sumiu de lá some daqui. Um template
   * excluído no WhatsApp Manager que continuasse aparecendo na lista levaria o
   * agente a tentar enviar algo que a Meta vai recusar.
   */
  async sync(inboxId: string): Promise<TemplateSyncResultDto> {
    const inbox = await this.requireInbox(inboxId);
    const token = this.crypto.decrypt(inbox.tokenEncrypted);

    let remote: GraphTemplate[];

    try {
      remote = await this.meta.listAllTemplates(inbox.wabaId, token);
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw toHttpException(error);
      }
      throw error;
    }

    const existing = await this.prisma.template.findMany({ where: { inboxId } });
    const existingByKey = new Map(
      existing.map((template) => [keyOf(template.name, template.language), template]),
    );

    const syncedAt = new Date();
    let created = 0;
    let updated = 0;

    for (const template of remote) {
      const key = keyOf(template.name, template.language);
      const data = {
        metaId: template.id,
        category: normalizeCategory(template.category),
        status: normalizeStatus(template.status),
        components: (template.components ?? []) as unknown as Prisma.InputJsonValue,
        rejectedReason: template.rejected_reason ?? null,
        qualityScore: template.quality_score?.score ?? null,
        syncedAt,
      };

      if (existingByKey.has(key)) {
        await this.prisma.template.update({
          where: {
            inboxId_name_language: {
              inboxId,
              name: template.name,
              language: template.language,
            },
          },
          data,
        });
        updated += 1;
      } else {
        await this.prisma.template.create({
          data: { inboxId, name: template.name, language: template.language, ...data },
        });
        created += 1;
      }

      existingByKey.delete(key);
    }

    // O que sobrou no mapa não existe mais na Meta.
    const stale = [...existingByKey.values()];

    if (stale.length > 0) {
      await this.prisma.template.deleteMany({
        where: { id: { in: stale.map((template) => template.id) } },
      });
    }

    await this.prisma.inbox.update({
      where: { id: inboxId },
      data: { templatesSyncedAt: syncedAt },
    });

    this.logger.log(
      `Caixa ${inboxId}: ${remote.length} templates sincronizados (${created} novos, ${updated} atualizados, ${stale.length} removidos).`,
    );

    return {
      synced: remote.length,
      created,
      updated,
      removed: stale.length,
      syncedAt: syncedAt.toISOString(),
    };
  }

  /**
   * Cria um template na WABA.
   *
   * Além do uso operacional, é a evidência que o App Review espera para
   * `whatsapp_business_management` — a permissão é justificada por gerenciar
   * números e templates dos clientes. Ver docs/02-app-review-roteiro.md.
   */
  async create(
    inboxId: string,
    input: CreateTemplateDto,
    actor: ActorContext,
  ): Promise<TemplateDto> {
    const inbox = await this.requireInbox(inboxId);

    // A validação do payload vem antes de tocar nas credenciais: é mais barata,
    // e um erro de preenchimento deve responder 400 com o motivo, não 500 por
    // falha ao decifrar um token que sequer seria usado.
    const variables = extractVariables(input.body);
    const examples = input.bodyExamples ?? [];

    if (variables.length > 0 && examples.length !== variables.length) {
      throw new BadRequestException(
        `O corpo usa ${variables.length} variável(is). Informe um valor de exemplo para cada uma — a Meta recusa templates com variáveis sem exemplo.`,
      );
    }

    // A Meta exige numeração sequencial começando em 1. {{1}} e {{3}} sem o
    // {{2}} é recusado, com mensagem que não explica o motivo.
    const expected = variables.every((value, index) => value === index + 1);

    if (!expected) {
      throw new BadRequestException(
        'As variáveis devem ser numeradas em sequência a partir de {{1}}, sem pular números.',
      );
    }

    const token = this.crypto.decrypt(inbox.tokenEncrypted);

    const components: Record<string, unknown>[] = [];

    if (input.headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: input.headerText });
    }

    components.push({
      type: 'BODY',
      text: input.body,
      ...(variables.length > 0 ? { example: { body_text: [examples] } } : {}),
    });

    if (input.footerText) {
      components.push({ type: 'FOOTER', text: input.footerText });
    }

    try {
      const response = await this.meta.createTemplate(inbox.wabaId, token, {
        name: input.name,
        language: input.language,
        category: input.category,
        components,
      });

      const template = await this.prisma.template.upsert({
        where: {
          inboxId_name_language: {
            inboxId,
            name: input.name,
            language: input.language,
          },
        },
        create: {
          inboxId,
          metaId: response.id,
          name: input.name,
          language: input.language,
          category: normalizeCategory(response.category ?? input.category),
          status: normalizeStatus(response.status ?? 'PENDING'),
          components: components as unknown as Prisma.InputJsonValue,
        },
        update: {
          metaId: response.id,
          category: normalizeCategory(response.category ?? input.category),
          status: normalizeStatus(response.status ?? 'PENDING'),
          components: components as unknown as Prisma.InputJsonValue,
          rejectedReason: null,
        },
      });

      await this.audit.record({
        userId: actor.actorId,
        action: 'template.created',
        entity: 'template',
        entityId: template.id,
        metadata: {
          inboxId,
          name: input.name,
          language: input.language,
          category: input.category,
        },
        ipAddress: actor.ipAddress,
      });

      return toTemplateDto(template);
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw toHttpException(error);
      }
      throw error;
    }
  }

  async remove(
    inboxId: string,
    templateId: string,
    actor: ActorContext,
  ): Promise<void> {
    const inbox = await this.requireInbox(inboxId);
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, inboxId },
    });

    if (!template) {
      throw new NotFoundException('Template não encontrado.');
    }

    const token = this.crypto.decrypt(inbox.tokenEncrypted);

    try {
      await this.meta.deleteTemplate(inbox.wabaId, token, template.name);
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw toHttpException(error);
      }
      throw error;
    }

    // A Meta remove todos os idiomas de um mesmo nome — o espelho local segue
    // a mesma regra, senão sobrariam registros apontando para o que não existe.
    await this.prisma.template.deleteMany({
      where: { inboxId, name: template.name },
    });

    await this.audit.record({
      userId: actor.actorId,
      action: 'template.deleted',
      entity: 'template',
      entityId: templateId,
      metadata: { inboxId, name: template.name },
      ipAddress: actor.ipAddress,
    });
  }

  /**
   * Atualiza o status a partir do webhook `message_template_status_update`.
   * Consumido pela Fase 3, quando o receptor de webhooks existir.
   */
  async applyStatusUpdate(
    wabaId: string,
    templateName: string,
    language: string,
    status: string,
    reason?: string,
  ): Promise<boolean> {
    const inbox = await this.prisma.inbox.findFirst({
      where: { wabaId, deletedAt: null },
    });

    if (!inbox) {
      return false;
    }

    const result = await this.prisma.template.updateMany({
      where: { inboxId: inbox.id, name: templateName, language },
      data: {
        status: normalizeStatus(status),
        rejectedReason: reason ?? null,
        syncedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  private async requireInbox(inboxId: string) {
    const inbox = await this.prisma.inbox.findFirst({
      where: { id: inboxId, deletedAt: null },
    });

    if (!inbox) {
      throw new NotFoundException('Caixa de entrada não encontrada.');
    }

    return inbox;
  }
}

function keyOf(name: string, language: string): string {
  return `${name}::${language}`;
}

function normalizeCategory(value: string): TemplateCategory {
  const upper = value?.toUpperCase();
  return upper === 'MARKETING' || upper === 'AUTHENTICATION'
    ? (upper as TemplateCategory)
    : 'UTILITY';
}

/**
 * A Meta acrescenta status novos sem aviso. Cair em PENDING no desconhecido é
 * o comportamento seguro: PENDING não é enviável, então um status novo nunca
 * libera envio por engano.
 */
function normalizeStatus(value: string): TemplateStatus {
  const known: TemplateStatus[] = [
    'APPROVED',
    'PENDING',
    'REJECTED',
    'PAUSED',
    'DISABLED',
    'IN_APPEAL',
    'PENDING_DELETION',
    'DELETED',
    'LIMIT_EXCEEDED',
  ];

  const upper = value?.toUpperCase() as TemplateStatus;
  return known.includes(upper) ? upper : 'PENDING';
}

function toTemplateDto(template: Template): TemplateDto {
  return {
    id: template.id,
    inboxId: template.inboxId,
    metaId: template.metaId,
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    components: (template.components ?? []) as unknown as TemplateComponent[],
    rejectedReason: template.rejectedReason,
    qualityScore: template.qualityScore,
    syncedAt: template.syncedAt.toISOString(),
  };
}
