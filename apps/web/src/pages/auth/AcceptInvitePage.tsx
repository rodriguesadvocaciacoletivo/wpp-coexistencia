import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type {
  AuthSessionDto,
  InvitationPreviewDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Spinner } from '../../components/ui';
import {
  PasswordFields,
  validatePasswordPair,
  type PasswordPair,
} from '../../components/PasswordFields';

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; invitation: InvitationPreviewDto }
  | { status: 'invalid'; message: string };

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const applySession = useAuthStore((state) => state.applySession);
  const token = searchParams.get('token');

  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });
  const [pair, setPair] = useState<PasswordPair>({
    password: '',
    confirmation: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Validar o convite antes de mostrar o formulário evita que o convidado
  // preencha a senha para só então descobrir que o link expirou.
  useEffect(() => {
    if (!token) {
      setPreview({
        status: 'invalid',
        message: 'Este endereço não contém um convite válido.',
      });
      return;
    }

    void apiRequest<InvitationPreviewDto>(
      `/auth/invitations/${encodeURIComponent(token)}`,
      { skipRefresh: true },
    )
      .then((invitation) => setPreview({ status: 'ready', invitation }))
      .catch((cause: unknown) =>
        setPreview({
          status: 'invalid',
          message:
            cause instanceof ApiError
              ? cause.message
              : 'Não foi possível validar este convite.',
        }),
      );
  }, [token]);

  if (preview.status === 'loading') {
    return (
      <AuthLayout title="Convite">
        <Spinner label="Validando seu convite…" />
      </AuthLayout>
    );
  }

  if (preview.status === 'invalid') {
    return (
      <AuthLayout
        title="Convite indisponível"
        subtitle={preview.message}
        footer={
          <Link to="/entrar" className="text-brand-400 hover:text-brand-300">
            Ir para o login
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
      const session = await apiRequest<AuthSessionDto>(
        '/auth/invitations/accept',
        {
          method: 'POST',
          body: { token, password: pair.password },
          skipRefresh: true,
        },
      );

      // Aceitar o convite já autentica — obrigar um login logo em seguida seria
      // pedir a mesma senha duas vezes seguidas, sem ganho nenhum.
      applySession(session);
      toast.success(`Bem-vindo, ${session.user.name}!`);
      navigate('/conversas', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível concluir o cadastro.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={`Olá, ${preview.invitation.name}!`}
      subtitle={`Defina uma senha para ativar o acesso de ${preview.invitation.email}.`}
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
          Ativar minha conta
        </Button>
      </form>
    </AuthLayout>
  );
}
