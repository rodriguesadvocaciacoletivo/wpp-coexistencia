import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Plus,
  Smartphone,
} from 'lucide-react';
import {
  CONNECTION_STATUS_LABELS,
  ONBOARDING_TYPE_LABELS,
  qualityRatingLabel,
  type InboxDto,
} from '@coexistente/shared';
import { apiRequest } from '../../lib/api';
import { PageBody, PageHeader } from '../../components/PageHeader';
import { Badge, Button, EmptyState, Spinner } from '../../components/ui';

export function InboxesPage() {
  const inboxesQuery = useQuery({
    queryKey: ['inboxes'],
    queryFn: () => apiRequest<InboxDto[]>('/inboxes'),
  });

  return (
    <>
      <PageHeader
        title="Caixas de entrada"
        description="Números de WhatsApp conectados à plataforma pela Cloud API oficial."
        actions={
          <Link to="/configuracoes/caixas/nova">
            <Button>
              <Plus className="size-4" aria-hidden />
              Nova caixa de entrada
            </Button>
          </Link>
        }
      />

      <PageBody>
        {inboxesQuery.isPending && <Spinner />}

        {inboxesQuery.isError && (
          <p className="text-sm text-danger-400">
            Não foi possível carregar as caixas de entrada.
          </p>
        )}

        {inboxesQuery.data?.length === 0 && (
          <EmptyState
            title="Nenhuma caixa de entrada conectada"
            description="Conecte um número da WhatsApp Cloud API para começar a receber conversas. Você vai precisar do ID do número, do ID da conta do WhatsApp Business e de um System User Token."
            action={
              <Link to="/configuracoes/caixas/nova">
                <Button variant="secondary">Conectar primeiro número</Button>
              </Link>
            }
          />
        )}

        {inboxesQuery.data && inboxesQuery.data.length > 0 && (
          <div className="flex flex-col gap-3">
            {inboxesQuery.data.map((inbox) => (
              <Link
                key={inbox.id}
                to={`/configuracoes/caixas/${inbox.id}`}
                className="flex items-center gap-4 rounded-xl border border-surface-800 bg-surface-900 px-5 py-4 transition-colors hover:border-surface-700 hover:bg-surface-850"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-800">
                  <Smartphone className="size-5 text-content-300" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-content-100">
                      {inbox.name}
                    </h3>
                    <ConnectionBadge inbox={inbox} />
                  </div>
                  <p className="mt-1 truncate text-sm text-content-400">
                    {inbox.phoneNumber}
                    {inbox.verifiedName ? ` · ${inbox.verifiedName}` : ''}
                    {' · '}
                    {ONBOARDING_TYPE_LABELS[inbox.onboardingType]}
                  </p>
                  {inbox.connectionError && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-danger-400">
                      {inbox.connectionError}
                    </p>
                  )}
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-sm text-content-200">
                    {inbox.templateCount === 1
                      ? '1 template'
                      : `${inbox.templateCount} templates`}
                  </p>
                  <p className="mt-1 text-xs text-content-400">
                    Qualidade: {qualityRatingLabel(inbox.qualityRating)}
                  </p>
                </div>

                <ChevronRight className="size-4 shrink-0 text-content-400" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

export function ConnectionBadge({ inbox }: { inbox: InboxDto }) {
  const label = CONNECTION_STATUS_LABELS[inbox.connectionStatus];

  if (inbox.connectionStatus === 'connected') {
    return (
      <Badge tone="success">
        <CheckCircle2 className="mr-1 size-3" aria-hidden />
        {label}
      </Badge>
    );
  }

  if (inbox.connectionStatus === 'error') {
    return (
      <Badge tone="danger">
        <AlertTriangle className="mr-1 size-3" aria-hidden />
        {label}
      </Badge>
    );
  }

  return (
    <Badge tone="warning">
      <Clock className="mr-1 size-3" aria-hidden />
      {label}
    </Badge>
  );
}
