import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';
import { generateToken, hashToken, tokensMatch } from './tokens';

function makeService(): CryptoService {
  const key = randomBytes(32).toString('base64');
  const config = {
    getOrThrow: () => key,
  } as unknown as ConfigService;

  return new CryptoService(config);
}

describe('CryptoService', () => {
  it('recupera o texto original após cifrar e decifrar', () => {
    const service = makeService();
    const secret = 'EAAG...token-do-system-user-da-meta';

    expect(service.decrypt(service.encrypt(secret))).toBe(secret);
  });

  it('produz textos cifrados diferentes para a mesma entrada', () => {
    const service = makeService();

    // IV aleatório por operação: dois envios da mesma senha não podem gerar o
    // mesmo blob no banco, senão um observador consegue inferir repetição.
    expect(service.encrypt('mesma-senha')).not.toBe(
      service.encrypt('mesma-senha'),
    );
  });

  it('rejeita texto cifrado adulterado', () => {
    const service = makeService();
    const encrypted = service.encrypt('conteudo-sensivel');

    const raw = Buffer.from(encrypted, 'base64');
    const lastIndex = raw.length - 1;
    raw.writeUInt8(raw.readUInt8(lastIndex) ^ 0xff, lastIndex);

    expect(() => service.decrypt(raw.toString('base64'))).toThrow();
  });

  it('rejeita texto cifrado por outra chave', () => {
    const encrypted = makeService().encrypt('conteudo-sensivel');

    expect(() => makeService().decrypt(encrypted)).toThrow();
  });

  it('rejeita payload curto demais para conter IV e tag', () => {
    const service = makeService();

    expect(() => service.decrypt(Buffer.alloc(10).toString('base64'))).toThrow(
      'Texto cifrado malformado.',
    );
  });
});

describe('tokens', () => {
  it('gera token e hash correspondentes', () => {
    const { token, hash } = generateToken();

    expect(hashToken(token)).toBe(hash);
    expect(tokensMatch(token, hash)).toBe(true);
  });

  it('não confunde tokens distintos', () => {
    const first = generateToken();
    const second = generateToken();

    expect(tokensMatch(first.token, second.hash)).toBe(false);
  });

  it('gera tokens únicos', () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateToken().token),
    );

    expect(tokens.size).toBe(200);
  });
});
