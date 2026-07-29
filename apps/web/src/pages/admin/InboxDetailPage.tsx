import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUS_LABELS,
  ONBOARDING_TYPE_LABELS,
  extractVariables,
  qualityRatingLabel,
  templateBodyText,
  type InboxDetailDto,
  type TemplateCategory,
  type TemplateDto,
  type TemplateSyncResultDto,
  type UserDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { PageBody, PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import { ConnectionBadge } from './InboxesPage';

export function InboxDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const inboxQuery = useQuery({
    queryKey: ['inboxes', id],
    queryFn: () => apiRequest<InboxDetailDto>(`/inboxes/${id}`),
    enabled: Boolean(id),
  });

  const templatesQuery = useQuery({
    queryKey: ['inboxes', id, 'templates'],
    queryFn: () => apiRequest<TemplateDto[]>(`/inboxes/${id}/templates`),
    enabled: Boolean(id),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['inboxes'] });
  };

  const revalidate = useMutation({
    mutationFn: () =>
      apiRequest<InboxDetailDto>(`/inboxes/${id}/revalidate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Conexão revalidada.');
      invalidate();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  const syncTemplates = useMutation({
    mutationFn: () =>
      apiRequest<TemplateSyncResultDto>(`/inboxes/${id}/sync-templates`, {
        method: 'POST',
      }),
    onSuccess: (result) => {
      toast.success(
        `${result.synced} template(s) sincronizado(s) — ${result.created} novo(s), ${result.removed} removido(s).`,
      );
      invalidate();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  const removeInbox = useMutation({
    mutationFn: () => apiRequest<void>(`/inboxes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Caixa de entrada removida.');
      invalidate();
      navigate('/configuracoes/caixas', { replace: true });
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  if (inboxQuery.isPending) {
    return <Spinner label="Carregando caixa de entrada…" />;
  }

  if (inboxQuery.isError || !inboxQuery.data) {
    return (
      <PageBody>
        <EmptyState title="Caixa de entrada não encontrada" />
      </PageBody>
    );
  }

  const inbox = inboxQuery.data;

  return (
    <>
      <PageHeader
        title={inbox.name}
        description={`${inbox.phoneNumber} · ${ONBOARDING_TYPE_LABELS[inbox.onboardingType]}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/configuracoes/caixas">
              <Button variant="ghost">
                <ArrowLeft className="size-4" aria-hidden />
                Voltar
              </Button>
            </Link>
            <Button
              variant="secondary"
              loading={revalidate.isPending}
              onClick={() => revalidate.mutate()}
            >
              <RefreshCw className="size-4" aria-hidden />
              Revalidar conexão
            </Button>
          </div>
        }
      />

      <PageBody>
        {inbox.connectionStatus === 'error' && inbox.connectionError && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-danger-400"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Esta caixa está com problema de conexão.</p>
              <p className="mt-1">{inbox.connectionError}</p>
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-6">
            <Card
              title="Templates"
              description="Sincronizados da conta do WhatsApp Business. A Meta é a fonte de verdade."
              actions={
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    loading={syncTemplates.isPending}
                    onClick={() => syncTemplates.mutate()}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Sincronizar
                  </Button>
                  <Button
                    className="px-3 py-1.5 text-xs"
                    onClick={() => setTemplateModalOpen(true)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Novo template
                  </Button>
                </div>
              }
            >
              {templatesQuery.isPending && <Spinner />}

              {templatesQuery.data?.length === 0 && (
                <EmptyState
                  title="Nenhum template sincronizado"
                  description="Templates aprovados na conta do WhatsApp Business aparecem aqui. Crie um novo ou sincronize para buscar os existentes."
                />
              )}

              {templatesQuery.data && templatesQuery.data.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {templatesQuery.data.map((template) => (
                    <TemplateRow key={template.id} inboxId={id} template={template} />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card title="Conexão">
              <dl className="flex flex-col gap-3 text-sm">
                <Row label="Status">
                  <ConnectionBadge inbox={inbox} />
                </Row>
                <Row label="Nome verificado">{inbox.verifiedName ?? '—'}</Row>
                <Row label="Qualidade do número">
                  {qualityRatingLabel(inbox.qualityRating)}
                </Row>
                <Row label="Limite de mensagens">{inbox.messagingTier ?? '—'}</Row>
                <Row label="Throughput">{inbox.throughputLimitMps} msg/s</Row>
                <Row label="Conta (WABA)">{inbox.wabaName ?? '—'}</Row>
                <Row label="Análise da conta">{inbox.wabaReviewStatus ?? '—'}</Row>
                <Row label="Webhooks">
                  {inbox.webhookSubscribedAt ? 'Assinados' : 'Não assinados'}
                </Row>
                <Row label="Última validação">{formatDate(inbox.lastValidatedAt)}</Row>
                <Row label="Último sync">{formatDate(inbox.templatesSyncedAt)}</Row>
              </dl>
            </Card>

            <Card title="Identificadores">
              <dl className="flex flex-col gap-3 text-sm">
                <Row label="ID do número">
                  <code className="text-xs text-content-200">{inbox.phoneNumberId}</code>
                </Row>
                <Row label="ID da WABA">
                  <code className="text-xs text-content-200">{inbox.wabaId}</code>
                </Row>
              </dl>

              <Button
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => setTokenModalOpen(true)}
              >
                <KeyRound className="size-4" aria-hidden />
                Trocar token de acesso
              </Button>
            </Card>

            <Card
              title="Agentes"
              description={
                inbox.members.length === 1
                  ? '1 agente atende esta caixa'
                  : `${inbox.members.length} agentes atendem esta caixa`
              }
            >
              {inbox.members.length > 0 && (
                <ul className="flex flex-col gap-2 text-sm">
                  {inbox.members.map((member) => (
                    <li key={member.id} className="text-content-200">
                      {member.name}
                      <span className="ml-2 text-xs text-content-400">
                        {member.email}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => setMembersOpen(true)}
              >
                Gerenciar agentes
              </Button>
            </Card>

            <Button
              variant="ghost"
              className="text-danger-400"
              onClick={() => {
                if (
                  window.confirm(
                    `Remover a caixa "${inbox.name}"? As conversas e o histórico são preservados para consulta.`,
                  )
                ) {
                  removeInbox.mutate();
                }
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Remover caixa de entrada
            </Button>
          </div>
        </div>
      </PageBody>

      <TokenModal
        open={tokenModalOpen}
        inboxId={id}
        onClose={() => setTokenModalOpen(false)}
        onSaved={invalidate}
      />

      <CreateTemplateModal
        open={templateModalOpen}
        inboxId={id}
        onClose={() => setTemplateModalOpen(false)}
        onCreated={invalidate}
      />

      {membersOpen && (
        <MembersModal
          inbox={inbox}
          onClose={() => setMembersOpen(false)}
          onSaved={invalidate}
        />
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-content-400">{label}</dt>
      <dd className="text-right text-content-200">{children}</dd>
    </div>
  );
}

function TemplateRow({ inboxId, template }: { inboxId: string; template: TemplateDto }) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () =>
      apiRequest<void>(`/inboxes/${inboxId}/templates/${template.id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Template excluído na Meta.');
      void queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  const tone =
    template.status === 'APPROVED'
      ? 'success'
      : template.status === 'REJECTED' || template.status === 'DISABLED'
        ? 'danger'
        : 'warning';

  return (
    <li className="rounded-lg border border-surface-800 bg-surface-850 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-content-100">{template.name}</span>
            <Badge tone={tone}>{TEMPLATE_STATUS_LABELS[template.status]}</Badge>
            <Badge tone="brand">{CATEGORY_LABELS[template.category]}</Badge>
          </p>
          <p className="mt-1 text-xs text-content-400">Idioma: {template.language}</p>
        </div>

        <Button
          variant="ghost"
          className="px-2 py-1.5 text-danger-400"
          title="Excluir template"
          loading={remove.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Excluir o template "${template.name}"? A Meta remove todos os idiomas com esse nome.`,
              )
            ) {
              remove.mutate();
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-content-300">
        {templateBodyText(template.components) || '—'}
      </p>

      {template.rejectedReason && (
        <p className="mt-2 text-xs text-danger-400">
          Motivo da recusa: {template.rejectedReason}
        </p>
      )}
    </li>
  );
}

function TokenModal({
  open,
  inboxId,
  onClose,
  onSaved,
}: {
  open: boolean;
  inboxId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      apiRequest<InboxDetailDto>(`/inboxes/${inboxId}`, {
        method: 'PATCH',
        body: { token },
      }),
    onSuccess: () => {
      toast.success('Token atualizado e conexão revalidada.');
      setToken('');
      onSaved();
      onClose();
    },
    onError: (cause: unknown) => setError(describeError(cause)),
  });

  return (
    <Modal
      open={open}
      title="Trocar token de acesso"
      description="O token atual não é exibido. Informar um novo revalida a conexão imediatamente."
      onClose={onClose}
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          save.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Novo System User Token" htmlFor="new-token" error={error}>
          <Input
            id="new-token"
            type="password"
            autoComplete="off"
            required
            autoFocus
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="EAAG..."
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={token.length < 20}>
            Salvar e revalidar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateTemplateModal({
  open,
  inboxId,
  onClose,
  onCreated,
}: {
  open: boolean;
  inboxId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [category, setCategory] = useState<TemplateCategory>('UTILITY');
  const [headerText, setHeaderText] = useState('');
  const [body, setBody] = useState('');
  const [footerText, setFooterText] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const variables = extractVariables(body);

  const create = useMutation({
    mutationFn: () =>
      apiRequest<TemplateDto>(`/inboxes/${inboxId}/templates`, {
        method: 'POST',
        body: {
          name,
          language,
          category,
          headerText: headerText || undefined,
          body,
          footerText: footerText || undefined,
          bodyExamples: variables.length > 0 ? examples.slice(0, variables.length) : undefined,
        },
      }),
    onSuccess: (template) => {
      toast.success(
        `Template "${template.name}" enviado para análise da Meta. O status muda para aprovado assim que ela responder.`,
        { duration: 7000 },
      );
      reset();
      onCreated();
      onClose();
    },
    onError: (cause: unknown) => setError(describeError(cause)),
  });

  const reset = (): void => {
    setName('');
    setLanguage('pt_BR');
    setCategory('UTILITY');
    setHeaderText('');
    setBody('');
    setFooterText('');
    setExamples([]);
    setError(null);
  };

  return (
    <Modal
      open={open}
      title="Novo template"
      description="O template é criado na Meta e entra em análise. Costuma levar de minutos a algumas horas."
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
      >
        <Field
          label="Nome"
          htmlFor="template-name"
          hint="Somente minúsculas, números e sublinhado."
        >
          <Input
            id="template-name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="confirmacao_agendamento"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Idioma" htmlFor="template-language">
            <Input
              id="template-language"
              required
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="pt_BR"
            />
          </Field>

          <Field label="Categoria" htmlFor="template-category">
            <Select
              id="template-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as TemplateCategory)}
            >
              {TEMPLATE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Cabeçalho" htmlFor="template-header" hint="Opcional, até 60 caracteres.">
          <Input
            id="template-header"
            maxLength={60}
            value={headerText}
            onChange={(event) => setHeaderText(event.target.value)}
          />
        </Field>

        <Field
          label="Corpo"
          htmlFor="template-body"
          hint="Use {{1}}, {{2}} para variáveis, em sequência a partir de 1."
        >
          <Textarea
            id="template-body"
            required
            rows={4}
            maxLength={1024}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Olá {{1}}, seu atendimento sobre {{2}} foi registrado."
          />
        </Field>

        {variables.length > 0 && (
          <div className="rounded-lg border border-surface-800 bg-surface-850 p-3">
            <p className="text-xs text-content-400">
              A Meta exige um valor de exemplo para cada variável — ela usa esses
              valores para avaliar o conteúdo.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {variables.map((index, position) => (
                <Field key={index} label={`Exemplo para {{${index}}}`}>
                  <Input
                    required
                    value={examples[position] ?? ''}
                    onChange={(event) => {
                      const next = [...examples];
                      next[position] = event.target.value;
                      setExamples(next);
                    }}
                  />
                </Field>
              ))}
            </div>
          </div>
        )}

        <Field label="Rodapé" htmlFor="template-footer" hint="Opcional, até 60 caracteres.">
          <Input
            id="template-footer"
            maxLength={60}
            value={footerText}
            onChange={(event) => setFooterText(event.target.value)}
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

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Enviar para análise
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MembersModal({
  inbox,
  onClose,
  onSaved,
}: {
  inbox: InboxDetailDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(inbox.members.map((member) => member.id)),
  );

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<UserDto[]>('/users'),
  });

  const save = useMutation({
    mutationFn: () =>
      apiRequest<InboxDetailDto>(`/inboxes/${inbox.id}/members`, {
        method: 'PUT',
        body: { userIds: [...selected] },
      }),
    onSuccess: () => {
      toast.success('Agentes atualizados.');
      onSaved();
      onClose();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  return (
    <Modal open title={`Agentes de ${inbox.name}`} onClose={onClose}>
      {usersQuery.isPending && <Spinner />}

      {usersQuery.data && (
        <>
          <ul className="max-h-72 divide-y divide-surface-800 overflow-y-auto rounded-lg border border-surface-800">
            {usersQuery.data
              .filter((user) => user.status !== 'disabled')
              .map((user) => (
                <li key={user.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-850">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-500"
                      checked={selected.has(user.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(user.id)) {
                          next.delete(user.id);
                        } else {
                          next.add(user.id);
                        }
                        setSelected(next);
                      }}
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
            <Button type="button" loading={save.isPending} onClick={() => save.mutate()}>
              Salvar
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível completar a operação.';
}
