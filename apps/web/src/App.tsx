import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { setUnauthorizedHandler } from './lib/api';
import { Spinner } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';
import { ConversationsPage } from './pages/conversations/ConversationsPage';
import { InboxesPage } from './pages/admin/InboxesPage';
import { InboxWizardPage } from './pages/admin/InboxWizardPage';
import { InboxDetailPage } from './pages/admin/InboxDetailPage';
import { UsersPage } from './pages/admin/UsersPage';
import { TeamsPage } from './pages/admin/TeamsPage';
import { LabelsPage } from './pages/admin/LabelsPage';
import { WebhookQueuePage } from './pages/admin/WebhookQueuePage';
import { SmtpSettingsPage } from './pages/admin/SmtpSettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  const initializing = useAuthStore((state) => state.initializing);
  const initialize = useAuthStore((state) => state.initialize);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => {
    // Quando o refresh falha em definitivo, o estado local precisa acompanhar —
    // caso contrário a interface segue mostrando o usuário logado sobre uma
    // sessão que o servidor já não reconhece.
    setUnauthorizedHandler(clear);
    void initialize();
  }, [initialize, clear]);

  if (initializing) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Carregando sua sessão…" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/entrar" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route
        path="/esqueci-a-senha"
        element={<PublicOnly><ForgotPasswordPage /></PublicOnly>}
      />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/convite" element={<AcceptInvitePage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/conversas" replace />} />
        <Route path="/conversas" element={<ConversationsPage />} />

        <Route
          path="/configuracoes/caixas"
          element={<RequireAdmin><InboxesPage /></RequireAdmin>}
        />
        <Route
          path="/configuracoes/caixas/nova"
          element={<RequireAdmin><InboxWizardPage /></RequireAdmin>}
        />
        <Route
          path="/configuracoes/caixas/:id"
          element={<RequireAdmin><InboxDetailPage /></RequireAdmin>}
        />
        <Route
          path="/configuracoes/usuarios"
          element={<RequireAdmin><UsersPage /></RequireAdmin>}
        />
        <Route
          path="/configuracoes/times"
          element={<RequireAdmin><TeamsPage /></RequireAdmin>}
        />
        <Route
          path="/configuracoes/etiquetas"
          element={<RequireAdmin><LabelsPage /></RequireAdmin>}
        />
        <Route
          path="/configuracoes/fila"
          element={<RequireAdmin><WebhookQueuePage /></RequireAdmin>}
        />
        <Route
          path="/configuracoes/smtp"
          element={<RequireAdmin><SmtpSettingsPage /></RequireAdmin>}
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

/**
 * Barreira de papel no roteamento.
 *
 * Vale lembrar que isto é conveniência de navegação, não segurança: a decisão
 * que conta acontece nos guards do backend. Aqui só evitamos mostrar uma tela
 * que resultaria em 403 em toda requisição.
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (user?.role !== 'admin') {
    return <Navigate to="/conversas" replace />;
  }

  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (user) {
    return <Navigate to="/conversas" replace />;
  }

  return <>{children}</>;
}
