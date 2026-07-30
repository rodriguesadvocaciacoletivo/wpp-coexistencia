import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CloudCog,
  Lock,
  Smartphone,
  TriangleAlert,
} from 'lucide-react';
import type {
  InboxDetailDto,
  InboxValidationDto,
  UserDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { PageBody, PageHeader } from '../../components/PageHeader';
import { Button, Card, Field, Input, Spinner, cn } from '../../components/ui';

type Step = 'channel' | 'credentials' | 'agents';

interface Credentials {
  name: string;
  phoneNumber: string;
  phoneNumberId: string;
  wabaId: string;
  token: string;
}

const EMPTY: Credentials = {
  name: '',
  phoneNumber: '',
  phoneNumberId: '',
  wabaId: '',
  token: '',
};

export function InboxWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('channel');
  const [credentials, setCredentials] = useState<Credentials>(EMPTY);
  const [validation, setValidation] = useState<InboxValidationDto | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  // Fora de `credentials` de propósito: marcar a caixa não invalida o teste de
  // conexão, e obrigar a testar de novo por causa dela seria só atrito.
  const [registerWebhook, setRegisterWebhook] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<UserDto[]>('/users'),
    enabled: step === 'agents',
  });

  const validate = useMutation({
    mutationFn: () =>
      apiRequest<InboxValidationDto>('/inboxes/validate', {
        method: 'POST',
        body: {
          phoneNumberId: credentials.phoneNumberId,
          wabaId: credentials.wabaId,
          token: credentials.token,
        },
      }),
    onSuccess: (result) => setValidation(result),
    onError: (error: unknown) =>
      setValidation({ valid: false, message: describeError(error) }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest<InboxDetailDto>('/inboxes', {
        method: 'POST',
        body: {
          ...credentials,
          memberIds: [...selectedAgents],
          registerWebhook,
        },
      }),
    onSuccess: (inbox) => {
      toast.success(`Caixa "${inbox.name}" conectada.`);
      navigate(`/configuracoes/caixas/${inbox.id}`, { replace: true });
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  const update = <K extends keyof Credentials>(key: K, value: Credentials[K]): void => {
    setCredentials((current) => ({ ...current, [key]: value }));
    // Qualquer alteração invalida a checagem anterior — manter o "válido" na
    // tela depois de trocar um ID levaria o administrador a salvar credenciais
    // que nunca foram conferidas.
    setValidation(null);
  };

  return (
    <>
      <PageHeader
        title="Nova caixa de entrada"
        description="Conecte um número de WhatsApp à plataforma."
        actions={
          <Link to="/configuracoes/caixas">
            <Button variant="ghost">
              <ArrowLeft className="size-4" aria-hidden />
              Voltar
            </Button>
          </Link>
        }
      />

      <PageBody>
        <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Stepper step={step} />

          <div className="max-w-2xl">
            {step === 'channel' && (
              <ChannelStep onContinue={() => setStep('credentials')} />
            )}

            {step === 'credentials' && (
              <CredentialsStep
                credentials={credentials}
                validation={validation}
                validating={validate.isPending}
                onChange={update}
                onValidate={() => validate.mutate()}
                onBack={() => setStep('channel')}
                onContinue={() => setStep('agents')}
              />
            )}

            {step === 'agents' && (
              <AgentsStep
                users={usersQuery.data}
                loading={usersQuery.isPending}
                selected={selectedAgents}
                onToggle={(id) => {
                  const next = new Set(selectedAgents);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                  }
                  setSelectedAgents(next);
                }}
                onBack={() => setStep('credentials')}
                onFinish={() => create.mutate()}
                saving={create.isPending}
                registerWebhook={registerWebhook}
                onToggleWebhook={setRegisterWebhook}
              />
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Array<{ id: Step; title: string; description: string }> = [
    {
      id: 'channel',
      title: 'Escolha o canal',
      description: 'Como o número será conectado.',
    },
    {
      id: 'credentials',
      title: 'Credenciais',
      description: 'IDs da Meta e token de acesso.',
    },
    {
      id: 'agents',
      title: 'Agentes',
      description: 'Quem atende esta caixa.',
    },
  ];

  const currentIndex = steps.findIndex((item) => item.id === step);

  return (
    <ol className="flex flex-col gap-6">
      {steps.map((item, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li key={item.id} className="flex gap-3">
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                done && 'bg-success-500/20 text-success-400',
                active && 'bg-brand-600 text-white',
                !done && !active && 'bg-surface-800 text-content-400',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <div>
              <p
                className={cn(
                  'text-sm font-medium',
                  active ? 'text-content-100' : 'text-content-300',
                )}
              >
                {item.title}
              </p>
              <p className="mt-0.5 text-xs text-content-400">{item.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ChannelStep({ onContinue }: { onContinue: () => void }) {
  return (
    <Card
      title="Como este número será conectado?"
      description="A escolha não pode ser alterada depois."
    >
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="flex items-start gap-4 rounded-xl border border-brand-500/40 bg-brand-500/5 p-4 text-left transition-colors hover:border-brand-500 hover:bg-brand-500/10"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-600">
            <CloudCog className="size-5 text-white" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-content-100">
              API Oficial (Cloud API)
            </span>
            <span className="mt-1 block text-sm text-content-400">
              O número passa a operar exclusivamente pela API. Você informa o ID do
              número, o ID da conta do WhatsApp Business e um System User Token.
            </span>
          </span>
        </button>

        <div
          aria-disabled
          className="flex cursor-not-allowed items-start gap-4 rounded-xl border border-surface-800 bg-surface-850 p-4 opacity-70"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-700">
            <Smartphone className="size-5 text-content-400" aria-hidden />
          </span>
          <span>
            <span className="flex items-center gap-2 font-semibold text-content-200">
              Coexistência
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-700 px-2 py-0.5 text-[11px] font-medium text-content-300">
                <Lock className="size-2.5" aria-hidden />
                Indisponível
              </span>
            </span>
            <span className="mt-1 block text-sm text-content-400">
              O número continua funcionando no app WhatsApp Business do celular,
              em paralelo com a API.
            </span>
            <span className="mt-2 block text-xs text-content-400">
              Requer aprovação como Tech Provider e onboarding via Embedded Signup.
              Não é possível ativar por preenchimento manual de credenciais.
            </span>
          </span>
        </div>
      </div>
    </Card>
  );
}

function CredentialsStep({
  credentials,
  validation,
  validating,
  onChange,
  onValidate,
  onBack,
  onContinue,
}: {
  credentials: Credentials;
  validation: InboxValidationDto | null;
  validating: boolean;
  onChange: <K extends keyof Credentials>(key: K, value: Credentials[K]) => void;
  onValidate: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const complete =
    credentials.name.length > 1 &&
    credentials.phoneNumber.length > 7 &&
    credentials.phoneNumberId.length > 4 &&
    credentials.wabaId.length > 4 &&
    credentials.token.length > 19;

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    onValidate();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card
        title="Credenciais da Cloud API"
        description="Os identificadores estão no painel do Meta Developers, em WhatsApp → Configuração da API."
      >
        <div className="flex flex-col gap-4">
          <Field label="Nome da caixa de entrada" htmlFor="name">
            <Input
              id="name"
              required
              autoFocus
              value={credentials.name}
              onChange={(event) => onChange('name', event.target.value)}
              placeholder="Atendimento comercial"
            />
          </Field>

          <Field
            label="Número de telefone"
            htmlFor="phoneNumber"
            hint="Como será exibido na plataforma. Ex.: +55 11 99999-0000"
          >
            <Input
              id="phoneNumber"
              required
              value={credentials.phoneNumber}
              onChange={(event) => onChange('phoneNumber', event.target.value)}
              placeholder="+55 11 99999-0000"
            />
          </Field>

          <Field label="ID do número de telefone" htmlFor="phoneNumberId">
            <Input
              id="phoneNumberId"
              required
              inputMode="numeric"
              value={credentials.phoneNumberId}
              onChange={(event) => onChange('phoneNumberId', event.target.value)}
              placeholder="123456789012345"
            />
          </Field>

          <Field label="ID da conta do WhatsApp Business" htmlFor="wabaId">
            <Input
              id="wabaId"
              required
              inputMode="numeric"
              value={credentials.wabaId}
              onChange={(event) => onChange('wabaId', event.target.value)}
              placeholder="123456789012345"
            />
          </Field>

          <Field
            label="System User Token"
            htmlFor="token"
            hint="Fica criptografado no banco e nunca é exibido de volta."
          >
            <Input
              id="token"
              required
              type="password"
              autoComplete="off"
              value={credentials.token}
              onChange={(event) => onChange('token', event.target.value)}
              placeholder="EAAG..."
            />
          </Field>

          {validation && <ValidationResult validation={validation} />}

          <div className="mt-2 flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              Voltar
            </Button>

            <div className="flex gap-2">
              <Button
                type="submit"
                variant="secondary"
                loading={validating}
                disabled={!complete}
              >
                Testar conexão
              </Button>
              <Button
                type="button"
                onClick={onContinue}
                disabled={!validation?.valid}
                title={
                  validation?.valid
                    ? undefined
                    : 'Teste a conexão antes de continuar'
                }
              >
                Continuar
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </form>
  );
}

function ValidationResult({ validation }: { validation: InboxValidationDto }) {
  if (!validation.valid) {
    return (
      <div
        role="alert"
        className="flex gap-2.5 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3.5 text-sm text-danger-400"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{validation.message}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-lg border border-success-500/30 bg-success-500/10 p-3.5"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-success-400">
        <BadgeCheck className="size-4 shrink-0" aria-hidden />
        {validation.message}
      </p>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <Detail label="Número" value={validation.phoneNumber?.displayPhoneNumber} />
        <Detail label="Nome verificado" value={validation.phoneNumber?.verifiedName} />
        <Detail label="Conta (WABA)" value={validation.waba?.name} />
        <Detail label="Análise da conta" value={validation.waba?.reviewStatus} />
        <Detail
          label="Templates encontrados"
          value={
            validation.templateCount === undefined
              ? null
              : String(validation.templateCount)
          }
        />
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <dt className="text-content-400">{label}:</dt>
      <dd className="text-content-200">{value}</dd>
    </div>
  );
}

function AgentsStep({
  users,
  loading,
  selected,
  onToggle,
  onBack,
  onFinish,
  saving,
  registerWebhook,
  onToggleWebhook,
}: {
  users: UserDto[] | undefined;
  loading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
  registerWebhook: boolean;
  onToggleWebhook: (value: boolean) => void;
}): ReactNode {
  return (
    <Card
      title="Quem atende esta caixa?"
      description="Você pode alterar essa lista depois, na tela da caixa de entrada."
    >
      {loading && <Spinner />}

      {users && (
        <>
          <ul className="max-h-80 divide-y divide-surface-800 overflow-y-auto rounded-lg border border-surface-800">
            {users
              .filter((user) => user.status !== 'disabled')
              .map((user) => (
                <li key={user.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-850">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-500"
                      checked={selected.has(user.id)}
                      onChange={() => onToggle(user.id)}
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

          <label className="mt-4 flex cursor-pointer gap-3 rounded-xl border border-surface-800 bg-surface-850 p-4">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-brand-500"
              checked={registerWebhook}
              onChange={(event) => onToggleWebhook(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-content-100">
                Registrar o webhook automaticamente
              </span>
              <span className="mt-1 block text-sm text-content-400">
                A plataforma informa o próprio endereço à Meta ao assinar a WABA,
                sem você precisar preencher a URL no painel do Meta Developers.
              </span>
              <span className="mt-2 flex gap-2 rounded-lg border border-warning-400/30 bg-warning-400/10 p-2.5 text-xs text-warning-400">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Isto <strong>substitui</strong> o destino atual dos webhooks
                  desta conta. Se o número já é recebido por outro sistema, ele
                  para de receber na hora. Status de template continua indo para
                  a URL configurada no painel.
                </span>
              </span>
            </span>
          </label>

          <div className="mt-4 flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              Voltar
            </Button>
            <Button type="button" loading={saving} onClick={onFinish}>
              Conectar caixa de entrada
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível completar a operação.';
}
