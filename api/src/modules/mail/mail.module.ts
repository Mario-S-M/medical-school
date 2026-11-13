import { Module } from '@nestjs/common';
import { MailService } from './services/mail.service';
import { MailTemplateService } from './services/mail-template.service';

// Correo saliente por SMTP (nodemailer) y plantillas HTML de `api/templates/`. Lo usa el equipo de apoyo (paso 7).
@Module({
  providers: [MailService, MailTemplateService],
  exports: [MailService, MailTemplateService],
})
export class MailModule {}
