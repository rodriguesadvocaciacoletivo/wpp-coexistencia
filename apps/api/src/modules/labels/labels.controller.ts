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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { LabelDto } from '@coexistente/shared';
import { AdminOnly } from '../../common/auth/decorators';
import { CurrentUser } from '../../common/auth/current-user';
import { clientIp } from '../../common/http/client-ip';
import { CreateLabelDto, UpdateLabelDto } from './dto/labels.dto';
import { LabelsService } from './labels.service';

@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  /**
   * Leitura liberada a agentes: quem atende precisa da lista para etiquetar e
   * para filtrar. Só a manutenção do catálogo é restrita ao administrador —
   * etiqueta criada no calor do atendimento vira lista bagunçada em uma semana.
   */
  @Get()
  list(): Promise<LabelDto[]> {
    return this.labels.list();
  }

  @AdminOnly()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateLabelDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<LabelDto> {
    return this.labels.create(dto, { actorId, ipAddress: clientIp(request) });
  }

  @AdminOnly()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<LabelDto> {
    return this.labels.update(id, dto, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @AdminOnly()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.labels.remove(id, { actorId, ipAddress: clientIp(request) });
  }
}
