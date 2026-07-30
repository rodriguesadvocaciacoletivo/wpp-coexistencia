import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { InboxesController } from './inboxes.controller';
import { InboxesService } from './inboxes.service';
import { InboxesScheduler } from './inboxes.scheduler';

@Module({
  imports: [TemplatesModule],
  controllers: [InboxesController],
  // O scheduler é provido sempre. Os decoradores `@Cron` só têm efeito com o
  // ScheduleModule registrado — fora da Vercel eles disparam sozinhos; na
  // Vercel ficam inertes e os mesmos métodos são chamados pelas rotas de
  // /jobs, acionadas pelo cron da plataforma.
  providers: [InboxesService, InboxesScheduler],
  exports: [InboxesService, InboxesScheduler],
})
export class InboxesModule {}
