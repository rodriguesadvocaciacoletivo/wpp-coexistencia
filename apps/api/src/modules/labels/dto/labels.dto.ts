import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LABEL_NAME_MAX, normalizeLabelName } from '@coexistente/shared';

const normalize = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeLabelName(value) : value;

/** `#RGB` fica de fora: a interface assume seis dígitos ao clarear a cor. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateLabelDto {
  @Transform(normalize)
  @IsString()
  @MinLength(1, { message: 'Informe um nome para a etiqueta.' })
  @MaxLength(LABEL_NAME_MAX, {
    message: `A etiqueta pode ter no máximo ${LABEL_NAME_MAX} caracteres.`,
  })
  name!: string;

  @IsString()
  @Matches(HEX_COLOR, {
    message: 'Cor inválida. Use hexadecimal no formato #RRGGBB.',
  })
  color!: string;
}

export class UpdateLabelDto {
  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MinLength(1, { message: 'Informe um nome para a etiqueta.' })
  @MaxLength(LABEL_NAME_MAX)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, {
    message: 'Cor inválida. Use hexadecimal no formato #RRGGBB.',
  })
  color?: string;
}

/**
 * Substitui o conjunto de etiquetas da conversa.
 *
 * Substituição em vez de adicionar/remover uma a uma: o modal marca e desmarca
 * várias antes de salvar, e mandar o estado final evita uma sequência de
 * chamadas que pode ficar pela metade.
 */
export class SetConversationLabelsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'Identificador de etiqueta inválido.' })
  labelIds!: string[];
}
