import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

// Funciona igual desde src/database/migrations y desde dist/database/migrations: el archivo está en api/data.
const FILE = join(__dirname, '..', '..', '..', 'data', 'common-passwords.txt');

export class LoadCommonPasswords1762900000001 implements MigrationInterface {
  // Nombre ya registrado en la tabla `migrations` de TypeORM: no se puede cambiar o se volvería a ejecutar.
  name = 'CargarContrasenasComunes1762900000001';

  async up(q: QueryRunner): Promise<void> {
    // Las líneas con # son el encabezado del archivo y se ignoran.
    const lines = readFileSync(FILE, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '' && !l.startsWith('#'))
      .map((l) => l.trim().toLowerCase());
    await q.query(
      `INSERT INTO autenticacion.contrasenas_comunes (contrasena)
       SELECT DISTINCT unnest($1::text[]) ON CONFLICT DO NOTHING`,
      [lines],
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM autenticacion.contrasenas_comunes`);
  }
}
