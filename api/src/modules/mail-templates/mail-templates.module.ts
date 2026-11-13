import { Module } from '@nestjs/common';
import { MailTemplatesController } from './controllers/mail-templates.controller';

@Module({ controllers: [MailTemplatesController] })
export class MailTemplatesModule {}
