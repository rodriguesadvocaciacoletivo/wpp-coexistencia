import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USER_ROLES, type UserRole } from '@coexistente/shared';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class InviteUserDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome do usuário.' })
  @MaxLength(120)
  name!: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsIn(USER_ROLES, { message: 'Papel inválido.' })
  role!: UserRole;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(USER_ROLES, { message: 'Papel inválido.' })
  role?: UserRole;

  @IsOptional()
  @IsIn(['active', 'disabled'], { message: 'Status inválido.' })
  status?: 'active' | 'disabled';
}
