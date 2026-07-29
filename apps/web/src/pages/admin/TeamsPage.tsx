import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import type {
  TeamDetailDto,
  TeamDto,
  UserDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { PageBody, PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
  Textarea,
} from '../../components/ui';

export function TeamsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TeamDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingMembers, setManagingMembers] = useState<TeamDto | null>(null);

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiRequest<TeamDto[]>('/teams'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
  };

  const removeTeam = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Time excluído.');
      invalidate();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  return (
    <>
      <PageHeader
        title="Times"
        description="Agrupe agentes por área de atendimento. A partir da Fase 3, conversas podem ser atribuídas a um time."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Novo time
          </Button>
        }
      />

      <PageBody>
        {teamsQuery.isPending && <Spinner />}

        {teamsQuery.data?.length === 0 && (
          <EmptyState
            title="Nenhum time criado"
            description="Times são opcionais, mas ajudam a organizar a fila de atendimento quando a equipe cresce."
            action={
              <Button variant="secondary" onClick={() => setCreating(true)}>
                Criar o primeiro time
              </Button>
            }
          />
        )}

        {teamsQuery.data && teamsQuery.data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teamsQuery.data.map((team) => (
              <Card key={team.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-content-100">
                      {team.name}
                    </h3>
                    <p className="mt-1 text-sm text-content-400">
                      {team.description || 'Sem descrição.'}
                    </p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-content-400">
                      <UsersRound className="size-3.5" aria-hidden />
                      {team.memberCount === 1
                        ? '1 membro'
                        : `${team.memberCount} membros`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      className="px-2 py-1.5"
                      title="Editar time"
                      onClick={() => setEditing(team)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1.5 text-danger-400"
                      title="Excluir time"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Excluir o time "${team.name}"? Os usuários continuam existindo.`,
                          )
                        ) {
                          removeTeam.mutate(team.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="mt-4 w-full"
                  onClick={() => setManagingMembers(team)}
                >
                  Gerenciar membros
                </Button>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <TeamFormModal
        open={creating || editing !== null}
        team={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />

      {managingMembers && (
        <MembersModal
          team={managingMembers}
          onClose={() => setManagingMembers(null)}
          onSaved={invalidate}
        />
      )}
    </>
  );
}

function TeamFormModal({
  open,
  team,
  onClose,
  onSaved,
}: {
  open: boolean;
  team: TeamDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  // Sincroniza o formulário quando o modal abre para outro time.
  const currentKey = team?.id ?? 'new';
  if (open && initializedFor !== currentKey) {
    setInitializedFor(currentKey);
    setName(team?.name ?? '');
    setDescription(team?.description ?? '');
    setError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      team
        ? apiRequest<TeamDto>(`/teams/${team.id}`, {
            method: 'PATCH',
            body: { name, description: description || null },
          })
        : apiRequest<TeamDto>('/teams', {
            method: 'POST',
            body: { name, description: description || null },
          }),
    onSuccess: () => {
      toast.success(team ? 'Time atualizado.' : 'Time criado.');
      onSaved();
      handleClose();
    },
    onError: (cause: unknown) => setError(describeError(cause)),
  });

  const handleClose = (): void => {
    setInitializedFor(null);
    onClose();
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);
    save.mutate();
  };

  return (
    <Modal
      open={open}
      title={team ? 'Editar time' : 'Novo time'}
      onClose={handleClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="team-name">
          <Input
            id="team-name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Atendimento ao cliente"
          />
        </Field>

        <Field label="Descrição" htmlFor="team-description">
          <Textarea
            id="team-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Opcional"
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-400"
          >
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            {team ? 'Salvar' : 'Criar time'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MembersModal({
  team,
  onClose,
  onSaved,
}: {
  team: TeamDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<UserDto[]>('/users'),
  });

  const detailQuery = useQuery({
    queryKey: ['teams', team.id],
    queryFn: () => apiRequest<TeamDetailDto>(`/teams/${team.id}`),
  });

  if (selected === null && detailQuery.data) {
    setSelected(new Set(detailQuery.data.members.map((member) => member.id)));
  }

  const save = useMutation({
    mutationFn: () =>
      apiRequest<TeamDetailDto>(`/teams/${team.id}/members`, {
        method: 'PUT',
        body: { userIds: Array.from(selected ?? []) },
      }),
    onSuccess: () => {
      toast.success('Membros atualizados.');
      onSaved();
      onClose();
    },
    onError: (cause: unknown) => toast.error(describeError(cause)),
  });

  const toggle = (userId: string): void => {
    const next = new Set(selected ?? []);

    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }

    setSelected(next);
  };

  const loading = usersQuery.isPending || detailQuery.isPending;

  return (
    <Modal
      open
      title={`Membros de ${team.name}`}
      description="Marque quem faz parte do time."
      onClose={onClose}
    >
      {loading && <Spinner />}

      {!loading && usersQuery.data && (
        <>
          <ul className="max-h-72 divide-y divide-surface-800 overflow-y-auto rounded-lg border border-surface-800">
            {usersQuery.data.map((user) => (
              <li key={user.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-850">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-500"
                    checked={selected?.has(user.id) ?? false}
                    onChange={() => toggle(user.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-content-100">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-content-400">
                      {user.email}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Salvar membros
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível completar a operação.';
}
