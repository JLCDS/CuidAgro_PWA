import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` no se conecta; un valor vacío evita exigir .env en ese paso.
    url: process.env.DATABASE_URL ?? '',
  },
});
