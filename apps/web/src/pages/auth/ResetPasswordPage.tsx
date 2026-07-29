import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, apiRequest } from '../../lib/api';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button } from '../../components/ui';
import {
  PasswordFields,
  validatePasswordPair,
  type PasswordPair,
} from '../../components/PasswordFields';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [pair, setPair] = useState<PasswordPair>({
    password: '',
    confirmation: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <AuthLayout
        title="Link inválido"
        subtitle="Este endereço não contém um token de recuperação válido."
        footer={
          <Link
            to="/esqueci-a-senha"
            className="text-brand-400 hover:text-brand-300"
          >
            Solicitar um novo link
          </Link>
        }
      >
        <></>
      </AuthLayout>
    );
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();

    const problem = validatePasswordPair(pair);

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await apiRequest('/auth/reset', {
        method: 'POST',
        body: { token, password: pair.password },
        skipRefresh: true,
      });

      toast.success('Senha redefinida. Faça login com a nova senha.');
      navigate('/entrar', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível redefinir a senha.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Criar nova senha"
      subtitle="Escolha uma senha para voltar a acessar sua conta."
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <PasswordFields value={pair} onChange={setPair} disabled={submitting} />

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-400"
          >
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="mt-2">
          Redefinir senha
        </Button>
      </form>
    </AuthLayout>
  );
}
