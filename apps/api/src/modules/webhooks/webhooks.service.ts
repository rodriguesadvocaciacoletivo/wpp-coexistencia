import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BackgroundService } from '../../common/background/background.service';
import { logEvent } from '../../common/logging/structured';
import { TemplatesService } from '../templates/templates.service';
import { MessageIngestionService } from '../conversations/message-ingestion.service';
import { WebhookQueueService } from './webhook-queue.service';
import { buildEventKey, type WebhookPayload, type WebhookValue } from './webhook.types';

/** Quanto tempo um dreno pode ocupar antes de devolver o resto à fila. */
const DRAIN_BUDGET_MS = 20_000;
/** Eventos reservados por rodada. */
const BATCH_SIZE = 10;

/**
 * Recepção e processamento dos eventos da Meta.
 *
 * O fluxo é em duas etapas: persistir e responder, depois processar. Isso
 * mantém o ACK rápido e garante que um evento recebido não se perca se o
 * processamento falhar — ele fica no banco e volta pela fila.
 *
 * A fila vive no próprio Postgres, e não em um worker dedicado, porque a
 * aplicação roda em funções serverless: não há processo contínuo para hospedar
 * um consumidor. O dreno é disparado de dois lugares — logo após o ACK, para
 * a latência do caminho feliz, e por cron, como rede de segurança para o que
 * falhou e precisa de nova tentativa.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: MessageIngestionService,
    private readonly templates: TemplatesService,
    private readonly queue: WebhookQueueService,
    private readonly background: BackgroundService,
  ) {}

  async enqueue(body: unknown): Promise<void> {
    const payload = body as WebhookPayload;
    let created = 0;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const field = change.field ?? 'unknown';
        const value = change.value ?? {};

        for (const eventKey of buildEventKey(field, value)) {
          if (await this.persist(eventKey, field, entry.id, value)) {
            created += 1;
          }
        }
      }
    }

    if (created === 0) {
      return;
    }

    // Depois da resposta, não antes: o ACK da Meta não espera processamento.
    // O dreno pega da fila em vez de receber os ids recém-criados — assim
    // aproveita a viagem para levar junto o que ficou para trás.
    this.background.run('webhook-drain', () => this.drain());
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
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          eventKey,
          field,
          wabaId: wabaId ?? null,
          payload: value as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(`Evento duplicado descartado: ${eventKey}`);
        return false;
      }

      throw error;
    }
  }

  /**
   * Consome a fila até esvaziar ou estourar o orçamento de tempo.
   *
   * O orçamento existe porque a função serverless é morta ao atingir o teto de
   * execução. Parar antes e devolver o resto deixa os eventos disponíveis para
   * o próximo dreno, em vez de morrerem reservados no meio do caminho.
   */
  async drain(budgetMs = DRAIN_BUDGET_MS): Promise<{
    processed: number;
    failed: number;
  }> {
    const deadline = Date.now() + budgetMs;
    let processed = 0;
    let failed = 0;

    while (Date.now() < deadline) {
      const batch = await this.queue.claim(BATCH_SIZE);

      if (batch.length === 0) {
        break;
      }

      for (const event of batch) {
        const startedAt = Date.now();

        try {
          await this.dispatch(event.field, event.payload, event.wabaId);
          await this.queue.markProcessed(event.id, startedAt);
          processed += 1;
        } catch (error) {
          await this.queue.markFailed(
            event.id,
            event.attempts,
            error,
            startedAt,
          );
          failed += 1;
        }
      }
    }

    if (processed > 0 || failed > 0) {
      logEvent('info', 'webhook.drain', { processed, failed });
    }

    return { processed, failed };
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

  /**
   * Devolve eventos da dead letter à fila e drena na sequência.
   *
   * Reenfileira em vez de processar direto: assim o reprocessamento passa pela
   * mesma reserva e pelo mesmo recuo do fluxo normal, e o administrador não
   * consegue provocar dois processamentos simultâneos do mesmo evento clicando
   * duas vezes.
   */
  async retry(ids?: string[]): Promise<number> {
    const count = await this.queue.requeue(ids);

    if (count > 0) {
      this.background.run('webhook-drain-retry', () => this.drain());
    }

    return count;
  }
}
