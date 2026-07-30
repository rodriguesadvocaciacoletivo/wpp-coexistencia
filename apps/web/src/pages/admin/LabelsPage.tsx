import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessagesSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  LABEL_COLORS,
  LABEL_NAME_MAX,
  type LabelDto,
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
  cn,
} from '../../components/ui';
import { LabelChip } from '../../components/LabelChip';

export function LabelsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LabelDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<LabelDto | null>(null);

  const labelsQuery = useQuery({
    queryKey: ['labels'],
    queryFn: () => apiRequest<LabelDto[]>('/labels'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['labels'] });
    // As conversas carregam as etiquetas embutidas — renomear ou excluir sem
    // isto deixaria o nome antigo na tela até a próxima navegação.
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const removeLabel = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/labels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Etiqueta excluída.');
      invalidate();
      setRemoving(null);
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  return (
    <>
      <PageHeader
        title="Etiquetas"
        description="Marque conversas por assunto, origem ou situação. Qualquer agente pode etiquetar; só administradores mantêm a lista."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Nova etiqueta
          </Button>
        }
      />

      <PageBody>
        {labelsQuery.isPending && <Spinner />}

        {labelsQuery.data?.length === 0 && (
          <EmptyState
            title="Nenhuma etiqueta criada"
            description="Etiquetas ajudam a separar a fila por assunto — cobrança, suporte, primeiro contato — e a filtrar o que interessa agora."
            action={
              <Button variant="secondary" onClick={() => setCreating(true)}>
                Criar a primeira etiqueta
              </Button>
            }
          />
        )}

        {labelsQuery.data && labelsQuery.data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {labelsQuery.data.map((label) => (
              <Card key={label.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <LabelChip label={label} />
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-content-400">
                      <MessagesSquare className="size-3.5" aria-hidden />
                      {label.conversationCount === 1
                        ? '1 conversa'
                        : `${label.conversationCount} conversas`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      className="px-2 py-1.5"
                      title="Editar etiqueta"
                      onClick={() => setEditing(label)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1.5 text-danger-400"
                      title="Excluir etiqueta"
                      onClick={() => setRemoving(label)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <LabelFormModal
        open={creating || editing !== null}
        label={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />

      <Modal
        open={removing !== null}
        title="Excluir etiqueta"
        onClose={() => setRemoving(null)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-content-300">
            A etiqueta <strong>{removing?.name}</strong> será removida
            {removing && removing.conversationCount > 0 ? (
              <>
                {' '}
                de{' '}
                <strong>
                  {removing.conversationCount === 1
                    ? '1 conversa'
                    : `${removing.conversationCount} conversas`}
                </strong>
                . As conversas continuam existindo — só perdem esta marcação.
              </>
            ) : (
              '. Ela não está em nenhuma conversa.'
            )}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-danger-500 hover:bg-danger-500/90"
              loading={removeLabel.isPending}
              onClick={() => removing && removeLabel.mutate(removing.id)}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function LabelFormModal({
  open,
  label,
  onClose,
  onSaved,
}: {
  open: boolean;
  label: LabelDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(LABEL_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  // Sincroniza o formulário quando o modal abre para outra etiqueta.
  const currentKey = label?.id ?? 'new';
  if (open && initializedFor !== currentKey) {
    setInitializedFor(currentKey);
    setName(label?.name ?? '');
    setColor(label?.color ?? LABEL_COLORS[0]);
    setError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      label
        ? apiRequest<LabelDto>(`/labels/${label.id}`, {
            method: 'PATCH',
            body: { name, color },
          })
        : apiRequest<LabelDto>('/labels', {
            method: 'POST',
            body: { name, color },
          }),
    onSuccess: () => {
      toast.success(label ? 'Etiqueta atualizada.' : 'Etiqueta criada.');
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
      title={label ? 'Editar etiqueta' : 'Nova etiqueta'}
      onClose={handleClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="label-name">
          <Input
            id="label-name"
            required
            autoFocus
            maxLength={LABEL_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cobrança"
          />
        </Field>

        <Field label="Cor" htmlFor="label-color">
          <div className="flex flex-wrap gap-2">
            {LABEL_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Cor ${option}`}
                aria-pressed={option === color}
                onClick={() => setColor(option)}
                style={{ backgroundColor: option }}
                className={cn(
                  'size-7 rounded-full transition-transform',
                  option === color
                    ? 'ring-2 ring-content-100 ring-offset-2 ring-offset-surface-900'
                    : 'hover:scale-110',
                )}
              />
            ))}
          </div>
        </Field>

        <div>
          <p className="mb-1.5 text-xs text-content-400">Como vai aparecer</p>
          <LabelChip label={{ name: name || 'Etiqueta', color }} />
        </div>

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
            {label ? 'Salvar' : 'Criar etiqueta'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível completar a operação.';
}
