import type { UserDto } from './users.js';

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * O refresh token não trafega no corpo da resposta — ele é entregue em um
 * cookie httpOnly, inacessível a JavaScript. O frontend guarda apenas o
 * access token, em memória.
 */
export interface AuthSessionDto {
  accessToken: string;
  /** Segundos até a expiração do access token. */
  expiresIn: number;
  user: UserDto;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
}

/** Dados públicos de um convite, para a tela de definição de senha. */
export interface InvitationPreviewDto {
  name: string;
  email: string;
}

/**
 * Requisitos mínimos de senha, aplicados no frontend (feedback imediato) e
 * revalidados no backend (fonte de verdade).
 */
export const PASSWORD_MIN_LENGTH = 10;

export function describePasswordPolicy(): string {
  return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres, com letras e números.`;
}

export function isPasswordAcceptable(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}
