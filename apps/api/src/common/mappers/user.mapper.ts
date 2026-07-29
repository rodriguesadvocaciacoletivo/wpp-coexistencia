import type { User } from '@prisma/client';
import type { UserDto } from '@coexistente/shared';

/**
 * Converte a entidade do banco no DTO exposto pela API.
 *
 * Este mapeamento é o ponto único que garante que `passwordHash` nunca escape
 * para uma resposta HTTP. Nenhum controller devolve entidade do Prisma direto.
 */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
