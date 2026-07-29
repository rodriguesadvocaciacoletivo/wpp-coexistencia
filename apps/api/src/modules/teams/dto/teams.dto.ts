import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTeamDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome do time.' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateTeamDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class SetTeamMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'Identificador de usuário inválido.' })
  userIds!: string[];
}
