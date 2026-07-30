import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, MessagesSquare } from 'lucide-react';
import type {
  ConversationDto,
  ConversationFilter,
} from '@coexistente/shared';
import { apiRequest } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import { EmptyState, Spinner, cn } from '../../components/ui';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { Composer } from './Composer';
import { ContactPanel } from './ContactPanel';
import { useConversationWindow } from './use-window-state';

export function ConversationsPage() {
  useRealtime();

  const [filter, setFilter] = useState<ConversationFilter>('mine');
  const [inboxId, setInboxId] = useState('');
  const [labelId, setLabelId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conversationQuery = useQuery({
    queryKey: ['conversations', 'detail', selectedId],
    queryFn: () => apiRequest<ConversationDto>(`/conversations/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  // Abrir a conversa marca as recebidas como lidas — inclusive no aparelho do
  // contato, que passa a ver o "visto".
  useEffect(() => {
    if (!selectedId) {
      return;
    }

    void apiRequest(`/conversations/${selectedId}/read`, { method: 'POST' });
  }, [selectedId]);

  return (
    <div className="flex h-full">
      <ConversationList
        filter={filter}
        onFilterChange={setFilter}
        inboxId={inboxId}
        onInboxChange={setInboxId}
        labelId={labelId}
        onLabelChange={setLabelId}
        search={search}
        onSearchChange={setSearch}
        selectedId={selectedId}
        onSelect={(conversation) => setSelectedId(conversation.id)}
      />

      {!selectedId && (
        <div className="grid flex-1 place-items-center">
          <EmptyState
            title="Selecione uma conversa"
            description="Escolha um atendimento na lista à esquerda para ver o histórico e responder."
            action={
              <MessagesSquare className="mt-2 size-8 text-content-400" aria-hidden />
            }
          />
        </div>
      )}

      {selectedId && conversationQuery.isPending && (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      )}

      {selectedId && conversationQuery.data && (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between gap-4 border-b border-surface-800 px-6 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-content-100">
                  {conversationQuery.data.contact.name}
                </h2>
                <p className="truncate text-xs text-content-400">
                  {conversationQuery.data.inboxName}
                  {conversationQuery.data.assignee
                    ? ` · ${conversationQuery.data.assignee.name}`
                    : ' · não atribuída'}
                </p>
              </div>

              <WindowBadge
                windowExpiresAt={conversationQuery.data.windowExpiresAt}
              />
            </header>

            <MessageThread conversationId={conversationQuery.data.id} />
            <Composer conversation={conversationQuery.data} />
          </div>

          <ContactPanel conversation={conversationQuery.data} />
        </>
      )}
    </div>
  );
}

/**
 * Quanto resta da janela de 24h, no cabeçalho da conversa.
 *
 * Fica aqui em cima porque muda o tom da resposta: com 40 minutos restando o
 * atendente escreve diferente de quando tem 20 horas. O composer repete a
 * informação, mas só quem está prestes a digitar olha para lá.
 */
function WindowBadge({ windowExpiresAt }: { windowExpiresAt: string | null }) {
  const messageWindow = useConversationWindow(windowExpiresAt);

  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
        messageWindow.open
          ? 'bg-surface-800 text-content-300'
          : 'bg-warning-400/10 text-warning-400',
      )}
      title={
        messageWindow.open
          ? 'Depois disso, só template retoma a conversa.'
          : 'Fora da janela de 24 horas a Meta só aceita template.'
      }
    >
      <Clock className="size-3" aria-hidden />
      {messageWindow.label}
    </span>
  );
}
