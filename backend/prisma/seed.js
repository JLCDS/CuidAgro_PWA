// Solo crea los roles y el primer administrador: nunca datos de ejemplo.
import { hashPassword } from '../src/lib/passwords.js';
import { prisma } from '../src/lib/prisma.js';
import { sembrarRoles } from '../src/lib/roles.js';
import { correoSchema, passwordSchema } from '../src/modules/auth/auth.schemas.js';

async function sembrarAdministrador() {
  const { SEED_ADMIN_CORREO, SEED_ADMIN_PASSWORD, SEED_ADMIN_NOMBRE } = process.env;
  if (!SEED_ADMIN_CORREO || !SEED_ADMIN_PASSWORD) {
    console.warn('SEED_ADMIN_CORREO o SEED_ADMIN_PASSWORD sin definir: no se creó administrador.');
    return;
  }

  const correo = correoSchema.parse(SEED_ADMIN_CORREO);
  if (await prisma.usuario.findUnique({ where: { correo } })) {
    console.log(`El administrador ${correo} ya existe.`);
    return;
  }

  const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'ADMINISTRADOR' } });
  await prisma.usuario.create({
    data: {
      nombre: SEED_ADMIN_NOMBRE || 'Administrador',
      correo,
      passwordHash: await hashPassword(passwordSchema.parse(SEED_ADMIN_PASSWORD)),
      rolId: rol.id,
    },
  });
  console.log(`Administrador ${correo} creado.`);
}

await sembrarRoles();
await sembrarAdministrador();
await prisma.$disconnect();
