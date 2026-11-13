import { commonCandidates, evaluatePasswordPolicy } from './password.policy';

const EMAIL = 'ana.lopez@example.com';
const rules = (password: string, email = EMAIL): string[] => evaluatePasswordPolicy(password, email).map((d) => d.regla);

describe('evaluarPoliticaContrasena', () => {
  it('acepta una contraseña que cumple todo', () => {
    expect(rules('Zorro#Azul-2026x')).toEqual([]);
  });

  describe('longitud', () => {
    it('11 caracteres fallan y 12 pasan', () => {
      expect(rules('Abcdefgh1!x')).toEqual(['minimo_12_caracteres']);
      expect(rules('Abcdefgh1!xy')).toEqual([]);
    });
    it('cuenta caracteres (puntos de código), no bytes, para el mínimo', () => {
      // 11 caracteres aunque ocupen más de 12 bytes
      expect(rules('Ñandú#Ñandú1')).toEqual([]);
      expect(rules('Ñandú#Ñand1')).toEqual(['minimo_12_caracteres']);
    });
    it('un emoji cuenta como un carácter', () => {
      expect(rules('Abcdefgh1😀')).toEqual(['minimo_12_caracteres']);
    });
    it('72 bytes pasan y 73 fallan', () => {
      const base = 'Aa1!';
      expect(rules(base + 'x'.repeat(68))).toEqual([]);
      expect(rules(base + 'x'.repeat(69))).toEqual(['maximo_72_bytes']);
    });
    it('el límite de 72 se mide en bytes UTF-8 (ñ ocupa 2)', () => {
      const base = 'Aa1!'; // 4 bytes
      expect(rules(base + 'ñ'.repeat(34))).toEqual([]); // 4 + 68 = 72
      expect(rules(base + 'ñ'.repeat(35))).toEqual(['maximo_72_bytes']); // 74 bytes
    });
  });

  describe('clases de caracteres', () => {
    it('sin mayúscula', () => expect(rules('zorro#azul-2026x')).toEqual(['requiere_mayuscula']));
    it('sin minúscula', () => expect(rules('ZORRO#AZUL-2026X')).toEqual(['requiere_minuscula']));
    it('sin número', () => expect(rules('Zorro#Azul-Verde')).toEqual(['requiere_numero']));
    it('sin símbolo', () => expect(rules('ZorroAzulVerde2026')).toEqual(['requiere_simbolo']));
    it('un espacio interior no cuenta como símbolo', () => expect(rules('Zorro Azul Verde 2026')).toEqual(['requiere_simbolo']));
    it('acepta mayúsculas y minúsculas con acento', () => {
      expect(rules('Árbol#Ñandú-2026')).toEqual([]);
      expect(rules('árbol#ñandú-2026')).toEqual(['requiere_mayuscula']);
    });
    it('un número no ASCII cuenta como número (\\p{N})', () => {
      expect(rules('Zorro#Azul-Verde٣')).toEqual([]);
    });
    it('un emoji cuenta como símbolo', () => {
      expect(rules('ZorroAzulVerde2026😀')).toEqual([]);
    });
  });

  describe('espacios en los extremos', () => {
    it('al inicio', () => expect(rules(' Zorro#Azul-2026x')).toEqual(['sin_espacios_extremos']));
    it('al final', () => expect(rules('Zorro#Azul-2026x ')).toEqual(['sin_espacios_extremos']));
    it('un tabulador o salto también cuenta', () => {
      expect(rules('Zorro#Azul-2026x\n')).toEqual(['sin_espacios_extremos']);
      expect(rules('\tZorro#Azul-2026x')).toEqual(['sin_espacios_extremos']);
    });
    it('espacios interiores están permitidos', () => expect(rules('Zorro #Azul 2026x')).toEqual([]));
  });

  describe('no contener el correo', () => {
    it('el correo completo, sin importar mayúsculas', () => {
      expect(rules('Xx1!ANA.LOPEZ@example.comxx')).toEqual(['no_contiene_correo']);
    });
    it('la parte local de 4 o más caracteres', () => {
      expect(rules('Mi-ANA.LOPEZ-2026!')).toEqual(['no_contiene_correo']);
    });
    it('una parte local de 3 caracteres no se vigila', () => {
      expect(rules('Mi-ana-Zorro-2026!', 'ana@example.com')).toEqual([]);
    });
    it('una parte local de exactamente 4 caracteres sí', () => {
      expect(rules('Mi-juan-Zorro-2026!', 'juan@example.com')).toEqual(['no_contiene_correo']);
    });
    it('el dominio solo no cuenta', () => expect(rules('Zorro#example.com-2026')).toEqual([]));
  });

  it('devuelve todas las reglas fallidas juntas y en orden', () => {
    expect(rules('abc')).toEqual(['minimo_12_caracteres', 'requiere_mayuscula', 'requiere_numero', 'requiere_simbolo']);
  });
  it('cada detalle apunta al campo contrasena con mensaje en español', () => {
    const [d] = evaluatePasswordPolicy('Zorro#Azul-Verde', EMAIL);
    expect(d).toEqual({ campo: 'contrasena', regla: 'requiere_numero', mensaje: 'Debe incluir al menos un número.' });
  });
});

describe('candidatasComunes', () => {
  it('compara en minúsculas', () => expect(commonCandidates('PassWord')).toEqual(['password']));
  it('añade la versión sin dígitos ni símbolos finales', () => {
    expect(commonCandidates('Password123!')).toEqual(['password123!', 'password']);
  });
  it('quita también guiones bajos y espacios finales', () => {
    expect(commonCandidates('Qwerty_ 99')).toEqual(['qwerty_ 99', 'qwerty']);
  });
  it('no repite si no hay final que quitar', () => expect(commonCandidates('letmein')).toEqual(['letmein']));
  it('si todo son dígitos y símbolos no añade una candidata vacía', () => {
    expect(commonCandidates('1234!!')).toEqual(['1234!!']);
  });
  it('solo quita el final, no el medio', () => expect(commonCandidates('ab1cd2')).toEqual(['ab1cd2', 'ab1cd']));
});
