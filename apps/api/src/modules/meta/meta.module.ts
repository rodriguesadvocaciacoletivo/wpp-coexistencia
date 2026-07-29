import { Global, Module } from '@nestjs/common';
import { MetaGraphService } from './meta-graph.service';

@Global()
@Module({
  providers: [MetaGraphService],
  exports: [MetaGraphService],
})
export class MetaModule {}
