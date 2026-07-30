import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { InboxesController } from './inboxes.controller';
import { InboxesService } from './inboxes.service';
import { InboxesScheduler } from './inboxes.scheduler';

@Module({
  imports: [TemplatesModule],
  controllers: [InboxesController],
  // O scheduler depende do ScheduleModule, que só é registrado fora da Vercel.
  providers: [
    InboxesService,
    ...(process.env.VERCEL ? [] : [InboxesScheduler]),
  ],
  exports: [InboxesService],
})
export class InboxesModule {}
