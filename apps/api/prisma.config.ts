import { defineConfig } from 'prisma/config';

// Prisma does not read .env by itself; Node can.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file: use the environment as is (CI, production)
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
