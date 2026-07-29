import type { Request } from 'express';

/**
 * IP do cliente, considerando que em produção a API roda atrás do nginx.
 * Depende de `trust proxy` estar habilitado no bootstrap.
 */
export function clientIp(request: Request): string | null {
  return request.ip ?? null;
}

export function userAgent(request: Request): string | null {
  const value = request.headers['user-agent'];
  return typeof value === 'string' ? value.slice(0, 255) : null;
}
