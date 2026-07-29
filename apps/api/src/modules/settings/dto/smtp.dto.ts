import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateSmtpDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Informe o servidor SMTP.' })
  @MaxLength(255)
  host!: string;

  @IsInt({ message: 'Porta inválida.' })
  @Min(1)
  @Max(65535)
  port!: number;

  @IsBoolean()
  secure!: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  username?: string | null;

  /**
   * Omitir preserva a senha já salva — a interface não recebe a senha atual,
   * então não teria como reenviá-la ao salvar outros campos.
   * String vazia remove a senha.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string | null;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Informe o nome do remetente.' })
  @MaxLength(120)
  fromName!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Informe um e-mail de remetente válido.' })
  @MaxLength(255)
  fromEmail!: string;
}

export class TestSmtpDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Informe um e-mail de destino válido.' })
  to!: string;
}
