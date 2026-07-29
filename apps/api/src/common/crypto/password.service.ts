import { Injectable } from '@nestjs/common';
import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Hash de senhas com argon2id.
 *
 * Parâmetros seguindo a recomendação do OWASP Password Storage Cheat Sheet:
 * 19 MiB de memória, 2 iterações, paralelismo 1.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  /**
   * Verifica a senha. Retorna `false` em vez de propagar erro quando o hash
   * armazenado está corrompido ou em formato desconhecido — do ponto de vista
   * do login, "não confere" e "não consigo ler" levam ao mesmo desfecho.
   */
  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(storedHash, plaintext, ARGON2_OPTIONS);
    } catch {
      return false;
    }
  }
}
