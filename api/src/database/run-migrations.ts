import { DataSource } from 'typeorm';
import { readConfig } from '../config/configuration';
import { databaseOptions } from './database-options';

async function run(): Promise<void> {
  const dataSource = new DataSource(databaseOptions(readConfig().db));
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(
      applied.length === 0
        ? 'Migraciones: no hay nada pendiente'
        : `Migraciones aplicadas: ${applied.map((m) => m.name).join(', ')}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: Error) => {
  console.error('Error al ejecutar las migraciones:', error.message);
  process.exit(1);
});
