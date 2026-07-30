import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** IDs da Meta são numéricos e longos. Validar aqui evita uma ida inútil à Graph API. */
const META_ID = /^\d{5,}$/;

export class ValidateInboxDto {
  @Transform(trim)
  @IsString()
  @Matches(META_ID, {
    message:
      'O ID do número de telefone deve conter apenas dígitos. Copie do painel do Meta Developers.',
  })
  phoneNumberId!: string;

  @Transform(trim)
  @IsString()
  @Matches(META_ID, {
    message:
      'O ID da conta do WhatsApp Business deve conter apenas dígitos. Copie do painel do Meta Developers.',
  })
  wabaId!: string;

  @IsString()
  @MinLength(20, { message: 'O token informado é curto demais para ser válido.' })
  @MaxLength(1000)
  token!: string;
}

export class CreateInboxDto extends ValidateInboxDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe um nome para a caixa de entrada.' })
  @MaxLength(120)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(8, { message: 'Informe o número de telefone.' })
  @MaxLength(32)
  phoneNumber!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'Identificador de agente inválido.' })
  memberIds?: string[];

  /**
   * Registra o endereço desta API como destino dos webhooks da WABA.
   *
   * Desligado por padrão de propósito: o override substitui o destino, então
   * ligar tira o número de qualquer outro sistema que o receba hoje.
   */
  @IsOptional()
  @IsBoolean()
  registerWebhook?: boolean;
}

export class UpdateInboxDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /** Omitir preserva o token salvo. Informar dispara nova validação. */
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  token?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'Identificador de agente inválido.' })
  memberIds?: string[];

  /** Liga ou desliga o override do webhook. Reassina a WABA quando muda. */
  @IsOptional()
  @IsBoolean()
  registerWebhook?: boolean;
}

export class SetInboxMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'Identificador de agente inválido.' })
  userIds!: string[];
}
