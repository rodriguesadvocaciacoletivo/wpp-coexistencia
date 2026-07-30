import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Pencil, Phone, X } from 'lucide-react';
import {
  CONVERSATION_PRIORITIES,
  PRIORITY_LABELS,
  type ConversationDto,
  type ConversationPriority,
  type LabelDto,
  type TeamDto,
  type UserDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { useCurrentUser } from '../../stores/auth.store';
import { Button, Input, Select } from '../../components/ui';
import { LabelChip } from '../../components/LabelChip';

export function ContactPanel({ conversation }: { conversation: ConversationDto }) {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(conversation.contact.name);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<UserDto[]>('/users'),
  });

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiRequest<TeamDto[]>('/teams'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    void queryClient.invalidateQueries({ queryKey: ['conversation-counts'] });
    void queryClient.invalidateQueries({
      queryKey: ['messages', conversation.id],
    });
  };

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<ConversationDto>(`/conversations/${conversation.id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: invalidate,
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível atualizar.',
      ),
  });

  const rename = useMutation({
    mutationFn: () =>
      apiRequest<ConversationDto>(`/conversations/${conversation.id}/contact`, {
        method: 'PATCH',
        body: { displayName: name },
      }),
    onSuccess: () => {
      toast.success('Nome do contato atualizado.');
      setEditingName(false);
      invalidate();
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível renomear.',
      ),
  });

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-surface-800 bg-surface-900">
      <div className="border-b border-surface-800 px-4 py-5 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-700 text-lg font-semibold uppercase">
          {conversation.contact.name.slice(0, 2)}
        </span>

        {editingName ? (
          <div className="mt-3 flex items-center gap-1">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="py-1.5 text-sm"
              autoFocus
              aria-label="Nome do contato"
            />
            <button
              type="button"
              onClick={() => rename.mutate()}
              aria-label="Salvar nome"
              className="rounded p-1.5 text-success-400 hover:bg-surface-800"
            >
              <Check className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setName(conversation.contact.name);
                setEditingName(false);
              }}
              aria-label="Cancelar"
              className="rounded p-1.5 text-content-400 hover:bg-surface-800"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-content-100 hover:text-brand-400"
          >
            {conversation.contact.name}
            <Pencil className="size-3 opacity-60" aria-hidden />
          </button>
        )}

        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-content-400">
          <Phone className="size-3" aria-hidden />+{conversation.contact.waId}
        </p>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <Button
          variant={conversation.status === 'open' ? 'secondary' : 'primary'}
          onClick={() =>
            update.mutate({
              status: conversation.status === 'open' ? 'resolved' : 'open',
            })
          }
          loading={update.isPending}
        >
          {conversation.status === 'open' ? 'Resolver' : 'Reabrir'}
        </Button>

        <Section title="Agente atribuído">
          <Select
            value={conversation.assignee?.id ?? ''}
            onChange={(event) =>
              update.mutate({ assigneeId: event.target.value || null })
            }
            className="py-2 text-sm"
            aria-label="Agente atribuído"
          >
            <option value="">Não atribuída</option>
            {usersQuery.data
              ?.filter((user) => user.status === 'active')
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
          </Select>

          {conversation.assignee?.id !== currentUser?.id && (
            <button
              type="button"
              onClick={() => update.mutate({ assigneeId: currentUser?.id })}
              className="mt-1.5 text-xs text-brand-400 hover:text-brand-300"
            >
              Atribuir a mim
            </button>
          )}
        </Section>

        <Section title="Time atribuído">
          <Select
            value={conversation.teamId ?? ''}
            onChange={(event) =>
              update.mutate({ teamId: event.target.value || null })
            }
            className="py-2 text-sm"
            aria-label="Time atribuído"
          >
            <option value="">Nenhum</option>
            {teamsQuery.data?.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </Section>

        <Section title="Prioridade">
          <Select
            value={conversation.priority}
            onChange={(event) =>
              update.mutate({
                priority: event.target.value as ConversationPriority,
              })
            }
            className="py-2 text-sm"
            aria-label="Prioridade"
          >
            {CONVERSATION_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
        </Section>

        <Section title="Etiquetas">
          <LabelsSection conversation={conversation} onChanged={invalidate} />
        </Section>

        <Section title="Caixa de entrada">
          <p className="text-sm text-content-200">{conversation.inboxName}</p>
        </Section>

        <Section title="Etiquetas">
          <p className="text-xs text-content-400">
            Etiquetas chegam na Fase 5.
          </p>
        </Section>
      </div>
    </aside>
  );
}

/**
 * Etiquetas da conversa: as aplicadas viram fichas removíveis; um seletor
 * acrescenta as que faltam.
 *
 * Cada clique salva na hora. O agente etiqueta no meio de uma conversa, e um
 * botão "salvar" aqui viraria alteração perdida com frequência.
 */
function LabelsSection({
  conversation,
  onChanged,
}: {
  conversation: ConversationDto;
  onChanged: () => void;
}) {
  const labelsQuery = useQuery({
    queryKey: ['labels'],
    queryFn: () => apiRequest<LabelDto[]>('/labels'),
  });

  const save = useMutation({
    mutationFn: (labelIds: string[]) =>
      apiRequest<ConversationDto>(`/conversations/${conversation.id}/labels`, {
        method: 'PUT',
        body: { labelIds },
      }),
    onSuccess: onChanged,
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível alterar as etiquetas.',
      ),
  });

  const applied = conversation.labels;
  const available = (labelsQuery.data ?? []).filter(
    (label) => !applied.some((current) => current.id === label.id),
  );

  return (
    <div className="flex flex-col gap-2">
      {applied.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {applied.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              onRemove={() =>
                save.mutate(
                  applied
                    .filter((current) => current.id !== label.id)
                    .map((current) => current.id),
                )
              }
            />
          ))}
        </div>
      )}

      {labelsQuery.data?.length === 0 ? (
        <p className="text-xs text-content-400">
          Nenhuma etiqueta cadastrada. Um administrador cria a lista em
          Configurações → Etiquetas.
        </p>
      ) : (
        available.length > 0 && (
          <Select
            value=""
            disabled={save.isPending}
            onChange={(event) => {
              if (event.target.value) {
                save.mutate([...applied.map((l) => l.id), event.target.value]);
              }
            }}
            className="py-2 text-sm"
            aria-label="Adicionar etiqueta"
          >
            <option value="">Adicionar etiqueta…</option>
            {available.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </Select>
        )
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-content-400">
        {title}
      </h3>
      {children}
    </div>
  );
}
