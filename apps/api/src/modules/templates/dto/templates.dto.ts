import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '@coexistente/shared';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTemplateDto {
  /**
   * A Meta só aceita minúsculas, números e sublinhado. Validar aqui evita uma
   * recusa com mensagem obscura depois de a requisição já ter saído.
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'O nome do template só pode conter letras minúsculas, números e sublinhado (_).',
  })
  @MinLength(2)
  @MaxLength(512)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o idioma, por exemplo pt_BR.' })
  @MaxLength(16)
  language!: string;

  @IsIn(TEMPLATE_CATEGORIES, { message: 'Categoria inválida.' })
  category!: TemplateCategory;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60, { message: 'O cabeçalho aceita no máximo 60 caracteres.' })
  headerText?: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'O corpo do template é obrigatório.' })
  @MaxLength(1024, { message: 'O corpo aceita no máximo 1024 caracteres.' })
  body!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60, { message: 'O rodapé aceita no máximo 60 caracteres.' })
  footerText?: string;

  /**
   * Valores de exemplo para as variáveis do corpo. A Meta recusa templates com
   * `{{n}}` sem exemplo — ela usa esses valores para avaliar o conteúdo.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  bodyExamples?: string[];
}
