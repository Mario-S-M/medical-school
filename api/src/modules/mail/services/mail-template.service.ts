import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES_DIRECTORY } from '../../mail-templates/controllers/mail-templates.controller';

const VALID_NAME = /^[a-z0-9-]+\.html$/;
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Rellena una plantilla de `api/templates/` (`{{nombre}}` -> valor escapado). Los nombres de plantilla con guion
// (`team-invitation.html`) no los sirve por HTTP el módulo `mail-templates`, que solo expone los de Supabase Auth
// (`^[a-z0-9_]+\.html$`): son plantillas internas de la API.
@Injectable()
export class MailTemplateService {
  private readonly cache = new Map<string, string>();

  render(name: string, values: Record<string, string>): string {
    let html = this.load(name);
    for (const [key, value] of Object.entries(values)) html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
    return html;
  }

  private load(name: string): string {
    if (!VALID_NAME.test(name)) throw new Error(`Nombre de plantilla no válido: ${name}`);
    let html = this.cache.get(name);
    if (html === undefined) {
      html = readFileSync(join(TEMPLATES_DIRECTORY, name), 'utf8');
      this.cache.set(name, html);
    }
    return html;
  }
}
