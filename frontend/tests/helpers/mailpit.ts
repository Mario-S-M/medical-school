import { request, type APIRequestContext } from '@playwright/test';

let api: APIRequestContext | undefined;
// Cliente de Playwright hacia Mailpit (no usa `fetch`).
const mailpit = async () => (api ??= await request.newContext({ baseURL: 'http://127.0.0.1:8025/api/v1/' }));

async function buscar(correo: string) {
  const r = await (await mailpit()).get('search', { params: { query: `to:${correo}` } });
  return (await r.json()).messages as { ID: string }[];
}

export async function countEmails(correo: string): Promise<number> {
  return (await buscar(correo)).length;
}

// Espera un correo nuevo para `correo` (más de `previos`) y devuelve su código de 6 dígitos.
export async function waitForCode(correo: string, previos = 0): Promise<string> {
  for (let intento = 0; intento < 50; intento++) {
    const mensajes = await buscar(correo);
    if (mensajes.length > previos) {
      const detalle = await (await (await mailpit()).get(`message/${mensajes[0].ID}`)).json();
      const codigo = /\b(\d{6})\b/.exec(detalle.Text)?.[1];
      if (codigo) return codigo;
    }
    await new Promise((resolver) => setTimeout(resolver, 300));
  }
  throw new Error(`No llegó ningún código a ${correo}`);
}

// Borra de Mailpit los correos enviados a las cuentas de prueba (@ejemplo.test), para no dejar nada al terminar.
export async function deleteTestEmails() {
  await (await mailpit()).delete('search', { params: { query: 'to:ejemplo.test' } });
}
