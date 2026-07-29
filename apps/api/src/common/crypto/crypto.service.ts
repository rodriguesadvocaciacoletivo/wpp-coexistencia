import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — tamanho recomendado para GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Criptografia simétrica de segredos em repouso.
 *
 * Usada pela senha do SMTP nesta fase e, a partir da Fase 2, pelos System User
 * Tokens da Meta — que são o ativo mais sensível do sistema: quem tem o token
 * envia mensagem em nome do cliente.
 *
 * Formato do texto cifrado: base64(iv ‖ authTag ‖ ciphertext).
 * Guardar o IV junto é padrão e seguro; o que não pode se repetir é o par
 * (chave, IV) — daí o IV aleatório por operação.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const encoded = config.getOrThrow<string>('ENCRYPTION_KEY');
    this.key = Buffer.from(encoded, 'base64');

    if (this.key.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY precisa decodificar para exatamente 32 bytes.',
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      'base64',
    );
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');

    if (raw.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Texto cifrado malformado.');
    }

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
