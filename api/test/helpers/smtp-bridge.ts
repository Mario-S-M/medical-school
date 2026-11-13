import { spawn } from 'node:child_process';
import { createServer, Server } from 'node:net';
import { REPO_ROOT } from './real-env';

// Las pruebas corren en el host y el SMTP de Mailpit (puerto 1025) no se publica. Este puente escucha en 127.0.0.1 y, por
// cada conexión SMTP de la app, lanza `mailpit sendmail -bs` dentro del contenedor y le pasa los bytes tal cual: la app habla
// SMTP real (nodemailer) y el correo termina en Mailpit sin tocar el compose.
export interface SmtpBridge {
  port: number;
  close(): Promise<void>;
}

export async function startSmtpBridge(): Promise<SmtpBridge> {
  const server: Server = createServer((socket) => {
    const child = spawn('docker', ['compose', 'exec', '-T', 'mailpit', '/mailpit', 'sendmail', '-bs'], { cwd: REPO_ROOT });
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
    child.stdin.on('error', () => undefined);
    socket.on('error', () => child.kill());
    socket.on('close', () => child.kill());
    child.on('close', () => socket.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
