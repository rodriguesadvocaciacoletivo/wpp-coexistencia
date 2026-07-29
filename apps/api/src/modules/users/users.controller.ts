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
import type { InvitationDto, UserDto } from '@coexistente/shared';
import { AdminOnly } from '../../common/auth/decorators';
import { CurrentUser } from '../../common/auth/current-user';
import { clientIp } from '../../common/http/client-ip';
import { InviteUserDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Listagem de usuários é liberada a agentes: a Fase 3 precisa dela para
   * montar o seletor de transferência de conversa. O DTO não expõe nada além
   * de nome, e-mail, papel e status.
   */
  @Get()
  list(): Promise<UserDto[]> {
    return this.usersService.list();
  }

  @AdminOnly()
  @Get('invitations')
  listInvitations(): Promise<InvitationDto[]> {
    return this.usersService.listInvitations();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.usersService.findOne(id);
  }

  @AdminOnly()
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Body() dto: InviteUserDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<{ user: UserDto; emailSent: boolean }> {
    return this.usersService.invite(dto, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @AdminOnly()
  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.OK)
  resendInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<{ emailSent: boolean }> {
    return this.usersService.resendInvitation(id, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @AdminOnly()
  @Delete(':id/invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.usersService.revokeInvitation(id, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @AdminOnly()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.usersService.update(id, dto, {
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
    return this.usersService.remove(id, {
      actorId,
      ipAddress: clientIp(request),
    });
  }
}
