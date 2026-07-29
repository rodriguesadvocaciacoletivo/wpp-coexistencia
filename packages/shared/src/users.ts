/** Papéis de usuário. A autorização real acontece sempre no backend. */
export const USER_ROLES = ['admin', 'agent'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Ciclo de vida do usuário.
 * - `invited`  — convite enviado, senha ainda não definida. Não consegue logar.
 * - `active`   — operacional.
 * - `disabled` — desativado por um administrador. Não consegue logar e as
 *                sessões existentes são revogadas.
 */
export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface InvitationDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  /** Derivado no backend: convite ainda válido e não aceito. */
  pending: boolean;
}

export interface InviteUserInput {
  name: string;
  email: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  status?: Extract<UserStatus, 'active' | 'disabled'>;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  agent: 'Agente',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  invited: 'Convite pendente',
  active: 'Ativo',
  disabled: 'Desativado',
};
