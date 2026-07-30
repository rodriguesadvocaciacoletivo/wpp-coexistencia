import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookQueueService } from './webhook-queue.service';
import { WebhookAdminController } from './webhook-admin.controller';

@Module({
  imports: [TemplatesModule, ConversationsModule],
  controllers: [WebhooksController, WebhookAdminController],
  providers: [WebhooksService, WebhookQueueService],
  exports: [WebhooksService, WebhookQueueService],
})
export class WebhooksModule {}
