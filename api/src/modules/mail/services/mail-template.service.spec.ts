import { escapeHtml, MailTemplateService } from './mail-template.service';

describe('MailTemplateService', () => {
  const service = new MailTemplateService();

  it('escapa el HTML de los valores', () => {
    expect(escapeHtml(`<b>"Ada" & 'Co'</b>`)).toBe('&lt;b&gt;&quot;Ada&quot; &amp; &#39;Co&#39;&lt;/b&gt;');
  });

  it('rellena team-invitation.html: en español, sin enlaces y sin marcas pendientes', () => {
    const html = service.render('team-invitation.html', { nombre_instructor: '<script>Ada</script>', fecha_limite: '20 de noviembre de 2026' });
    expect(html).toContain('Te invitaron al equipo de apoyo');
    expect(html).toContain('<strong>&lt;script&gt;Ada&lt;/script&gt;</strong>');
    expect(html).toContain('La invitación vence el <strong>20 de noviembre de 2026</strong>.');
    expect(html).not.toContain('{{');
    expect(html).not.toMatch(/https?:|<a[\s>]|href=/i);
  });

  it('rechaza nombres de plantilla que no sean un .html simple (sin rutas)', () => {
    for (const name of ['../package.json', 'a/b.html', 'x.txt', 'Equipo.html', '']) expect(() => service.render(name, {})).toThrow('Nombre de plantilla no válido');
  });
});
