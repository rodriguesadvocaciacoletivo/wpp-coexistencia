import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // O corpo cru será necessário na Fase 6 para validar a assinatura HMAC dos
    // webhooks da Meta — a assinatura cobre os bytes originais, e reserializar
    // o JSON produz um payload diferente do assinado.
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Toda a API vive sob /api. Na Vercel isso é obrigatório — funções
  // serverless só respondem nesse caminho — e localmente mantém o mesmo
  // endereço, evitando que o frontend precise de configuração diferente por
  // ambiente. O webhook da Meta será /api/webhooks/meta.
  app.setGlobalPrefix('api');

  // Em produção a API roda atrás do nginx; sem isto, req.ip seria sempre o do
  // proxy e o rate limit trataria todo o tráfego como um único cliente.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: parseCorsOrigins(config.getOrThrow<string>('CORS_ORIGINS')),
    credentials: true, // necessário para o cookie do refresh token
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  // PORT vem da plataforma de hospedagem e tem precedência; API_PORT é o
  // valor local. Escutar em 0.0.0.0 é obrigatório dentro de contêiner —
  // em 127.0.0.1 o processo sobe mas fica inalcançável de fora.
  const port =
    config.get<number>('PORT') ?? config.get<number>('API_PORT') ?? 3333;

  await app.listen(port, '0.0.0.0');

  logger.log(`API disponível em http://localhost:${port}/api`);
}

void bootstrap();
