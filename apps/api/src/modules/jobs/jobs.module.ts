import { Module } from '@nestjs/common';
import { InboxesModule } from '../inboxes/inboxes.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { JobsController } from './jobs.controller';
import { CronGuard } from './cron.guard';

@Module({
  imports: [InboxesModule, WebhooksModule],
  controllers: [JobsController],
  providers: [CronGuard],
})
export class JobsModule {}
