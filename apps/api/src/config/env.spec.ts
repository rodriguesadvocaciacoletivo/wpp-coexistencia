import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, validateEnv } from './env';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

describe('validateEnv', () => {
  it('aceita um ambiente mínimo válido e aplica os padrões', () => {
    const env = validateEnv({ ...baseEnv });

    expect(env.API_PORT).toBe(3333);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
  });

  it('recusa ENCRYPTION_KEY que não decodifica para 32 bytes', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        ENCRYPTION_KEY: randomBytes(16).toString('base64'),
      }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('recusa JWT_SECRET curto', () => {
    expect(() => validateEnv({ ...baseEnv, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('exige DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = baseEnv;

    expect(() => validateEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
  });
});

describe('parseCorsOrigins', () => {
  it('separa, remove espaços e descarta entradas vazias', () => {
    expect(
      parseCorsOrigins('http://localhost:5173, https://app.exemplo.com , '),
    ).toEqual(['http://localhost:5173', 'https://app.exemplo.com']);
  });
});
