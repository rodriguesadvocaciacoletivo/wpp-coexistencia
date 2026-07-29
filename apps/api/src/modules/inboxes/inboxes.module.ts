import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { InboxesController } from './inboxes.controller';
import { InboxesService } from './inboxes.service';
import { InboxesScheduler } from './inboxes.scheduler';

@Module({
  imports: [TemplatesModule],
  controllers: [InboxesController],
  providers: [InboxesService, InboxesScheduler],
  exports: [InboxesService],
})
export class InboxesModule {}
