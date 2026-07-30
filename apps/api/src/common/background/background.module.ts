import { Global, Module } from '@nestjs/common';
import { BackgroundService } from './background.service';

@Global()
@Module({
  providers: [BackgroundService],
  exports: [BackgroundService],
})
export class BackgroundModule {}
