// Copia el manifiesto de consultas persistidas que genera el codegen a api/graphql/ (lo lee la API en producción).
import { copyFileSync } from 'node:fs';

copyFileSync('src/shared/graphql/generated/persisted-documents.json', '../api/graphql/persisted-queries.json');
console.log('Manifiesto escrito en api/graphql/persisted-queries.json');
