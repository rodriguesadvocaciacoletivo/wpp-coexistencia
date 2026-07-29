import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SmtpSettingsDto, SmtpTestResultDto } from '@coexistente/shared';
import { AdminOnly } from '../../common/auth/decorators';
import { CurrentUser } from '../../common/auth/current-user';
import { clientIp } from '../../common/http/client-ip';
import { TestSmtpDto, UpdateSmtpDto } from './dto/smtp.dto';
import { SmtpService } from './smtp.service';

@AdminOnly()
@Controller('settings')
export class SettingsController {
  constructor(private readonly smtpService: SmtpService) {}

  @Get('smtp')
  getSmtp(): Promise<SmtpSettingsDto | null> {
    return this.smtpService.get();
  }

  @Put('smtp')
  updateSmtp(
    @Body() dto: UpdateSmtpDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<SmtpSettingsDto> {
    return this.smtpService.update(dto, {
      actorId,
      ipAddress: clientIp(request),
    });
  }

  @Post('smtp/test')
  @HttpCode(HttpStatus.OK)
  testSmtp(
    @Body() dto: TestSmtpDto,
    @CurrentUser('id') actorId: string,
    @Req() request: Request,
  ): Promise<SmtpTestResultDto> {
    return this.smtpService.sendTestEmail(dto, {
      actorId,
      ipAddress: clientIp(request),
    });
  }
}
