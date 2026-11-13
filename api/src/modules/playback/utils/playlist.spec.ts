import { MAX_SEGMENTS, parsePlaylist, rewritePlaylist } from './playlist';

const KEY = '#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x0123456789ABCDEF0123456789ABCDEF';
const playlist = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6', '#EXT-X-MEDIA-SEQUENCE:1', '#EXT-X-PLAYLIST-TYPE:VOD', KEY, '#EXTINF:6.000000,', 'segmento_00001.ts', '#EXTINF:3.5,', 'segmento_00002.ts', '#EXT-X-ENDLIST', ''].join('\n');

describe('lista .m3u8', () => {
  it('encuentra los segmentos en orden', () => {
    expect(parsePlaylist(playlist).segments).toEqual(['segmento_00001.ts', 'segmento_00002.ts']);
  });

  it('sustituye cada segmento por su URL firmada y deja intacto el resto, incluido #EXT-X-KEY', () => {
    const urls = new Map([
      ['segmento_00001.ts', '/almacen/object/sign/videos/v/hls/segmento_00001.ts?token=a'],
      ['segmento_00002.ts', '/almacen/object/sign/videos/v/hls/segmento_00002.ts?token=b'],
    ]);
    const out = rewritePlaylist(parsePlaylist(playlist), urls);
    expect(out.split('\n')).toEqual(playlist.split('\n').map((line) => urls.get(line) ?? line));
    expect(out).toContain(KEY);
    expect(out).not.toMatch(/^segmento_\d{5}\.ts$/m);
  });

  it('conserva los fines de línea CRLF sin romper la coincidencia', () => {
    const out = rewritePlaylist(parsePlaylist(playlist.replace(/\n/g, '\r\n')), new Map([['segmento_00001.ts', 'u1'], ['segmento_00002.ts', 'u2']]));
    expect(out).toContain('u1');
    expect(out).not.toContain('segmento_0000');
  });

  it('rechaza una línea que no sea etiqueta ni segmento_NNNNN.ts', () => {
    for (const rare of ['../x.ts', 'segmento_1.ts', 'segmento_00001.ts?x=1', 'otro/segmento_00001.ts', 'http://evil/a.ts', '/etc/passwd', ' segmento_00001.ts', 'segmento_00001.TS']) {
      expect(() => parsePlaylist(playlist.replace('segmento_00002.ts', rare))).toThrow(expect.objectContaining({ code: 'ERROR_INTERNO' }));
    }
  });

  it('rechaza una etiqueta con otro URI y una clave que no sea la de la API', () => {
    expect(() => parsePlaylist(playlist.replace(KEY, '#EXT-X-KEY:METHOD=AES-128,URI="http://evil/k",IV=0x0123456789ABCDEF0123456789ABCDEF'))).toThrow();
    expect(() => parsePlaylist(playlist.replace('#EXT-X-TARGETDURATION:6', '#EXT-X-MAP:URI="init.mp4"'))).toThrow();
  });

  it('rechaza una lista sin cabecera, sin segmentos o con demasiados', () => {
    expect(() => parsePlaylist('segmento_00001.ts')).toThrow();
    expect(() => parsePlaylist('#EXTM3U\n#EXT-X-ENDLIST\n')).toThrow();
    const many = ['#EXTM3U', ...Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => `segmento_${String(i).padStart(5, '0')}.ts`)].join('\n');
    expect(() => parsePlaylist(many)).toThrow();
  });

  it('falla si falta la URL firmada de un segmento', () => {
    expect(() => rewritePlaylist(parsePlaylist(playlist), new Map())).toThrow(expect.objectContaining({ code: 'ERROR_INTERNO' }));
  });

  // Salida literal de `ffmpeg -f hls -hls_time 6 -hls_playlist_type vod -hls_list_size 0 -start_number 1 -hls_key_info_file ...`
  // (los mismos parámetros del transcodificador), con un video de 14 s.
  it('acepta la lista real que escribe ffmpeg (IV en minúsculas, TARGETDURATION y MEDIA-SEQUENCE) y la reescribe', () => {
    const real = [
      '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:10', '#EXT-X-MEDIA-SEQUENCE:1', '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x0123456789abcdef0123456789abcdef',
      '#EXTINF:10.000000,', 'segmento_00001.ts', '#EXTINF:4.000000,', 'segmento_00002.ts', '#EXT-X-ENDLIST', '',
    ].join('\n');
    const parsed = parsePlaylist(real);
    expect(parsed.segments).toEqual(['segmento_00001.ts', 'segmento_00002.ts']);
    const out = rewritePlaylist(parsed, new Map([['segmento_00001.ts', 'u1'], ['segmento_00002.ts', 'u2']]));
    expect(out).toContain('#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x0123456789abcdef0123456789abcdef');
    expect(out).toContain('u1\n#EXTINF:4.000000,\nu2');
  });

  it('acepta etiquetas HLS inocuas (DISCONTINUITY, TARGETDURATION...) pero no firma ni acepta otra ruta ni otro URI', () => {
    const odd = playlist.replace('#EXT-X-ENDLIST', '#EXT-X-DISCONTINUITY\n#EXT-X-ENDLIST');
    expect(parsePlaylist(odd).segments).toHaveLength(2);
    expect(() => parsePlaylist(playlist.replace('URI="clave"', 'URI="otra"'))).toThrow(expect.objectContaining({ code: 'ERROR_INTERNO' }));
    expect(() => parsePlaylist(playlist.replace('segmento_00002.ts', '../segmento_00002.ts'))).toThrow(expect.objectContaining({ code: 'ERROR_INTERNO' }));
  });
});
