import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ServerCrash } from 'lucide-react';
import { ApiError, checkApiHealth } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Field, Input } from '../../components/ui';

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  // Sondagem silenciosa: se a API não responde, o usuário fica sabendo antes
  // de digitar a senha e concluir que errou as credenciais.
  useEffect(() => {
    void checkApiHealth().then((status) => setApiDown(status === 'down'));
  }, []);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);

      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/conversas', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível entrar. Verifique sua conexão.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse com o e-mail e a senha da sua conta."
      footer={
        <Link
          to="/esqueci-a-senha"
          className="text-brand-400 hover:text-brand-300"
        >
          Esqueci minha senha
        </Link>
      }
    >
      {apiDown && (
        <div
          role="status"
          className="mb-4 flex gap-2.5 rounded-lg border border-warning-400/30 bg-warning-400/10 p-3.5 text-sm text-warning-400"
        >
          <ServerCrash className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            O servidor não está respondendo. Se ele estava parado, pode levar até
            um minuto para iniciar — tente entrar mesmo assim.
          </span>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com.br"
          />
        </Field>

        <Field label="Senha" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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

        <Button type="submit" loading={submitting} className="mt-2">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
