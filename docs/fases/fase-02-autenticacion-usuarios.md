# Fase 2. Autenticación y usuarios

**Estado:** terminada (2026-11-09), en revisión del equipo.
**Historias:** HU001, HU002 y HU003. **Requisitos:** RF001, RF002 y la base de las reglas 7, 8 y 11.

## Qué se construyó

| Historia | Backend | Frontend |
|---|---|---|
| HU001 Iniciar sesión | `modules/auth/`, `middleware/auth.js`, `lib/tokens.js`, `lib/passwords.js` | `paginas/login.ts`, `core/auth.ts`, `core/auth.interceptor.ts` |
| HU002 Administrar usuarios | `modules/usuarios/` | `paginas/usuarios.ts`, `paginas/usuario-form.ts` |
| HU003 Controlar permisos | `lib/roles.js`, `requirePermiso`, `puedeAccederFinca` | `core/auth.guards.ts`, menú en `layout/shell.ts` |
| Fincas (sin HU, necesaria para asignar usuarios) | `modules/fincas/` | `paginas/fincas.ts` |

**Modelo de datos:** `Rol`, `Finca`, `Usuario`, `UsuarioFinca` y `RefreshToken`, en la migración `20261109000000_auth_usuarios`.

**Criterio pendiente:** "el veterinario puede consultar y gestionar los reportes de salud" (HU003) se completa en la Fase 5, cuando exista ese módulo.

## Decisiones y motivos

| Decisión | Motivo |
|---|---|
| `Usuario.rol_id` + tabla `UsuarioFinca` en vez de `Usuario.finca_id` | Un veterinario puede atender varias fincas, y la regla 11 admite acceso autorizado. |
| Un solo rol por usuario; el administrador tiene alcance global y no lleva fincas | Sigue la especificación y evita un rol distinto por finca. |
| Permisos fijos por rol | Los criterios de HU003 no piden pantalla de edición. |
| JWT de 15 min en memoria + refresh de 30 días en cookie `httpOnly` y `SameSite=Strict` | El token no queda accesible a JavaScript persistente, y la sesión sobrevive días sin señal. |
| Rotación del refresh con margen de 30 s | Una respuesta perdida por mala señal o dos pestañas simultáneas no deben cerrar la sesión. |
| Token rotado que reaparece fuera del margen revoca esa sesión | Se trata como posible robo. Afecta solo a ese dispositivo (`familiaId`). |
| `requireAuth` consulta el usuario en cada petición | Desactivar o cambiar de rol surte efecto de inmediato, no al vencer el token. |
| Contraseñas con `scrypt` de `node:crypto` | Sin dependencias nativas. |
| Mismo error para correo inexistente y contraseña mala; "cuenta desactivada" solo tras validar la contraseña | Evita revelar qué correos existen. |
| Finca ajena responde 404 | No revela que existe. |
| Transacción `Serializable` al desactivar o cambiar de rol | Garantiza que siempre quede un administrador activo, incluso con operaciones simultáneas. |
| Cambiar contraseña revoca las sesiones | No hay recuperación por correo: el administrador la restablece. |
| El seed solo crea roles y el primer administrador | La especificación prohíbe datos ficticios. |

## Cómo verificar

```bash
npm test                                     # 39 pruebas de backend
npm test --prefix frontend -- --watch=false  # 8 pruebas de frontend
npm run build
```

Resultado al cerrar la fase: 39/39 y 8/8 pruebas correctas, y build de producción correcto.

También se recorrió el flujo en Chrome, en escritorio y a 375 px, contra la base de pruebas: rutas protegidas, login, recarga, crear finca y usuario, editar, permisos del ayudante, desactivación y ausencia de scroll horizontal. El script fue temporal y no está en el repositorio; las pruebas E2E están previstas para la Fase 9.

**No probado:** celular físico y despliegue con HTTPS.

## Particularidades técnicas

- La cookie de refresh solo se envía en `/api/auth`, y usa `Secure` únicamente con `NODE_ENV=production`.
- En producción, definir `TRUST_PROXY` si hay un proxy inverso; si no, el límite de intentos de login ve una sola IP.
- La migración se generó con `prisma migrate diff --from-empty` y se aplicó con `migrate deploy`. `migrate dev` no se ha usado en este proyecto.
- Angular corre sin `zone.js`: el estado de pantalla debe vivir en `signal`, o la vista puede no actualizarse.
- `tests/setup.js` vacía las tablas antes de cada prueba. Al agregar tablas nuevas hay que incluirlas en ese `TRUNCATE`.
- Al crear un módulo nuevo, sus permisos se agregan en `backend/src/lib/roles.js` y en el tipo `Permiso` de `frontend/src/app/core/modelos.ts`.
- `core/auth.ts` conserva la sesión ante fallos de red; solo un 401 la invalida. Al abrir la app sin conexión todavía se pide login: se resuelve en la Fase 8.
- Credenciales locales: `SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD` en `backend/.env`, ignorado por git.

## Pendientes para fases siguientes

- Toda consulta de un módulo nuevo debe filtrar por las fincas del actor con `puedeAccederFinca` o el equivalente en el `where`.
- Selector de finca activa en la interfaz para usuarios con varias fincas: se definirá en la Fase 3.
- Decidir si el ayudante ve toda su finca o solo lo asignado, antes de empezar la Fase 3.
- La confirmación de desactivar usa `confirm()` nativo; se puede reemplazar por un diálogo propio.
