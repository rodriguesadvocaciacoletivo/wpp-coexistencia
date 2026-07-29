import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Inbox,
  LogOut,
  MessagesSquare,
  Settings,
  Users,
  UsersRound,
  Mail,
} from 'lucide-react';
import { ROLE_LABELS } from '@coexistente/shared';
import { useAuthStore } from '../stores/auth.store';
import { cn } from '../components/ui';

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/entrar', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-surface-800 bg-surface-900">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-600">
            <MessagesSquare className="size-4 text-white" aria-hidden />
          </span>
          <span className="text-sm font-semibold">Atendimento</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          <NavItem to="/conversas" icon={<Inbox className="size-4" />}>
            Conversas
          </NavItem>

          {isAdmin && (
            <>
              <p className="mt-6 px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-content-400">
                Configurações
              </p>
              <NavItem
                to="/configuracoes/usuarios"
                icon={<Users className="size-4" />}
              >
                Usuários
              </NavItem>
              <NavItem
                to="/configuracoes/times"
                icon={<UsersRound className="size-4" />}
              >
                Times
              </NavItem>
              <NavItem
                to="/configuracoes/smtp"
                icon={<Mail className="size-4" />}
              >
                E-mail (SMTP)
              </NavItem>
              <p className="mt-4 flex items-center gap-2 px-3 text-xs text-content-400">
                <Settings className="size-3.5" aria-hidden />
                Caixas de entrada chegam na Fase 2
              </p>
            </>
          )}
        </nav>

        <div className="border-t border-surface-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-700 text-sm font-semibold uppercase">
              {user?.name.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-content-400">
                {user ? ROLE_LABELS[user.role] : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              title="Sair"
              aria-label="Sair"
              className="rounded-lg p-2 text-content-300 transition-colors hover:bg-surface-800 hover:text-content-100"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-surface-800 text-content-100'
            : 'text-content-300 hover:bg-surface-850 hover:text-content-100',
        )
      }
    >
      <span aria-hidden>{icon}</span>
      {children}
    </NavLink>
  );
}
