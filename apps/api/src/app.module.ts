import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { MailModule } from './modules/mail/mail.module';
import { MetaModule } from './modules/meta/meta.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TeamsModule } from './modules/teams/teams.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { InboxesModule } from './modules/inboxes/inboxes.module';
import { StorageModule } from './modules/storage/storage.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Em serverless não há processo contínuo: os cron jobs seriam registrados
    // e nunca disparariam. Mantê-los fora evita timers órfãos a cada
    // invocação e deixa explícito que health check e re-sync de templates só
    // funcionam onde a aplicação roda como processo.
    ...(process.env.VERCEL ? [] : [ScheduleModule.forRoot()]),
    PrismaModule,
    CryptoModule,
    AuditModule,
    MailModule,
    MetaModule,
    StorageModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    SettingsModule,
    TemplatesModule,
    InboxesModule,
    ConversationsModule,
    WebhooksModule,
    HealthModule,
  ],
  providers: [
    // A ordem importa: o rate limit corre antes da autenticação (para proteger
    // o próprio login), a autenticação antes da autorização.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
