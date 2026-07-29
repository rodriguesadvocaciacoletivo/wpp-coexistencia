import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type {
  AuthSessionDto,
  InvitationPreviewDto,
  UserDto,
} from '@coexistente/shared';
import { Public } from '../../common/auth/decorators';
import { CurrentUser } from '../../common/auth/current-user';
import { clientIp, userAgent } from '../../common/http/client-ip';
import { AuthService } from './auth.service';
import type { SessionResult } from './auth.service';
import {
  AcceptInvitationDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth.dto';

/**
 * O refresh token viaja em cookie httpOnly, não no corpo da resposta.
 *
 * Guardá-lo em localStorage o deixaria legível por qualquer script injetado na
 * página. Em httpOnly, um XSS até consegue usar a sessão enquanto a aba está
 * aberta, mas não consegue extrair o token e usá-lo depois, em outra máquina.
 *
 * `path` restrito a /auth faz o cookie não acompanhar as demais requisições.
 */
const REFRESH_COOKIE = 'coex_refresh';
/** Inclui o prefixo global da API — o cookie só acompanha as rotas de sessão. */
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  private readonly crossSite: boolean;
  private readonly secureCookie: boolean;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.crossSite = config.get<boolean>('COOKIE_CROSS_SITE') ?? false;
    // `SameSite=None` só é aceito pelo navegador junto de `Secure`, então
    // hospedagem cross-site implica HTTPS obrigatoriamente.
    this.secureCookie =
      this.crossSite || config.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    const result = await this.authService.login(dto.email, dto.password, {
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });

    return this.respondWithSession(response, result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    const token = this.readRefreshCookie(request);

    if (!token) {
      throw new UnauthorizedException('Sessão não encontrada.');
    }

    const result = await this.authService.refresh(token, {
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });

    return this.respondWithSession(response, result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.readRefreshCookie(request));

    // Os atributos precisam bater com os do `Set-Cookie` original, senão o
    // navegador trata como outro cookie e o antigo permanece no cliente.
    response.clearCookie(REFRESH_COOKIE, {
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: this.crossSite ? 'none' : 'lax',
    });
  }

  @Get('me')
  me(@CurrentUser('id') userId: string): Promise<UserDto> {
    return this.authService.me(userId);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email, clientIp(request));

    // Resposta idêntica exista ou não a conta.
    return {
      message:
        'Se houver uma conta com este e-mail, enviamos as instruções de recuperação.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.authService.resetPassword(
      dto.token,
      dto.password,
      clientIp(request),
    );
  }

  @Public()
  @Get('invitations/:token')
  previewInvitation(
    @Param('token') token: string,
  ): Promise<InvitationPreviewDto> {
    return this.authService.previewInvitation(token);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    const result = await this.authService.acceptInvitation(
      dto.token,
      dto.password,
      {
        ipAddress: clientIp(request),
        userAgent: userAgent(request),
      },
    );

    return this.respondWithSession(response, result);
  }

  private respondWithSession(
    response: Response,
    result: SessionResult,
  ): AuthSessionDto {
    response.cookie(REFRESH_COOKIE, result.refresh.token, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: this.crossSite ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: result.refresh.expiresAt,
    });

    return result.session;
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }
}
