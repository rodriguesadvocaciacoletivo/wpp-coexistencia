import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, Validate } from 'class-validator';
import {
  isPasswordAcceptable,
  describePasswordPolicy,
  PASSWORD_MIN_LENGTH,
} from '@coexistente/shared';
import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * A política de senha vive no pacote compartilhado para que frontend e backend
 * apliquem exatamente a mesma regra. Este validador é só a ponte para o
 * class-validator.
 */
@ValidatorConstraint({ name: 'passwordPolicy', async: false })
export class PasswordPolicyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isPasswordAcceptable(value);
  }

  defaultMessage(): string {
    return describePasswordPolicy();
  }
}

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @IsString({ message: 'Informe a senha.' })
  @MinLength(1, { message: 'Informe a senha.' })
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1, { message: 'Token ausente.' })
  token!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: describePasswordPolicy() })
  @Validate(PasswordPolicyConstraint)
  password!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1, { message: 'Token ausente.' })
  token!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: describePasswordPolicy() })
  @Validate(PasswordPolicyConstraint)
  password!: string;
}
