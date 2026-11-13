import { courseSlug, firstFreeSlug } from './course-slug';

describe('courseSlug', () => {
  it('quita acentos, pasa a minúsculas y separa con un guion', () => {
    expect(courseSlug('Anatomía básica')).toBe('anatomia-basica');
    expect(courseSlug('  Fisiología   Humana: ¡Nivel 1!  ')).toBe('fisiologia-humana-nivel-1');
    expect(courseSlug('Niño pingüino')).toBe('nino-pinguino');
    expect(courseSlug('Straße Æsir')).toBe('strasse-aesir');
  });

  it('un título sin letras ni números da "curso"', () => {
    expect(courseSlug('¿¿¿!!!???')).toBe('curso');
    expect(courseSlug('日本語')).toBe('curso');
  });
});

describe('firstFreeSlug', () => {
  it('usa la base si está libre y luego -2, -3...', () => {
    expect(firstFreeSlug('anatomia', new Set())).toBe('anatomia');
    expect(firstFreeSlug('anatomia', new Set(['anatomia']))).toBe('anatomia-2');
    expect(firstFreeSlug('anatomia', new Set(['anatomia', 'anatomia-2', 'anatomia-3']))).toBe('anatomia-4');
  });

  it('salta los huecos en el orden correcto y no confunde otros slugs', () => {
    expect(firstFreeSlug('a', new Set(['a', 'a-3', 'a-b']))).toBe('a-2');
  });

  it('da null tras 1000 intentos', () => {
    const taken = new Set(['a', ...Array.from({ length: 999 }, (_, i) => `a-${i + 2}`)]);
    expect(firstFreeSlug('a', taken)).toBeNull();
  });
});
