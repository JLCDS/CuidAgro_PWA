import { beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { sembrarRoles } from '../src/lib/roles.js';

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE usuarios, fincas, roles, refresh_tokens, usuarios_fincas, vacunos, lotes_oviparos, alimentos, entradas_alimento, consumos_vacunos, consumos_lotes CASCADE');
  await sembrarRoles();
});
