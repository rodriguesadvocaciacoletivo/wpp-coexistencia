/**
 * Entrada da API como função serverless da Vercel.
 *
 * Escrito em JavaScript, importando o build já compilado em `../dist`, e não
 * em TypeScript. O motivo é concreto: o empacotador da Vercel usa esbuild, que
 * não implementa `emitDecoratorMetadata`. Sem esses metadados, a injeção de
 * dependência do NestJS não resolve nada e a aplicação sobe quebrada. O `tsc`
 * do `nest build` emite os metadados corretamente, então aqui só consumimos o
 * resultado.
 *
 * A instância é criada uma vez e reaproveitada entre invocações do mesmo
 * contêiner quente — sem isso, cada requisição pagaria o bootstrap inteiro do
 * Nest e abriria uma nova conexão com o Postgres.
 *
 * Limites conhecidos deste ambiente, todos temporários até a migração:
 *   - WebSocket não funciona: o gateway vira no-op e a interface usa polling.
 *   - Os jobs agendados não rodam (não há processo contínuo).
 *   - O disco é efêmero: mídia baixada da Meta não sobrevive entre invocações.
 */
const { ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { NestFactory } = require('@nestjs/core');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const { AppModule } = require('../dist/app.module');
const { parseCorsOrigins } = require('../dist/config/env');

let cachedApp = null;

async function createApp() {
  const app = await NestFactory.create(AppModule, {
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

  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGINS') ?? ''),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  await app.init();

  return app.getHttpAdapter().getInstance();
}

module.exports = async function handler(request, response) {
  if (!cachedApp) {
    cachedApp = await createApp();
  }

  return cachedApp(request, response);
};
