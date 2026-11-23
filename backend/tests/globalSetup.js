import { execSync } from 'node:child_process';
import { URL_BD_PRUEBAS } from '../vitest.config.js';

export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: URL_BD_PRUEBAS },
  });
}
