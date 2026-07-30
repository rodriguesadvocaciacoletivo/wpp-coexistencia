import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { logEvent } from '../../common/logging/structured';
import type { WebhookValue } from './webhook.types';

/** Tentativas antes de mandar para a dead letter. */
export const MAX_ATTEMPTS = 5;

/**
 * Recuo entre tentativas: 20s, 40s, 80s, 160s… com teto de 1 hora.
 *
 * A falha típica é o destino fora do ar — banco reiniciando, Graph API
 * instável. Retentar em rajada só queima as cinco tentativas antes de ele
 * voltar. O jitter evita que uma rajada de eventos que falhou junto volte
 * toda no mesmo instante e derrube o destino de novo.
 */
export function backoffMs(attempts: number): number {
  const base = Math.min(2 ** attempts * 10_000, 3_600_000);
  return Math.round(base + Math.random() * base * 0.2);
}

/**
 * Tempo após o qual um evento reservado é considerado órfão.
 *
 * Maior que o teto de execução da função (30s na Vercel) com folga: se ainda
 * está reservado depois disso, quem reservou não existe mais.
 */
const ORPHAN_AFTER = "5 minutes";

export interface ClaimedEvent {
  id: string;
  field: string;
  wabaId: string | null;
  payload: WebhookValue;
  attempts: number;
}

export interface QueueStats {
  queued: number;
  processing: number;
  failed: number;
  dead: number;
  processedLastHour: number;
  /** Idade, em segundos, do evento pendente mais antigo. */
  oldestPendingSeconds: number | null;
}

@Injectable()
export class WebhookQueueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserva um lote de eventos para processamento.
   *
   * `FOR UPDATE SKIP LOCKED` é o ponto central: em serverless várias invocações
   * podem drenar ao mesmo tempo, e sem isso duas pegariam o mesmo evento. Com
   * ele, cada uma leva um conjunto disjunto e ninguém espera pela outra.
   *
   * A mesma consulta recolhe eventos `processing` antigos — órfãos de invocação
   * morta no meio. É o que garante que derrubar o processo durante uma rajada
   * não perca nada: ao próximo dreno eles voltam à fila.
   */
  async claim(limit: number): Promise<ClaimedEvent[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        field: string;
        waba_id: string | null;
        payload: WebhookValue;
        attempts: number;
      }>
    >(Prisma.sql`
      UPDATE webhook_events
      SET status = 'processing',
          locked_at = now(),
          attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM webhook_events
        WHERE (
                status IN ('queued', 'failed')
                AND (next_attempt_at IS NULL OR next_attempt_at <= now())
              )
           OR (
                status = 'processing'
                AND locked_at < now() - ${ORPHAN_AFTER}::interval
              )
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING id, field, waba_id, payload, attempts
    `);

    return rows.map((row) => ({
      id: row.id,
      field: row.field,
      wabaId: row.waba_id,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  async markProcessed(id: string, startedAt: number): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { id },
      data: {
        status: 'processed',
        processedAt: new Date(),
        lastError: null,
        lockedAt: null,
        nextAttemptAt: null,
      },
    });

    logEvent('info', 'webhook.processed', {
      eventId: id,
      durationMs: Date.now() - startedAt,
    });
  }

  /**
   * Registra a falha e agenda a próxima tentativa.
   *
   * Esgotadas as tentativas o evento vai para `dead` em vez de sumir: perder
   * mensagem de cliente em silêncio é pior do que deixá-la parada esperando
   * alguém olhar.
   */
  async markFailed(
    id: string,
    attempts: number,
    error: unknown,
    startedAt: number,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = attempts >= MAX_ATTEMPTS;
    const delay = backoffMs(attempts);

    await this.prisma.webhookEvent.update({
      where: { id },
      data: {
        status: exhausted ? 'dead' : 'failed',
        lastError: message.slice(0, 2000),
        lockedAt: null,
        nextAttemptAt: exhausted ? null : new Date(Date.now() + delay),
      },
    });

    logEvent(exhausted ? 'error' : 'warn', 'webhook.failed', {
      eventId: id,
      attempts,
      maxAttempts: MAX_ATTEMPTS,
      deadLettered: exhausted,
      retryInMs: exhausted ? null : delay,
      durationMs: Date.now() - startedAt,
      error: message,
    });
  }

  /** Devolve eventos à fila. Sem `ids`, todos os que estão em dead letter. */
  async requeue(ids?: string[]): Promise<number> {
    const result = await this.prisma.webhookEvent.updateMany({
      where: ids?.length
        ? { id: { in: ids }, status: { in: ['dead', 'failed'] } }
        : { status: 'dead' },
      data: { status: 'queued', attempts: 0, nextAttemptAt: null, lockedAt: null },
    });

    logEvent('info', 'webhook.requeued', { count: result.count });

    return result.count;
  }

  async stats(): Promise<QueueStats> {
    const [queued, processing, failed, dead, processedLastHour, oldest] =
      await this.prisma.$transaction([
        this.prisma.webhookEvent.count({ where: { status: 'queued' } }),
        this.prisma.webhookEvent.count({ where: { status: 'processing' } }),
        this.prisma.webhookEvent.count({ where: { status: 'failed' } }),
        this.prisma.webhookEvent.count({ where: { status: 'dead' } }),
        this.prisma.webhookEvent.count({
          where: { processedAt: { gte: new Date(Date.now() - 3_600_000) } },
        }),
        this.prisma.webhookEvent.findFirst({
          where: { status: { in: ['queued', 'failed'] } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);

    return {
      queued,
      processing,
      failed,
      dead,
      processedLastHour,
      oldestPendingSeconds: oldest
        ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000)
        : null,
    };
  }
}
