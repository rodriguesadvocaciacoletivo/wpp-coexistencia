import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Geração e verificação de tokens opacos de uso único (convite, recuperação de
 * senha, refresh token).
 *
 * Estes tokens têm 256 bits de entropia e são gerados aleatoriamente — não
 * derivam de senha. Por isso o hash é SHA-256 puro, sem KDF: não há o que
 * atacar por força bruta, e a comparação precisa ser rápida a cada request.
 *
 * O valor em claro só existe em dois lugares: no e-mail enviado ao usuário (ou
 * no cookie) e na memória durante a request que o criou. O banco guarda só o hash.
 */

export interface GeneratedToken {
  /** Enviado ao usuário. Nunca persistido. */
  token: string;
  /** Persistido. Nunca enviado. */
  hash: string;
}

export function generateToken(byteLength = 32): GeneratedToken {
  const token = randomBytes(byteLength).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Comparação em tempo constante. Na prática o lookup é feito por índice único
 * no hash, mas onde houver comparação direta ela não deve vazar informação
 * pelo tempo de execução.
 */
export function tokensMatch(candidate: string, storedHash: string): boolean {
  const candidateHash = Buffer.from(hashToken(candidate), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  if (candidateHash.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(candidateHash, stored);
}
