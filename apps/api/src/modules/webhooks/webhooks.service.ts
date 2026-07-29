import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { MessageIngestionService } from '../conversations/message-ingestion.service';
import { buildEventKey, type WebhookPayload, type WebhookValue } from './webhook.types';

const MAX_ATTEMPTS = 5;

/**
 * Recepção e processamento dos eventos da Meta.
 *
 * O fluxo é deliberadamente em duas etapas: persistir e responder, depois
 * processar. Isso mantém o ACK rápido e, mais importante, garante que um evento
 * já recebido não se perca se o processamento falhar — ele fica no banco e pode
 * ser retentado.
 *
 * O disparo do processamento é in-process nesta fase. A Fase 6 troca esta
 * chamada por um job no BullMQ, com retry exponencial e dead letter, sem mexer
 * na lógica de processamento em si.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: MessageIngestionService,
    private readonly templates: TemplatesService,
  ) {}

  async enqueue(body: unknown): Promise<void> {
    const payload = body as WebhookPayload;
    const created: string[] = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const field = change.field ?? 'unknown';
        const value = change.value ?? {};

        for (const eventKey of buildEventKey(field, value)) {
          const id = await this.persist(eventKey, field, entry.id, value);

          if (id) {
            created.push(id);
          }
        }
      }
    }

    if (created.length === 0) {
      return;
    }

    // Dispara sem aguardar: a resposta HTTP não pode esperar o processamento.
    setImmediate(() => {
      void this.processPending(created);
    });
  }

  /**
   * Grava o evento. Duplicados são descartados em silêncio — a Meta reentrega
   * o que não recebe 200 a tempo, e isso é esperado, não um erro.
   */
  private async persist(
    eventKey: string,
    field: string,
    wabaId: string | undefined,
    value: WebhookValue,
  ): Promise<string | null> {
    try {
      const event = await this.prisma.webhookEvent.create({
        data: {
          eventKey,
          field,
          wabaId: wabaId ?? null,
          payload: value as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      return event.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(`Evento duplicado descartado: ${eventKey}`);
        return null;
      }

      throw error;
    }
  }

  async processPending(eventIds: string[]): Promise<void> {
    for (const id of eventIds) {
      await this.processOne(id);
    }
  }

  async processOne(eventId: string): Promise<void> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });

    if (!event || event.status === 'processed') {
      return;
    }

    await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: 'processing', attempts: { increment: 1 } },
    });

    try {
      await this.dispatch(
        event.field,
        event.payload as unknown as WebhookValue,
        event.wabaId,
      );

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: 'processed', processedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = event.attempts + 1;

      // Esgotadas as tentativas, o evento vai para dead letter em vez de ser
      // descartado — perder uma mensagem de cliente em silêncio é pior do que
      // deixá-la parada esperando intervenção.
      const status = attempts >= MAX_ATTEMPTS ? 'dead' : 'failed';

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status, lastError: message },
      });

      this.logger.error(
        `Falha ao processar evento ${eventId} (tentativa ${attempts}/${MAX_ATTEMPTS}): ${message}`,
      );
    }
  }

  private async dispatch(
    field: string,
    value: WebhookValue,
    wabaId: string | null,
  ): Promise<void> {
    switch (field) {
      case 'messages':
        // O mesmo campo entrega mensagens novas e atualizações de status.
        if (value.messages?.length) {
          await this.ingestion.ingestMessages(value);
        }
        if (value.statuses?.length) {
          await this.ingestion.applyStatuses(value);
        }
        return;

      case 'message_template_status_update':
        // Em eventos de template o identificador da entrada é a WABA — não há
        // `metadata.phone_number_id` como nos eventos de mensagem.
        await this.templates.applyStatusUpdate(
          wabaId ?? '',
          value.message_template_name ?? '',
          value.message_template_language ?? '',
          value.event ?? 'PENDING',
          value.reason,
        );
        return;

      default:
        this.logger.log(`Campo de webhook sem tratamento nesta fase: ${field}`);
    }
  }

  /** Reprocessamento manual — usado pela tela de administração na Fase 6. */
  async retryFailed(): Promise<number> {
    const failed = await this.prisma.webhookEvent.findMany({
      where: { status: { in: ['failed', 'dead'] } },
      select: { id: true },
      take: 100,
    });

    for (const event of failed) {
      await this.processOne(event.id);
    }

    return failed.length;
  }
}
