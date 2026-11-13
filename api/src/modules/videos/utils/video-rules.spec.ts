import { ApiException } from '../../../common/utils/api-exception';
import { assertStoredVideo, assertVideoUpload, canTransition, constantTimeEquals, isStale, originalPath, videoBasePath } from './video-rules';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof ApiException ? `${error.code}:${error.apiMessage}` : 'otro';
  }
  return undefined;
};

describe('reglas de video', () => {
  it('acepta MP4, MOV y WebM de 1 byte a 1 GiB y devuelve la extensión', () => {
    expect(assertVideoUpload('video/mp4', 1)).toBe('mp4');
    expect(assertVideoUpload('video/quicktime', 1_073_741_824)).toBe('mov');
    expect(assertVideoUpload('video/webm', 10)).toBe('webm');
  });

  it('rechaza otro tipo o más de 1 GiB con VIDEO_INVALIDO', () => {
    expect(codeOf(() => assertVideoUpload('video/avi', 10))).toBe('VIDEO_INVALIDO:El video debe ser MP4, MOV o WebM.');
    expect(codeOf(() => assertVideoUpload('video/mp4', 1_073_741_825))).toBe('VIDEO_INVALIDO:El video no puede pesar más de 1 GiB.');
  });

  it('las rutas usan los ids reales y la extensión del tipo', () => {
    const base = videoBasePath('cursos/1/secciones/2/clases/3', 40);
    expect(base).toBe('cursos/1/secciones/2/clases/3/40');
    expect(originalPath(base, 'video/quicktime')).toBe('cursos/1/secciones/2/clases/3/40/original.mov');
  });

  it('al confirmar, el objeto debe existir y coincidir con lo declarado', () => {
    const declared = { contentType: 'video/mp4', sizeBytes: 100 };
    expect(codeOf(() => assertStoredVideo(null, declared, false))).toBe('VIDEO_INVALIDO:El video todavía no se subió.');
    expect(codeOf(() => assertStoredVideo(null, declared, true))).toBe('VIDEO_INVALIDO:El archivo original ya no está: sube el video otra vez.');
    expect(codeOf(() => assertStoredVideo({ contentType: 'video/mp4', size: 99 }, declared, false))).toBe('VIDEO_INVALIDO:El archivo subido no coincide con lo declarado.');
    expect(codeOf(() => assertStoredVideo({ contentType: 'video/webm', size: 100 }, declared, false))).toBe('VIDEO_INVALIDO:El archivo subido no coincide con lo declarado.');
    expect(codeOf(() => assertStoredVideo({ contentType: 'video/mp4', size: 100 }, declared, false))).toBeUndefined();
  });

  it('transiciones de estado permitidas', () => {
    expect(canTransition('esperando_archivo', 'en_cola')).toBe(true);
    expect(canTransition('en_cola', 'listo')).toBe(true);
    expect(canTransition('procesando', 'error')).toBe(true);
    expect(canTransition('error', 'en_cola')).toBe(true);
    expect(canTransition('esperando_archivo', 'listo')).toBe(false);
    expect(canTransition('listo', 'error')).toBe(false);
    expect(canTransition('error', 'listo')).toBe(false);
  });

  it('el tiempo máximo son 45 minutos sin cambios y solo cuenta en cola o procesando', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    const ago = (minutes: number): Date => new Date(now.getTime() - minutes * 60_000);
    expect(isStale('en_cola', ago(46), now)).toBe(true);
    expect(isStale('procesando', ago(46), now)).toBe(true);
    expect(isStale('en_cola', ago(45), now)).toBe(false);
    expect(isStale('en_cola', ago(44), now)).toBe(false);
    expect(isStale('esperando_archivo', ago(600), now)).toBe(false);
    expect(isStale('listo', ago(600), now)).toBe(false);
  });

  it('compara el secreto en tiempo constante: igual sí, distinto, vacío o ausente no', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abd', 'abc')).toBe(false);
    expect(constantTimeEquals('abcd', 'abc')).toBe(false);
    expect(constantTimeEquals('', 'abc')).toBe(false);
    expect(constantTimeEquals(undefined, 'abc')).toBe(false);
  });
});
