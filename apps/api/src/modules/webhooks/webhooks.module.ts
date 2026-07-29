import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [TemplatesModule, ConversationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
