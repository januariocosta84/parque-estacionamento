import { defineConfig } from 'tsup';

// Production build of the API. The shared package is TypeScript source, so it is bundled in;
// npm dependencies (fastify, prisma, pg…) stay external and are installed in the image.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  noExternal: ['@estacionamento/shared'],
  clean: true,
  sourcemap: true,
});
