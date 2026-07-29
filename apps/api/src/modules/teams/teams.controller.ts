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
import type { TeamDetailDto, TeamDto } from '@coexistente/shared';
import { AdminOnly } from '../../common/auth/decorators';
import { CurrentUser } from '../../common/auth/current-user';
import { clientIp } from '../../common/http/client-ip';
import {
  CreateTeamDto,
  SetTeamMembersDto,
  UpdateTeamDto,
} from './dto/teams.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  /** Leitura liberada a agentes — a Fase 3 atribui conversas a times. */
  @Get()
  list(): Promise<TeamDto[]> {
    return this.teamsService.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TeamDetailDto> {
    return this.teamsService.findOne(id);
  }

  @AdminOnly()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTeamDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<TeamDto> {
    return this.teamsService.create(dto, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @AdminOnly()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<TeamDto> {
    return this.teamsService.update(id, dto, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @AdminOnly()
  @Put(':id/members')
  setMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTeamMembersDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<TeamDetailDto> {
    return this.teamsService.setMembers(id, dto, {
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
    return this.teamsService.remove(id, {
      actorId,
      ipAddress: clientIp(request),
    });
  }
}
