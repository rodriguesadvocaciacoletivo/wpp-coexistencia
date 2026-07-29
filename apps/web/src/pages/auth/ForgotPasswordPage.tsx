import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Field, Input } from '../../components/ui';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await apiRequest('/auth/forgot', {
        method: 'POST',
        body: { email },
        skipRefresh: true,
      });
    } finally {
      // A confirmação aparece mesmo se a requisição falhar. A tela não pode
      // revelar se o e-mail existe — nem por mensagem, nem por diferença de
      // comportamento entre um caso e outro.
      setSubmitting(false);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Verifique seu e-mail"
        footer={
          <Link to="/entrar" className="text-brand-400 hover:text-brand-300">
            Voltar para o login
          </Link>
        }
      >
        <div className="flex gap-3 rounded-lg border border-surface-700 bg-surface-900 p-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-success-400" aria-hidden />
          <p className="text-sm text-content-200">
            Se houver uma conta com <strong>{email}</strong>, enviamos um link
            para redefinir a senha. Ele vale por 1 hora e só pode ser usado uma
            vez.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe seu e-mail e enviaremos um link para você criar uma nova senha."
      footer={
        <Link to="/entrar" className="text-brand-400 hover:text-brand-300">
          Voltar para o login
        </Link>
      }
    >
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

        <Button type="submit" loading={submitting} className="mt-2">
          Enviar link de recuperação
        </Button>
      </form>
    </AuthLayout>
  );
}
