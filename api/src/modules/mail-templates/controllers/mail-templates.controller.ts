import { Controller, Get, Header, Logger, OnModuleInit, Param } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { uniformError } from '../../../common/utils/api-exception';

export const TEMPLATES_DIRECTORY = process.env.DIRECTORIO_PLANTILLAS ?? resolve(__dirname, '../../../../templates');
const VALID_NAME = /^[a-z0-9_]+\.html$/;

// Plantillas de correo de Supabase Auth (la descarga por la red interna de Docker, sin `Origin`). No llevan secretos.
// Solo se sirven los `.html` que existen en `api/templates/` al arrancar, desde memoria: ni listado ni lectura de
// rutas arbitrarias del disco (el nombre se compara contra el mapa, nunca se concatena a una ruta).
@Controller('plantillas-correo')
export class MailTemplatesController implements OnModuleInit {
  private readonly logger = new Logger('MailTemplates');
  private readonly templates = new Map<string, Buffer>();

  onModuleInit(): void {
    for (const name of readdirSync(TEMPLATES_DIRECTORY)) {
      if (VALID_NAME.test(name)) this.templates.set(name, readFileSync(join(TEMPLATES_DIRECTORY, name)));
    }
    this.logger.log(`${this.templates.size} plantillas cargadas`);
  }

  @Get(':name')
  @Header('Content-Type', 'text/html; charset=utf-8')
  get(@Param('name') name: string): Buffer {
    const content = this.templates.get(name);
    if (!content) throw uniformError(404, 'NO_ENCONTRADO');
    return content;
  }
}
