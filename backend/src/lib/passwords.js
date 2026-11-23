import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 2 ** 16;
const R = 8;
const P = 2;
const LARGO = 32;

const opciones = (n, r, p) => ({ N: n, r, p, maxmem: 128 * n * r * 2 });

function scrypt(password, salt, largo, opts) {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, largo, opts, (err, clave) => (err ? reject(err) : resolve(clave)));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, LARGO, opciones(N, R, P));
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verifyPassword(password, almacenado) {
  const [alg, n, r, p, saltB64, hashB64] = almacenado.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;

  const esperado = Buffer.from(hashB64, 'base64url');
  const calculado = await scrypt(
    password,
    Buffer.from(saltB64, 'base64url'),
    esperado.length,
    opciones(Number(n), Number(r), Number(p)),
  );
  return timingSafeEqual(calculado, esperado);
}

let hashSenuelo;

/** Iguala el tiempo de respuesta cuando el correo no existe. */
export async function verificarSenuelo(password) {
  hashSenuelo ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await hashSenuelo);
}
