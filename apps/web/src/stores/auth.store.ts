import { create } from 'zustand';
import type { AuthSessionDto, UserDto } from '@coexistente/shared';
import { apiRequest, restoreSession, setAccessToken } from '../lib/api';

interface AuthState {
  user: UserDto | null;
  /** `true` enquanto a tentativa inicial de restaurar a sessão não terminou. */
  initializing: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  applySession: (session: AuthSessionDto) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initializing: true,

  /**
   * Tenta reconstruir a sessão a partir do cookie httpOnly.
   *
   * É o que faz o F5 não deslogar o usuário mesmo com o access token vivendo só
   * em memória.
   */
  async initialize() {
    const session = await restoreSession();

    set({ user: session?.user ?? null, initializing: false });
  },

  async login(email, password) {
    const session = await apiRequest<AuthSessionDto>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipRefresh: true,
    });

    setAccessToken(session.accessToken);
    set({ user: session.user });
  },

  async logout() {
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      set({ user: null });
    }
  },

  applySession(session) {
    setAccessToken(session.accessToken);
    set({ user: session.user });
  },

  clear() {
    setAccessToken(null);
    set({ user: null });
  },
}));

export const useCurrentUser = (): UserDto | null =>
  useAuthStore((state) => state.user);

export const useIsAdmin = (): boolean =>
  useAuthStore((state) => state.user?.role === 'admin');
