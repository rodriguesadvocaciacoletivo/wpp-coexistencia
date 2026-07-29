import { z } from 'zod';

/**
 * Validação do ambiente na subida da aplicação.
 *
 * A escolha é deliberada: é melhor a API não subir do que subir com uma chave
 * de criptografia ausente e só descobrir isso quando o primeiro token da Meta
 * for salvo em texto plano.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  API_PORT: z.coerce.number().int().positive().default(3333),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  /**
   * Conexão direta com o banco, usada apenas pelas migrations. Não é lida em
   * runtime pela aplicação — só pelo CLI do Prisma —, por isso é opcional aqui.
   */
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa ter no mínimo 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  ENCRYPTION_KEY: z
    .string()
    .min(1, 'ENCRYPTION_KEY é obrigatória')
    .refine(
      (value) => Buffer.from(value, 'base64').length === 32,
      'ENCRYPTION_KEY precisa ser exatamente 32 bytes em base64. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    ),

  /**
   * `true` quando o frontend está em um domínio diferente do da API — é o caso
   * do ambiente de testes, com a interface na Vercel e a API em outro host.
   * O cookie do refresh token passa a `SameSite=None; Secure`, sem o qual o
   * navegador simplesmente não o envia entre sites distintos.
   * Na VPS, com tudo atrás do mesmo nginx, deixe `false`.
   */
  COOKIE_CROSS_SITE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * Versão da Graph API. Centralizada aqui de propósito: a Meta descontinua
   * versões com prazo, e a atualização precisa ser uma variável de ambiente,
   * não uma varredura por URLs no código.
   */
  META_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, 'Use o formato vXX.Y, como v25.0')
    .default('v25.0'),

  /**
   * App Secret do app no Meta Developers. Valida a assinatura HMAC de todo
   * webhook recebido — sem ele, qualquer um que descubra a URL consegue
   * injetar mensagens falsas na plataforma.
   */
  META_APP_SECRET: z.string().optional(),

  /** Token combinado com a Meta na verificação inicial da URL do webhook. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  /** Diretório onde as mídias baixadas da Meta são guardadas. */
  STORAGE_DIR: z.string().default('./storage'),

  /**
   * URL pública da API, usada para montar os endereços das mídias.
   * Em desenvolvimento, o padrão aponta para a porta local.
   */
  PUBLIC_API_URL: z.string().default('http://localhost:3333'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: z.string().default('Atendimento'),
  SMTP_FROM_EMAIL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuração de ambiente inválida:\n${problems}\n\nConfira o arquivo .env (use .env.example como base).`,
    );
  }

  return parsed.data;
}

/** Origens permitidas no CORS, já normalizadas. */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
