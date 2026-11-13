import { uniformError } from '../../../common/utils/api-exception';

// Solo los segmentos que escribe el transcodificador (`segmento_00001.ts`). Cualquier otra ruta jamás se firma.
const SEGMENT_LINE = /^segmento_\d{5}\.ts$/;
const KEY_LINE = /^#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x[0-9A-Fa-f]{32}$/;
export const MAX_SEGMENTS = 5000;

export interface ParsedPlaylist {
  lines: string[];
  segments: string[]; // nombres de archivo, en el orden de aparición
}

// Separa la lista `.m3u8` en líneas y localiza los segmentos. Una lista que no sea de este formato se rechaza entera
// (`ERROR_INTERNO`): una línea que no sea etiqueta ni `segmento_NNNNN.ts`, o una etiqueta con `URI=` que no sea la de la
// clave, podrían sacar una ruta arbitraria del bucket o apuntar a otro lado.
export function parsePlaylist(text: string): ParsedPlaylist {
  const lines = text.split(/\r?\n/);
  const segments: string[] = [];
  for (const line of lines) {
    if (line === '') continue;
    if (line.startsWith('#')) {
      if (/URI\s*=/i.test(line) && !KEY_LINE.test(line)) throw uniformError(500, 'ERROR_INTERNO');
      continue;
    }
    if (!SEGMENT_LINE.test(line)) throw uniformError(500, 'ERROR_INTERNO');
    segments.push(line);
  }
  if (!lines[0]?.startsWith('#EXTM3U') || segments.length === 0 || segments.length > MAX_SEGMENTS) throw uniformError(500, 'ERROR_INTERNO');
  return { lines, segments };
}

// Sustituye cada línea de segmento por su URL firmada (`urls[nombre]`); lo demás, incluido `#EXT-X-KEY`, queda tal cual.
export function rewritePlaylist(parsed: ParsedPlaylist, urls: ReadonlyMap<string, string>): string {
  return parsed.lines
    .map((line) => {
      if (!SEGMENT_LINE.test(line)) return line;
      const url = urls.get(line);
      if (url === undefined) throw uniformError(500, 'ERROR_INTERNO');
      return url;
    })
    .join('\n');
}
