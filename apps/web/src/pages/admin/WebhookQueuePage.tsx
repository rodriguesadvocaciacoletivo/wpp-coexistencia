import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  WEBHOOK_STATUS_LABELS,
  isQueueHealthy,
  type WebhookEventDto,
  type WebhookQueueStatsDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { PageBody, PageHeader } from '../../components/PageHeader';
import { Button, Card, EmptyState, Spinner, cn } from '../../components/ui';

/**
 * Saúde da fila de webhooks e dead letter.
 *
 * A fila se resolve sozinha na maioria dos casos — falha, recua, tenta de novo.
 * Esta tela é para o que ela não resolve: o evento que esgotou as tentativas.
 * Sem ela, a dead letter seria uma tabela que ninguém abre, e cada linha ali é
 * uma mensagem de cliente que nunca chegou à equipe.
 */
export function WebhookQueuePage() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ['webhook-queue', 'stats'],
    queryFn: () => apiRequest<WebhookQueueStatsDto>('/webhooks/queue/stats'),
    refetchInterval: 15_000,
  });

  const eventsQuery = useQuery({
    queryKey: ['webhook-queue', 'events'],
    queryFn: () =>
      apiRequest<WebhookEventDto[]>('/webhooks/queue/events?status=dead'),
    refetchInterval: 30_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['webhook-queue'] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const retry = useMutation({
    mutationFn: (ids?: string[]) =>
      apiRequest<{ requeued: number }>('/webhooks/queue/retry', {
        method: 'POST',
        body: ids ? { ids } : {},
      }),
    onSuccess: (result) => {
      toast.success(
        result.requeued === 1
          ? '1 evento devolvido à fila.'
          : `${result.requeued} eventos devolvidos à fila.`,
      );
      invalidate();
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível reprocessar.',
      ),
  });

  const stats = statsQuery.data;
  const healthy = stats ? isQueueHealthy(stats) : true;

  return (
    <>
      <PageHeader
        title="Fila de webhooks"
        description="Eventos recebidos da Meta, do ACK ao processamento. Aqui aparece o que falhou e precisa de atenção."
        actions={
          <Button
            variant="secondary"
            loading={statsQuery.isFetching}
            onClick={() => invalidate()}
          >
            <RefreshCw className="size-4" aria-hidden />
            Atualizar
          </Button>
        }
      />

      <PageBody>
        {statsQuery.isPending && <Spinner />}

        {stats && (
          <>
            <div
              className={cn(
                'mb-6 flex items-start gap-3 rounded-xl border p-4',
                healthy
                  ? 'border-success-500/30 bg-success-500/10'
                  : 'border-warning-400/30 bg-warning-400/10',
              )}
            >
              {healthy ? (
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-success-400"
                  aria-hidden
                />
              ) : (
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-warning-400"
                  aria-hidden
                />
              )}
              <div>
                <p
                  className={cn(
                    'text-sm font-medium',
                    healthy ? 'text-success-400' : 'text-warning-400',
                  )}
                >
                  {healthy
                    ? 'Fila saudável'
                    : 'A fila precisa de atenção'}
                </p>
                <p className="mt-1 text-sm text-content-400">
                  {healthy
                    ? 'Nada parado e nenhum evento antigo aguardando processamento.'
                    : stats.dead > 0
                      ? 'Há eventos que esgotaram as tentativas. Verifique o erro e reprocesse depois de resolver a causa.'
                      : 'Há evento pendente há mais de 5 minutos. Confirme se o cron de /api/jobs/drain está rodando e se CRON_SECRET está configurada.'}
                </p>
              </div>
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Stat label="Na fila" value={stats.queued} />
              <Stat label="Processando" value={stats.processing} />
              <Stat
                label="Aguardando nova tentativa"
                value={stats.failed}
                hint="Falharam e voltam sozinhos, com recuo crescente."
              />
              <Stat
                label="Parados"
                value={stats.dead}
                tone={stats.dead > 0 ? 'warning' : undefined}
                hint="Esgotaram as tentativas. Só saem daqui por ação humana."
              />
              <Stat
                label="Processados na última hora"
                value={stats.processedLastHour}
              />
              <Stat
                label="Pendente mais antigo"
                value={
                  stats.oldestPendingSeconds === null
                    ? '—'
                    : formatAge(stats.oldestPendingSeconds)
                }
              />
            </div>
          </>
        )}

        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-content-100">
            Eventos parados
          </h2>
          {eventsQuery.data && eventsQuery.data.length > 0 && (
            <Button
              variant="secondary"
              loading={retry.isPending}
              onClick={() => retry.mutate(undefined)}
            >
              Reprocessar todos
            </Button>
          )}
        </div>

        {eventsQuery.isPending && <Spinner />}

        {eventsQuery.data?.length === 0 && (
          <EmptyState
            title="Nenhum evento parado"
            description="Tudo que chegou da Meta foi processado ou está a caminho disso."
          />
        )}

        <div className="flex flex-col gap-3">
          {eventsQuery.data?.map((event) => (
            <Card key={event.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-content-100">
                    {event.field}
                    <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[11px] font-normal text-content-400">
                      {WEBHOOK_STATUS_LABELS[event.status]}
                    </span>
                    <span className="text-[11px] font-normal text-content-400">
                      {event.attempts} tentativas
                    </span>
                  </p>

                  <p className="mt-1 text-xs text-content-400">
                    Recebido em {formatDate(event.createdAt)}
                  </p>

                  {event.lastError && (
                    <p className="mt-2 break-words rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">
                      {event.lastError}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="ghost"
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() =>
                      setExpanded(expanded === event.id ? null : event.id)
                    }
                  >
                    {expanded === event.id ? 'Ocultar' : 'Ver payload'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1.5 text-xs"
                    loading={retry.isPending}
                    onClick={() => retry.mutate([event.id])}
                  >
                    Reprocessar
                  </Button>
                </div>
              </div>

              {expanded === event.id && (
                <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-surface-950 p-3 text-[11px] text-content-300">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              )}
            </Card>
          ))}
        </div>
      </PageBody>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'warning';
}) {
  return (
    <Card>
      <p className="text-xs text-content-400">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold',
          tone === 'warning' ? 'text-warning-400' : 'text-content-100',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-content-400">{hint}</p>}
    </Card>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min`;
  }

  return `${Math.floor(seconds / 3600)}h`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
