import { assertCoverUpload, assertStoredCover, isCoverPathOf, MAX_COVER_BYTES, newCoverPath } from './cover-rules';

describe('cover-rules', () => {
  it('acepta JPG, PNG y WebP de hasta 2 097 152 bytes y devuelve la extensión', () => {
    expect(assertCoverUpload('image/jpeg', 1)).toBe('jpg');
    expect(assertCoverUpload('image/png', MAX_COVER_BYTES)).toBe('png');
    expect(assertCoverUpload('image/webp', 100)).toBe('webp');
  });
  it('rechaza otro tipo o más de 2 MB con PORTADA_INVALIDA (422) y el mensaje del workflow', () => {
    expect(() => assertCoverUpload('image/gif', 100)).toThrow('La portada debe ser una imagen JPG, PNG o WebP.');
    expect(() => assertCoverUpload('image/png', MAX_COVER_BYTES + 1)).toThrow('La portada no puede pesar más de 2 MB.');
    try {
      assertCoverUpload('image/gif', 100);
    } catch (error) {
      expect(error).toMatchObject({ code: 'PORTADA_INVALIDA' });
      expect((error as { getStatus(): number }).getStatus()).toBe(422);
    }
  });
  it('el tipo se revisa antes que el tamaño', () => {
    expect(() => assertCoverUpload('image/gif', MAX_COVER_BYTES + 1)).toThrow('JPG, PNG o WebP.');
  });
  it('genera rutas del curso que pasan la comprobación y no se repiten', () => {
    const a = newCoverPath(12, 'png');
    expect(a).toMatch(/^cursos\/12\/portada-[0-9a-f]{32}\.png$/);
    expect(isCoverPathOf(12, a)).toBe(true);
    expect(newCoverPath(12, 'png')).not.toBe(a);
  });
  it('rechaza rutas de otro curso, con otra forma o con recorrido de carpetas', () => {
    const a = newCoverPath(12, 'png');
    expect(isCoverPathOf(13, a)).toBe(false);
    expect(isCoverPathOf(1, a)).toBe(false);
    expect(isCoverPathOf(12, 'cursos/12/portada-0123.png')).toBe(false);
    expect(isCoverPathOf(12, `${a}.gif`)).toBe(false);
    expect(isCoverPathOf(12, a.replace('cursos/12/', 'cursos/12/../13/'))).toBe(false);
  });
  it('revisa lo que informa Storage', () => {
    expect(() => assertStoredCover(null)).toThrow('La portada todavía no se subió.');
    expect(() => assertStoredCover({ contentType: 'image/gif', size: 10 })).toThrow('hasta 2 MB');
    expect(() => assertStoredCover({ contentType: 'image/png', size: MAX_COVER_BYTES + 1 })).toThrow('hasta 2 MB');
    expect(() => assertStoredCover({ contentType: 'image/png', size: MAX_COVER_BYTES })).not.toThrow();
  });
});
