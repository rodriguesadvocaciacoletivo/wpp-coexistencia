import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@coexistente/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/**
 * Marca a rota como acessível sem autenticação.
 *
 * A API é fechada por padrão — o guard de autenticação é global. Abrir uma rota
 * é sempre uma decisão explícita e visível na leitura do controller, nunca um
 * esquecimento.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe a rota aos papéis informados. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Atalho para rotas exclusivas de administrador. */
export const AdminOnly = (): MethodDecorator & ClassDecorator =>
  Roles('admin');
