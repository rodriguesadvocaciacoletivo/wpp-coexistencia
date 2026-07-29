import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import type {
  ConversationDto,
  ConversationFilter,
} from '@coexistente/shared';
import { apiRequest } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import { EmptyState, Spinner } from '../../components/ui';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { Composer } from './Composer';
import { ContactPanel } from './ContactPanel';

export function ConversationsPage() {
  useRealtime();

  const [filter, setFilter] = useState<ConversationFilter>('mine');
  const [inboxId, setInboxId] = useState('');
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
