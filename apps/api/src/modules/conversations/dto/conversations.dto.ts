import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CONVERSATION_FILTERS,
  CONVERSATION_PRIORITIES,
  CONVERSATION_STATUSES,
  type ConversationFilter,
  type ConversationPriority,
  type ConversationStatus,
} from '@coexistente/shared';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListConversationsDto {
  @IsOptional()
  @IsIn(CONVERSATION_FILTERS, { message: 'Filtro inválido.' })
  filter?: ConversationFilter;

  @IsOptional()
  @IsUUID('4')
  inboxId?: string;

  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: ConversationStatus;

  @IsOptional()
  @IsIn(CONVERSATION_PRIORITIES)
  priority?: ConversationPriority;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ListMessagesDto {
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  limit?: number;
}

export class UpdateConversationDto {
  /** `null` remove o responsável, deixando a conversa não atribuída. */
  @IsOptional()
  @IsUUID('4', { message: 'Agente inválido.' })
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Time inválido.' })
  teamId?: string | null;

  @IsOptional()
  @IsIn(CONVERSATION_PRIORITIES, { message: 'Prioridade inválida.' })
  priority?: ConversationPriority;

  @IsOptional()
  @IsIn(CONVERSATION_STATUSES, { message: 'Status inválido.' })
  status?: ConversationStatus;
}

/**
 * Envio de mensagem.
 *
 * Chega sempre como multipart, para que texto e anexo usem a mesma rota. Por
 * isso `privateNote` é string — campos de formulário não têm tipo booleano.
 */
export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096, { message: 'A Cloud API aceita no máximo 4096 caracteres.' })
  content?: string;

  @IsOptional()
  @IsBooleanString({ message: 'Valor inválido para nota privada.' })
  privateNote?: string;
}

/**
 * Envio de template. JSON, e não multipart como o envio comum: aqui não há
 * arquivo, e as variáveis são um objeto aninhado que não sobreviveria a um
 * formulário sem serialização manual.
 */
export class SendTemplateDto {
  @IsUUID('4', { message: 'Template inválido.' })
  templateId!: string;

  @IsOptional()
  @IsObject({ message: 'Variáveis em formato inválido.' })
  variables?: Record<string, string>;
}

export class RenameContactDto {
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  displayName!: string;
}
