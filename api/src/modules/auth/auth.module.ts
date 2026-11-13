import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackgroundService } from '../../common/services/background.service';
import { SecurityModule } from '../security/security.module';
import { AuthController } from './controllers/auth.controller';
import { CodesController } from './controllers/codes.controller';
import { CodeEvent } from './entities/code-event.entity';
import { CommonPassword } from './entities/common-password.entity';
import { LoginAttempt } from './entities/login-attempt.entity';
import { CodeEventsRepository } from './repositories/code-events.repository';
import { CommonPasswordsRepository } from './repositories/common-passwords.repository';
import { LoginAttemptsRepository } from './repositories/login-attempts.repository';
import { CodesService } from './services/codes.service';
import { SessionsService } from './services/sessions.service';
import { SupabaseAuthService } from './services/supabase-auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([LoginAttempt, CommonPassword, CodeEvent]), SecurityModule],
  controllers: [AuthController, CodesController],
  providers: [
    SupabaseAuthService,
    SessionsService,
    CodesService,
    BackgroundService,
    LoginAttemptsRepository,
    CodeEventsRepository,
    CommonPasswordsRepository,
  ],
  exports: [SupabaseAuthService],
})
export class AuthModule {}
