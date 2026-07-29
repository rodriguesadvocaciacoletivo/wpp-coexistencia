import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MailWarning, Send, Trash2, UserPlus } from 'lucide-react';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  USER_ROLES,
  type UserDto,
  type UserRole,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { useCurrentUser } from '../../stores/auth.store';
import { PageBody, PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
} from '../../components/ui';

export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const [inviteOpen, setInviteOpen] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<UserDto[]>('/users'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const updateUser = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<UserDto>) =>
      apiRequest<UserDto>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast.success('Usuário atualizado.');
      invalidate();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  const resendInvite = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ emailSent: boolean }>(`/users/${id}/resend-invite`, {
        method: 'POST',
      }),
    onSuccess: (result) => {
      if (result.emailSent) {
        toast.success('Convite reenviado.');
      } else {
        toast.warning(
          'Convite regenerado, mas o e-mail não saiu. Verifique a configuração de SMTP.',
        );
      }
      invalidate();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/users/${id}/invite`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Convite revogado.');
      invalidate();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Administradores gerenciam a plataforma inteira. Agentes atendem conversas."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" aria-hidden />
            Convidar usuário
          </Button>
        }
      />

      <PageBody>
        <Card>
          {usersQuery.isPending && <Spinner />}

          {usersQuery.isError && (
            <p className="text-sm text-danger-400">
              Não foi possível carregar os usuários.
            </p>
          )}

          {usersQuery.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-800 text-left text-xs uppercase tracking-wider text-content-400">
                    <th className="pb-3 pr-4 font-medium">Nome</th>
                    <th className="pb-3 pr-4 font-medium">E-mail</th>
                    <th className="pb-3 pr-4 font-medium">Papel</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {usersQuery.data.map((user) => {
                    const isSelf = user.id === currentUser?.id;

                    return (
                      <tr key={user.id}>
                        <td className="py-3 pr-4 font-medium text-content-100">
                          {user.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-content-400">
                              (você)
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-content-300">
                          {user.email}
                        </td>
                        <td className="py-3 pr-4">
                          <Select
                            aria-label={`Papel de ${user.name}`}
                            value={user.role}
                            disabled={updateUser.isPending}
                            onChange={(event) =>
                              updateUser.mutate({
                                id: user.id,
                                role: event.target.value as UserRole,
                              })
                            }
                            className="max-w-[11rem] py-1.5"
                          >
                            {USER_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge tone={statusTone(user.status)}>
                            {STATUS_LABELS[user.status]}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            {user.status === 'invited' && (
                              <>
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1.5"
                                  title="Reenviar convite"
                                  loading={resendInvite.isPending}
                                  onClick={() => resendInvite.mutate(user.id)}
                                >
                                  <Send className="size-4" aria-hidden />
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1.5 text-danger-400"
                                  title="Revogar convite"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Revogar o convite de ${user.email}? A conta pendente será removida.`,
                                      )
                                    ) {
                                      revokeInvite.mutate(user.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              </>
                            )}

                            {user.status !== 'invited' && !isSelf && (
                              <Button
                                variant="secondary"
                                className="px-3 py-1.5 text-xs"
                                onClick={() =>
                                  updateUser.mutate({
                                    id: user.id,
                                    status:
                                      user.status === 'active'
                                        ? 'disabled'
                                        : 'active',
                                  })
                                }
                              >
                                {user.status === 'active'
                                  ? 'Desativar'
                                  : 'Reativar'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageBody>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={invalidate}
      />
    </>
  );
}

function InviteModal({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('agent');
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      apiRequest<{ user: UserDto; emailSent: boolean }>('/users/invite', {
        method: 'POST',
        body: { name, email, role },
      }),
    onSuccess: (result) => {
      // O convite existe mesmo quando o e-mail falha. Dizer "convite enviado"
      // nesse caso faria o administrador esperar por uma mensagem que nunca
      // chegou — daí a distinção entre os dois avisos.
      if (result.emailSent) {
        toast.success(`Convite enviado para ${result.user.email}.`);
      } else {
        toast.warning(
          'Usuário criado, mas o e-mail não pôde ser enviado. Configure o SMTP e reenvie o convite.',
          { duration: 8000 },
        );
      }

      onInvited();
      handleClose();
    },
    onError: (cause: unknown) => setError(describeError(cause)),
  });

  const handleClose = (): void => {
    setName('');
    setEmail('');
    setRole('agent');
    setError(null);
    onClose();
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);
    invite.mutate();
  };

  return (
    <Modal
      open={open}
      title="Convidar usuário"
      description="O convidado recebe um e-mail com link para definir a própria senha. O link vale por 48 horas."
      onClose={handleClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="invite-name">
          <Input
            id="invite-name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Maria Silva"
          />
        </Field>

        <Field label="E-mail" htmlFor="invite-email">
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="maria@empresa.com.br"
          />
        </Field>

        <Field label="Papel" htmlFor="invite-role">
          <Select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            {USER_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-400"
          >
            <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={invite.isPending}>
            Enviar convite
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function statusTone(
  status: UserDto['status'],
): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'invited') return 'warning';
  return 'neutral';
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível completar a operação.';
}
