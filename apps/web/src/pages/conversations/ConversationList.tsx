import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import {
  CONVERSATION_FILTERS,
  FILTER_LABELS,
  type ConversationCountsDto,
  type ConversationDto,
  type ConversationFilter,
  type InboxDto,
  type Paginated,
} from '@coexistente/shared';
import { apiRequest } from '../../lib/api';
import { Input, Select, Spinner, cn } from '../../components/ui';

export function ConversationList({
  filter,
  onFilterChange,
  inboxId,
  onInboxChange,
  search,
  onSearchChange,
  selectedId,
  onSelect,
}: {
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  inboxId: string;
  onInboxChange: (inboxId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  selectedId: string | null;
  onSelect: (conversation: ConversationDto) => void;
}) {
  const countsQuery = useQuery({
    queryKey: ['conversation-counts'],
    queryFn: () => apiRequest<ConversationCountsDto>('/conversations/counts'),
    refetchInterval: 60_000,
  });

  const inboxesQuery = useQuery({
    queryKey: ['inboxes'],
    queryFn: () => apiRequest<InboxDto[]>('/inboxes'),
  });

  const conversationsQuery = useQuery({
    queryKey: ['conversations', filter, inboxId, search],
    queryFn: () => {
      const params = new URLSearchParams({ filter });

      if (inboxId) {
        params.set('inboxId', inboxId);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }

      return apiRequest<Paginated<ConversationDto>>(
        `/conversations?${params.toString()}`,
      );
    },
  });

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-surface-800 bg-surface-900">
      <div className="border-b border-surface-800 px-4 py-4">
        <h1 className="text-base font-semibold">Conversas</h1>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-content-400"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nome ou número"
            className="py-2 pl-9 text-sm"
            aria-label="Buscar conversas"
          />
        </div>

        {inboxesQuery.data && inboxesQuery.data.length > 1 && (
          <Select
            value={inboxId}
            onChange={(event) => onInboxChange(event.target.value)}
            className="mt-2 py-2 text-sm"
            aria-label="Filtrar por caixa de entrada"
          >
            <option value="">Todas as caixas</option>
            {inboxesQuery.data.map((inbox) => (
              <option key={inbox.id} value={inbox.id}>
                {inbox.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div
        role="tablist"
        className="flex border-b border-surface-800 px-2"
      >
        {CONVERSATION_FILTERS.map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={filter === value}
            onClick={() => onFilterChange(value)}
            className={cn(
              'flex-1 border-b-2 px-2 py-3 text-xs font-medium transition-colors',
              filter === value
                ? 'border-brand-500 text-content-100'
                : 'border-transparent text-content-400 hover:text-content-200',
            )}
          >
            {FILTER_LABELS[value]}
            <span className="ml-1.5 text-content-400">
              {countsQuery.data?.[value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversationsQuery.isPending && <Spinner />}

        {conversationsQuery.data?.items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-content-400">
            {filter === 'mine'
              ? 'Nenhuma conversa atribuída a você.'
              : filter === 'unassigned'
                ? 'Nenhuma conversa aguardando atendimento.'
                : 'Nenhuma conversa por aqui ainda.'}
          </p>
        )}

        <ul>
          {conversationsQuery.data?.items.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onSelect(conversation)}
                className={cn(
                  'w-full border-b border-surface-850 px-4 py-3 text-left transition-colors',
                  selectedId === conversation.id
                    ? 'bg-surface-800'
                    : 'hover:bg-surface-850',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-content-100">
                    {conversation.contact.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-content-400">
                    {formatRelative(conversation.lastMessageAt)}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-content-400">
                    {conversation.lastMessagePreview ?? 'Sem mensagens'}
                  </span>
                  {conversation.unreadCount > 0 && (
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success-500 text-[10px] font-semibold text-surface-950">
                      {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {conversation.assignee && (
                    <span className="rounded bg-surface-700 px-1.5 py-0.5 text-[10px] text-content-300">
                      {conversation.assignee.name}
                    </span>
                  )}
                  {conversation.priority !== 'none' && (
                    <span className="rounded bg-warning-400/15 px-1.5 py-0.5 text-[10px] text-warning-400">
                      {conversation.priority}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatRelative(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);

  if (diffMinutes < 1) {
    return 'agora';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  if (diffMinutes < 1440) {
    return `${Math.floor(diffMinutes / 60)}h`;
  }
  if (diffMinutes < 10080) {
    return `${Math.floor(diffMinutes / 1440)}d`;
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
