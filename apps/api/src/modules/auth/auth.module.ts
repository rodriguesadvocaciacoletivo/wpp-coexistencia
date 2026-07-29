import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PasswordService } from '../../common/crypto/password.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // O tipo de `expiresIn` no jsonwebtoken é um literal de duração
          // ("15m", "7d"). Como o valor vem do ambiente, a validação real fica
          // no zod do env — aqui só afirmamos o formato para o compilador.
          expiresIn: (config.get<string>('JWT_ACCESS_TTL') ??
            '15m') as JwtSignOptions['expiresIn'],
        },
      }),
      global: true,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenService, PasswordService],
  exports: [AuthService, RefreshTokenService, PasswordService],
})
export class AuthModule {}
