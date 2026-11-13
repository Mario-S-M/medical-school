import { readFileSync } from 'node:fs';
import { MANIFEST_PATH, verifyManifest } from './persisted-queries';

// `npm run graphql:verificar`: comprueba que cada hash de api/graphql/persisted-queries.json es el sha256 de su consulta.
const problems = verifyManifest(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Manifiesto de consultas persistidas correcto.');
