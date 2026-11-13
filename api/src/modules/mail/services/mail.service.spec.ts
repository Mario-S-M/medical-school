import { ConfigService } from '@nestjs/config';
import { createServer } from 'node:net';
import { MailService } from './mail.service';

const config = (port: number) => ({ getOrThrow: () => ({ host: '127.0.0.1', port }) }) as unknown as ConfigService;

describe('MailService', () => {
  it('si el servidor SMTP no responde, send devuelve false y no lanza', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    await new Promise<void>((resolve) => server.close(() => resolve())); // el puerto queda cerrado
    expect(await new MailService(config(port)).send({ to: 'a@example.com', subject: 's', html: '<p>x</p>' })).toBe(false);
  });
});
