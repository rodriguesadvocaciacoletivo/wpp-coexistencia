import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { MediaController } from './media.controller';
import { ConversationsService } from './conversations.service';
import { MessageIngestionService } from './message-ingestion.service';
import { MessageSendingService } from './message-sending.service';

@Module({
  controllers: [ConversationsController, MediaController],
  providers: [
    ConversationsService,
    MessageIngestionService,
    MessageSendingService,
  ],
  exports: [ConversationsService, MessageIngestionService, MessageSendingService],
})
export class ConversationsModule {}
