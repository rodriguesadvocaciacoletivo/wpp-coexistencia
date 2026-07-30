export const WEBHOOK_EVENT_STATUSES = [
  'queued',
  'processing',
  'processed',
  'failed',
  'dead',
] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const WEBHOOK_STATUS_LABELS: Record<WebhookEventStatus, string> = {
  queued: 'Na fila',
  processing: 'Processando',
  processed: 'Processado',
  failed: 'Aguardando nova tentativa',
  dead: 'Parado',
};

/** Saúde da fila, para a tela de administração. */
export interface WebhookQueueStatsDto {
  queued: number;
  processing: number;
  /** Falhou e vai ser retentado sozinho. */
  failed: number;
  /** Esgotou as tentativas. Só sai daqui por ação humana. */
  dead: number;
  processedLastHour: number;
  /** Idade do pendente mais antigo, em segundos. Nulo se a fila está vazia. */
  oldestPendingSeconds: number | null;
}

export interface WebhookEventDto {
  id: string;
  eventKey: string;
  field: string;
  wabaId: string | null;
  status: WebhookEventStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  processedAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface RetryWebhookEventsInput {
  /** Sem ids, devolve à fila tudo que está em dead letter. */
  ids?: string[];
}

/**
 * A fila está saudável?
 *
 * Um evento parado é sempre digno de atenção — chegou da Meta e não virou
 * mensagem na tela de ninguém. Pendência acumulada só preocupa quando é
 * antiga: dezenas de eventos recém-chegados são uma rajada normal, enquanto um
 * único evento parado há dez minutos indica que o dreno não está rodando.
 */
export function isQueueHealthy(stats: WebhookQueueStatsDto): boolean {
  return (
    stats.dead === 0 &&
    (stats.oldestPendingSeconds === null || stats.oldestPendingSeconds < 300)
  );
}
