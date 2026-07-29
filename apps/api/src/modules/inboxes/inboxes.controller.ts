import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  InboxDetailDto,
  InboxDto,
  InboxValidationDto,
  TemplateDto,
  TemplateSyncResultDto,
} from '@coexistente/shared';
import { AdminOnly } from '../../common/auth/decorators';
import { CurrentUser } from '../../common/auth/current-user';
import { clientIp } from '../../common/http/client-ip';
import { TemplatesService } from '../templates/templates.service';
import { CreateTemplateDto } from '../templates/dto/templates.dto';
import {
  CreateInboxDto,
  SetInboxMembersDto,
  UpdateInboxDto,
  ValidateInboxDto,
} from './dto/inboxes.dto';
import { InboxesService } from './inboxes.service';

@Controller('inboxes')
export class InboxesController {
  constructor(
    private readonly inboxes: InboxesService,
    private readonly templates: TemplatesService,
  ) {}

  /** Leitura liberada a agentes — a Fase 3 lista conversas por caixa. */
  @Get()
  list(): Promise<InboxDto[]> {
    return this.inboxes.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InboxDetailDto> {
    return this.inboxes.findOne(id);
  }

  /**
   * Confere as credenciais sem gravar nada.
   *
   * O wizard usa isto no passo anterior ao salvar, para o administrador
   * confirmar que conectou o número certo antes de criar a caixa.
   */
  @AdminOnly()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(@Body() dto: ValidateInboxDto): Promise<InboxValidationDto> {
    return this.inboxes.validateCredentials(dto);
  }

  @AdminOnly()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateInboxDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<InboxDetailDto> {
    return this.inboxes.create(dto, { actorId, ipAddress: clientIp(request) });
  }

  @AdminOnly()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInboxDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<InboxDetailDto> {
    return this.inboxes.update(id, dto, { actorId, ipAddress: clientIp(request) });
  }

  @AdminOnly()
  @Put(':id/members')
  setMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetInboxMembersDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<InboxDetailDto> {
    return this.inboxes.setMembers(id, dto, { actorId, ipAddress: clientIp(request) });
  }

  @AdminOnly()
  @Post(':id/revalidate')
  @HttpCode(HttpStatus.OK)
  revalidate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<InboxDetailDto> {
    return this.inboxes.revalidate(id, { actorId, ipAddress: clientIp(request) });
  }

  @AdminOnly()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.inboxes.remove(id, { actorId, ipAddress: clientIp(request) });
  }

  // ---------------------------------------------------------------------------
  // Templates da caixa
  // ---------------------------------------------------------------------------

  /** Agentes leem os templates — a Fase 4 os usa no composer. */
  @Get(':id/templates')
  listTemplates(@Param('id', ParseUUIDPipe) id: string): Promise<TemplateDto[]> {
    return this.templates.listByInbox(id);
  }

  @AdminOnly()
  @Post(':id/sync-templates')
  @HttpCode(HttpStatus.OK)
  syncTemplates(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TemplateSyncResultDto> {
    return this.templates.sync(id);
  }

  @AdminOnly()
  @Post(':id/templates')
  @HttpCode(HttpStatus.CREATED)
  createTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTemplateDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<TemplateDto> {
    return this.templates.create(id, dto, { actorId, ipAddress: clientIp(request) });
  }

  @AdminOnly()
  @Delete(':id/templates/:templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.templates.remove(id, templateId, {
      actorId,
      ipAddress: clientIp(request),
    });
  }
}
