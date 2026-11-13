import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ClientIp } from '../../../common/decorators/client-ip.decorator';
import { ValidatorPipe } from '../../../common/pipes/validator.pipe';
import { EmailDto } from '../dto/email.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { CodesService } from '../services/codes.service';
import { INVALID_REQUEST_MESSAGE, validateEmailOnly, validateResetPassword, validateVerifyEmail } from '../validators/request.validators';

// Los cuerpos de entrada los valida `validators/request.validators.ts`: reglas de la SPEC 05.
@Controller('api/v1')
export class CodesController {
  constructor(private readonly codes: CodesService) {}

  @Post('verificaciones-correo')
  @HttpCode(200)
  verifyEmail(@Body(new ValidatorPipe(validateVerifyEmail, INVALID_REQUEST_MESSAGE)) dto: VerifyEmailDto, @ClientIp() ip: string): Promise<{ mensaje: string }> {
    return this.codes.verifyEmail(dto, ip);
  }

  @Post('verificaciones-correo/reenvio')
  @HttpCode(202)
  resendVerification(@Body(new ValidatorPipe(validateEmailOnly, INVALID_REQUEST_MESSAGE)) dto: EmailDto, @ClientIp() ip: string): Promise<{ mensaje: string }> {
    return this.codes.resendVerification(dto, ip);
  }

  @Post('recuperaciones')
  @HttpCode(202)
  requestRecovery(@Body(new ValidatorPipe(validateEmailOnly, INVALID_REQUEST_MESSAGE)) dto: EmailDto, @ClientIp() ip: string): Promise<{ mensaje: string }> {
    return this.codes.requestRecovery(dto, ip);
  }

  @Post('recuperaciones/restablecimiento')
  @HttpCode(200)
  resetPassword(@Body(new ValidatorPipe(validateResetPassword, INVALID_REQUEST_MESSAGE)) dto: ResetPasswordDto, @ClientIp() ip: string): Promise<{ mensaje: string }> {
    return this.codes.resetPassword(dto, ip);
  }
}
