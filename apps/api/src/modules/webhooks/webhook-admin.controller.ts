import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  WEBHOOK_EVENT_STATUSES,
  type WebhookEventDto,
  type WebhookEventStatus,
  type WebhookQueueStatsDto,
} from '@coexistente/shared';
import { AdminOnly } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WebhookQueueService } from './webhook-queue.service';
import { WebhooksService } from './webhooks.service';

class ListEventsDto {
  @IsOptional()
  @IsIn(WEBHOOK_EVENT_STATUSES)
  status?: WebhookEventStatus;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

class RetryEventsDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];
}

/**
 * Inspeção e reprocessamento da fila de webhooks.
 *
 * Existe para o caso que a fila não resolve sozinha: o evento que esgotou as
 * tentativas. Sem uma tela, a dead letter é uma tabela que ninguém olha, e o
 * evento parado ali é uma mensagem de cliente que nunca apareceu para a equipe.
 */
@AdminOnly()
@Controller('webhooks/queue')
export class WebhookAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WebhookQueueService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Get('stats')
  stats(): Promise<WebhookQueueStatsDto> {
    return this.queue.stats();
  }

  @Get('events')
  async events(@Query() query: ListEventsDto): Promise<WebhookEventDto[]> {
    const events = await this.prisma.webhookEvent.findMany({
      where: query.status ? { status: query.status } : { status: 'dead' },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });

    return events.map((event) => ({
      id: event.id,
      eventKey: event.eventKey,
      field: event.field,
      wabaId: event.wabaId,
      status: event.status,
      attempts: event.attempts,
      lastError: event.lastError,
      nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
      processedAt: event.processedAt?.toISOString() ?? null,
      createdAt: event.createdAt.toISOString(),
      payload: event.payload as Record<string, unknown>,
    }));
  }

  /** Devolve à fila. Sem `ids`, tudo que está em dead letter. */
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  async retry(@Body() dto: RetryEventsDto): Promise<{ requeued: number }> {
    return { requeued: await this.webhooks.retry(dto.ids) };
  }
}
