import { slugify } from './slugify';

describe('slugify', () => {
  it('quita acentos y pasa a minúsculas', () => {
    expect(slugify('Fisiología')).toBe('fisiologia');
    expect(slugify('ANATOMÍA Básica')).toBe('anatomia-basica');
    expect(slugify('Año ñandú')).toBe('ano-nandu');
  });
  it('une con un solo guion y recorta los de los extremos', () => {
    expect(slugify('  Cirugía --- general!! ')).toBe('cirugia-general');
    expect(slugify('A/B & C')).toBe('a-b-c');
  });
  it('los nombres que solo difieren en acentos o mayúsculas dan el mismo slug', () => {
    expect(slugify('Anatomía')).toBe(slugify('anatomia'));
    expect(slugify('ANATOMÍA')).toBe(slugify('Anatomia'));
  });
  it('conserva los números', () => {
    expect(slugify('Ciencias 2')).toBe('ciencias-2');
  });
  it('un nombre sin letras latinas ni números da un slug vacío (igual que el workflow)', () => {
    expect(slugify('日本')).toBe('');
  });
});
