import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { DIR_UPLOADS_PRUEBAS, URL_BD_PRUEBAS } from '../vitest.config.js';

export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: URL_BD_PRUEBAS },
  });
  rmSync(DIR_UPLOADS_PRUEBAS, { recursive: true, force: true });
  return () => rmSync(DIR_UPLOADS_PRUEBAS, { recursive: true, force: true });
}
