import { Body, Controller, Delete, Headers, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { RequestedWithGuard } from '../../../common/guards/requested-with.guard';
import { ClientIp } from '../../../common/decorators/client-ip.decorator';
import { ValidatorPipe } from '../../../common/pipes/validator.pipe';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { JwtGuard } from '../../security/guards/jwt.guard';
import { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { REFRESH_COOKIE, invalidSessionWithoutCookie } from '../auth-errors';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { SessionResponse, SessionsService } from '../services/sessions.service';
import { INVALID_REQUEST_MESSAGE, validateLogin, validateRegister } from '../validators/request.validators';

const REFRESH_TOKEN_FORMAT = /^[A-Za-z0-9_-]{8,128}$/;

function readCookie(header: string | undefined): string {
  for (const pair of (header ?? '').split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === REFRESH_COOKIE) return rest.join('=');
  }
  return '';
}

// Los cuerpos de entrada los valida `validators/request.validators.ts`: mensajes y orden de `detalles` de la SPEC 04.
@Controller('api/v1')
export class AuthController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('usuarios')
  register(@Body(new ValidatorPipe(validateRegister, INVALID_REQUEST_MESSAGE)) dto: RegisterDto): Promise<{ mensaje: string }> {
    return this.sessions.register(dto);
  }

  @Post('sesiones')
  @HttpCode(200)
  async login(
    @Body(new ValidatorPipe(validateLogin, INVALID_REQUEST_MESSAGE)) dto: LoginDto,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    const result = await this.sessions.login(dto, ip);
    reply.header('Set-Cookie', result.cookie);
    return result.body;
  }

  @Post('sesiones/renovacion')
  @HttpCode(200)
  @UseGuards(RequestedWithGuard)
  async refresh(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    const token = readCookie(cookie);
    if (!REFRESH_TOKEN_FORMAT.test(token)) throw invalidSessionWithoutCookie();
    const result = await this.sessions.refresh(token);
    reply.header('Set-Cookie', result.cookie);
    return result.body;
  }

  @Delete('sesiones/actual')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    reply.header('Set-Cookie', await this.sessions.logout(user));
  }
}
