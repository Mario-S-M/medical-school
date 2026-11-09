const API = 'http://127.0.0.1:8025/api/v1';

async function buscar(correo: string) {
  const r = await fetch(`${API}/search?query=${encodeURIComponent(`to:${correo}`)}`);
  return (await r.json()).messages as { ID: string }[];
}

export async function contarCorreos(correo: string): Promise<number> {
  return (await buscar(correo)).length;
}

// Espera un correo nuevo para `correo` (más de `previos`) y devuelve su código de 6 dígitos.
export async function esperarCodigo(correo: string, previos = 0): Promise<string> {
  for (let intento = 0; intento < 50; intento++) {
    const mensajes = await buscar(correo);
    if (mensajes.length > previos) {
      const detalle = await (await fetch(`${API}/message/${mensajes[0].ID}`)).json();
      const codigo = /\b(\d{6})\b/.exec(detalle.Text)?.[1];
      if (codigo) return codigo;
    }
    await new Promise((resolver) => setTimeout(resolver, 300));
  }
  throw new Error(`No llegó ningún código a ${correo}`);
}
