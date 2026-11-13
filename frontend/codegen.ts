import type { CodegenConfig } from '@graphql-codegen/cli';

// Los tipos van a src/shared/graphql/generated/; el manifiesto de consultas persistidas se copia a api/graphql/ (scripts/write-manifest.mjs).
// Cada operación vive en su archivo `*.query.ts` o `*.mutation.ts` de src/features/<feature>/api/.
const config: CodegenConfig = {
  schema: '../api/graphql/schema.graphql',
  documents: ['src/features/**/api/*.query.ts', 'src/features/**/api/*.mutation.ts'],
  ignoreNoDocuments: true,
  generates: {
    './src/shared/graphql/generated/': {
      preset: 'client',
      config: { useTypeImports: true, scalars: { EnteroGrande: 'number' } },
      presetConfig: { persistedDocuments: { hashAlgorithm: 'sha256' } },
    },
  },
};

export default config;
