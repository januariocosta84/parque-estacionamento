// pnpm db:seed — reads the admin account from the environment (see .env.example).
import { pinSchema } from '@estacionamento/shared';
import { createDb } from '../src/db';
import { seed } from '../src/seed';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

const password = required('SEED_ADMIN_PASSWORD');
if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');

const devAgentPin = process.env.SEED_DEV_AGENT_PIN;
if (devAgentPin) pinSchema.parse(devAgentPin);

const db = createDb(required('DATABASE_URL'));
try {
  await seed(db, {
    admin: {
      username: process.env.SEED_ADMIN_USERNAME || 'admin',
      password,
      name: process.env.SEED_ADMIN_NAME || 'Administrador',
      phone: process.env.SEED_ADMIN_PHONE || null,
    },
    devAgentPin: devAgentPin || undefined,
  });
  console.warn('Seed complete');
} finally {
  await db.$disconnect();
}
