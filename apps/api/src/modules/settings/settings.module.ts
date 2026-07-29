import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SmtpService } from './smtp.service';

@Module({
  controllers: [SettingsController],
  providers: [SmtpService],
  exports: [SmtpService],
})
export class SettingsModule {}
