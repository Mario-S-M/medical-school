import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig } from '../../../config/configuration';

export const MAIL_FROM = 'Medical School <no-responder@escuela.local>';

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
}

// Correo por SMTP sin TLS ni autenticación (Mailpit en local; `SMTP_HOST` y `SMTP_PORT`). Un fallo de envío no es una
// excepción: devuelve `false` (un correo caído no debe romper la operación) y quien llama decide qué hacer.
@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');
  private readonly transport: Transporter;

  constructor(config: ConfigService) {
    const { host, port } = config.getOrThrow<AppConfig['mail']>('mail');
    this.transport = createTransport({ host, port, secure: false, ignoreTLS: true, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 });
  }

  async send(mail: OutgoingMail): Promise<boolean> {
    try {
      await this.transport.sendMail({ from: MAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html });
      return true;
    } catch (error) {
      // Nunca el destinatario ni el cuerpo: solo el código del fallo (ECONNECTION, ETIMEDOUT...).
      const code = (error as { code?: unknown } | null)?.code;
      this.logger.error(`No se pudo enviar el correo (${typeof code === 'string' ? code : 'desconocido'})`);
      return false;
    }
  }
}
