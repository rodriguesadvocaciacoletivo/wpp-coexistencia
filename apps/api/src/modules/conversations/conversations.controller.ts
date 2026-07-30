import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type {
  ConversationCountsDto,
  ConversationDto,
  MessageDto,
  Paginated,
} from '@coexistente/shared';
import { CurrentUser } from '../../common/auth/current-user';
import { clientIp } from '../../common/http/client-ip';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConversationsService } from './conversations.service';
import { MessageSendingService } from './message-sending.service';
import {
  ListConversationsDto,
  ListMessagesDto,
  RenameContactDto,
  SendMessageDto,
  SendTemplateDto,
  UpdateConversationDto,
} from './dto/conversations.dto';

/** 100 MB é o teto de documento na Cloud API — nada acima disso é útil. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly sending: MessageSendingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(
    @Query() query: ListConversationsDto,
    @CurrentUser('id') viewerId: string,
  ): Promise<Paginated<ConversationDto>> {
    return this.conversations.list(query, viewerId);
  }

  @Get('counts')
  counts(@CurrentUser('id') viewerId: string): Promise<ConversationCountsDto> {
    return this.conversations.counts(viewerId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ConversationDto> {
    return this.conversations.findOne(id);
  }

  @Get(':id/messages')
  messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesDto,
  ): Promise<Paginated<MessageDto>> {
    return this.conversations.messages(id, query.cursor, query.limit);
  }

  /**
   * Envia mensagem. Sempre multipart, para que texto, anexo e nota privada
   * usem a mesma rota — evita três caminhos com regras quase iguais.
   */
  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser('id') authorId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MessageDto> {
    const messageId = await this.sending.send({
      conversationId: id,
      authorId,
      content: dto.content,
      privateNote: dto.privateNote === 'true',
      file: file
        ? {
            buffer: file.buffer,
            mimeType: file.mimetype,
            originalName: file.originalname,
          }
        : undefined,
    });

    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: { attachments: true, author: true },
    });

    return this.conversations.toMessageDto(message);
  }

  /**
   * Envia um template aprovado. Rota separada do envio comum porque não tem
   * arquivo e não depende da janela de 24h.
   */
  @Post(':id/messages/template')
  @HttpCode(HttpStatus.CREATED)
  async sendTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendTemplateDto,
    @CurrentUser('id') authorId: string,
  ): Promise<MessageDto> {
    const messageId = await this.sending.sendTemplate({
      conversationId: id,
      authorId,
      templateId: dto.templateId,
      variables: dto.variables ?? {},
    });

    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: { attachments: true, author: true },
    });

    return this.conversations.toMessageDto(message);
  }

  /** Zera o contador local e envia o recibo de leitura à Meta. */
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sending.markConversationRead(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<ConversationDto> {
    return this.conversations.update(id, dto, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @Patch(':id/contact')
  renameContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameContactDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<ConversationDto> {
    return this.conversations.renameContact(id, dto.displayName, {
      actorId,
      ipAddress: clientIp(request),
    });
  }
}
