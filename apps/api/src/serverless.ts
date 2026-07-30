import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './config/env';

/**
 * Monta a aplicação para execução como função serverless.
 *
 * Vive dentro de `apps/api/src` de propósito. A função de entrada da Vercel
 * fica na raiz do repositório e precisa importar apenas deste módulo já
 * compilado — assim todas as dependências (NestJS, helmet, cookie-parser)
 * são resolvidas a partir de `apps/api/node_modules`, subindo pela árvore a
 * partir daqui. Se a função da raiz importasse esses pacotes diretamente, o
 * Node os procuraria em `node_modules` da raiz, onde o pnpm não os coloca.
 */
let cached: unknown = null;

export async function createServerlessApp(): Promise<unknown> {
  if (cached) {
    return cached;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Necessário para validar a assinatura HMAC dos webhooks da Meta, que
    // cobre os bytes originais do corpo.
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());

  // Com a interface servida pela mesma origem, o CORS deixa de ser necessário.
  // A configuração permanece para o caso de um frontend externo apontar para
  // esta API — sem origens declaradas, nada é liberado.
  const origins = parseCorsOrigins(config.get<string>('CORS_ORIGINS') ?? '');

  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  await app.init();

  cached = app.getHttpAdapter().getInstance();

  return cached;
}
