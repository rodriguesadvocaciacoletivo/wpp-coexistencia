import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import type {
  SmtpSettingsDto,
  SmtpTestResultDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { useCurrentUser } from '../../stores/auth.store';
import { PageBody, PageHeader } from '../../components/PageHeader';
import { Button, Card, Field, Input, Select, Spinner } from '../../components/ui';

interface FormState {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

const EMPTY_FORM: FormState = {
  host: '',
  port: '587',
  secure: false,
  username: '',
  password: '',
  fromName: '',
  fromEmail: '',
};

export function SmtpSettingsPage() {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();

  const [form, setForm] = useState<FormState | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState<SmtpTestResultDto | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['settings', 'smtp'],
    queryFn: () => apiRequest<SmtpSettingsDto | null>('/settings/smtp'),
  });

  // Primeira carga: preenche o formulário com o que está salvo. A senha nunca
  // volta da API, então o campo fica vazio e só é enviado se o admin digitar
  // algo — o backend interpreta ausência como "mantenha a atual".
  if (form === null && settingsQuery.isSuccess) {
    const saved = settingsQuery.data;

    setForm(
      saved
        ? {
            host: saved.host,
            port: String(saved.port),
            secure: saved.secure,
            username: saved.username ?? '',
            password: '',
            fromName: saved.fromName,
            fromEmail: saved.fromEmail,
          }
        : EMPTY_FORM,
    );

    if (!testTo && currentUser) {
      setTestTo(currentUser.email);
    }
  }

  const save = useMutation({
    mutationFn: (state: FormState) =>
      apiRequest<SmtpSettingsDto>('/settings/smtp', {
        method: 'PUT',
        body: {
          host: state.host,
          port: Number(state.port),
          secure: state.secure,
          username: state.username || null,
          ...(state.password ? { password: state.password } : {}),
          fromName: state.fromName,
          fromEmail: state.fromEmail,
        },
      }),
    onSuccess: () => {
      toast.success('Configuração de SMTP salva.');
      setForm((current) => (current ? { ...current, password: '' } : current));
      void queryClient.invalidateQueries({ queryKey: ['settings', 'smtp'] });
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });

  const sendTest = useMutation({
    mutationFn: () =>
      apiRequest<SmtpTestResultDto>('/settings/smtp/test', {
        method: 'POST',
        body: { to: testTo },
      }),
    // O resultado é exibido na tela, não só como toast: a mensagem de erro do
    // servidor SMTP costuma ser longa e é o que o administrador precisa ler
    // para corrigir a configuração.
    onSuccess: (result) => setTestResult(result),
    onError: (error: unknown) =>
      setTestResult({ success: false, message: describeError(error) }),
  });

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();

    if (form) {
      save.mutate(form);
    }
  };

  const update = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ): void => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <>
      <PageHeader
        title="E-mail (SMTP)"
        description="Servidor usado para enviar convites de agentes, recuperação de senha e boas-vindas."
      />

      <PageBody>
        {settingsQuery.isPending && <Spinner />}

        {form && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Card title="Servidor de saída">
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <Field label="Servidor" htmlFor="host">
                    <Input
                      id="host"
                      required
                      value={form.host}
                      onChange={(event) => update('host', event.target.value)}
                      placeholder="smtp.exemplo.com.br"
                    />
                  </Field>

                  <Field label="Porta" htmlFor="port">
                    <Input
                      id="port"
                      type="number"
                      min={1}
                      max={65535}
                      required
                      value={form.port}
                      onChange={(event) => update('port', event.target.value)}
                    />
                  </Field>
                </div>

                <Field
                  label="Segurança"
                  htmlFor="secure"
                  hint="A maioria dos provedores usa STARTTLS na porta 587. TLS implícito é o padrão da porta 465."
                >
                  <Select
                    id="secure"
                    value={form.secure ? 'implicit' : 'starttls'}
                    onChange={(event) =>
                      update('secure', event.target.value === 'implicit')
                    }
                  >
                    <option value="starttls">STARTTLS ou sem TLS</option>
                    <option value="implicit">TLS implícito (SSL)</option>
                  </Select>
                </Field>

                <Field label="Usuário" htmlFor="username">
                  <Input
                    id="username"
                    autoComplete="off"
                    value={form.username}
                    onChange={(event) => update('username', event.target.value)}
                    placeholder="Deixe vazio se o servidor não exigir autenticação"
                  />
                </Field>

                <Field
                  label="Senha"
                  htmlFor="password"
                  hint={
                    settingsQuery.data?.hasPassword
                      ? 'Há uma senha salva. Deixe em branco para mantê-la.'
                      : 'Nenhuma senha salva.'
                  }
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => update('password', event.target.value)}
                    placeholder={
                      settingsQuery.data?.hasPassword ? '••••••••' : ''
                    }
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome do remetente" htmlFor="fromName">
                    <Input
                      id="fromName"
                      required
                      value={form.fromName}
                      onChange={(event) =>
                        update('fromName', event.target.value)
                      }
                      placeholder="Atendimento"
                    />
                  </Field>

                  <Field label="E-mail do remetente" htmlFor="fromEmail">
                    <Input
                      id="fromEmail"
                      type="email"
                      required
                      value={form.fromEmail}
                      onChange={(event) =>
                        update('fromEmail', event.target.value)
                      }
                      placeholder="nao-responda@empresa.com.br"
                    />
                  </Field>
                </div>

                <div className="mt-2 flex justify-end">
                  <Button type="submit" loading={save.isPending}>
                    Salvar configuração
                  </Button>
                </div>
              </form>
            </Card>

            <div className="flex flex-col gap-6">
              <Card
                title="Enviar e-mail de teste"
                description="Confirma se o servidor aceita as credenciais e entrega a mensagem."
              >
                <div className="flex flex-col gap-3">
                  <Field label="Destinatário" htmlFor="testTo">
                    <Input
                      id="testTo"
                      type="email"
                      value={testTo}
                      onChange={(event) => setTestTo(event.target.value)}
                    />
                  </Field>

                  <Button
                    type="button"
                    variant="secondary"
                    loading={sendTest.isPending}
                    disabled={!testTo}
                    onClick={() => {
                      setTestResult(null);
                      sendTest.mutate();
                    }}
                  >
                    Enviar teste
                  </Button>

                  {testResult && (
                    <div
                      role="status"
                      className={
                        testResult.success
                          ? 'flex gap-2 rounded-lg border border-success-500/30 bg-success-500/10 p-3 text-sm text-success-400'
                          : 'flex gap-2 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3 text-sm text-danger-400'
                      }
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      )}
                      <span className="break-words">{testResult.message}</span>
                    </div>
                  )}
                </div>
              </Card>

              <div className="flex gap-2.5 rounded-xl border border-surface-800 bg-surface-900 p-4 text-sm text-content-300">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden />
                <p>
                  Em desenvolvimento, o Mailhog captura tudo em{' '}
                  <code className="rounded bg-surface-800 px-1.5 py-0.5 text-xs">
                    localhost:1025
                  </code>{' '}
                  e mostra as mensagens em{' '}
                  <a
                    href="http://localhost:8025"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-400 hover:text-brand-300"
                  >
                    localhost:8025
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível completar a operação.';
}
