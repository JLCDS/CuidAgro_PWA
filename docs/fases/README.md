# Contexto por fase

Un archivo por cada fase del desarrollo de CuidAgro. Sirve para retomar el trabajo sin releer todo el código: qué se hizo, qué se decidió y por qué, cómo verificarlo y qué quedó pendiente.

Se crea o actualiza al cerrar cada fase. El código y las pruebas siguen siendo la fuente de verdad; aquí va lo que no se deduce de ellos.

| Fase | Historias | Estado | Contexto |
|---|---|---|---|
| 1. Análisis y configuración | — | Terminada | [fase-01-configuracion.md](fase-01-configuracion.md) |
| 2. Autenticación y usuarios | HU001 a HU003 | Terminada, en revisión | [fase-02-autenticacion-usuarios.md](fase-02-autenticacion-usuarios.md) |
| 3. Animales y lotes | HU004 a HU007 | Terminada, en revisión | [fase-03-animales-lotes.md](fase-03-animales-lotes.md) |
| 4. Alimentación e inventario | HU008 a HU011 | Terminada, en revisión | [fase-04-alimentacion-inventario.md](fase-04-alimentacion-inventario.md) |
| 5. Salud y novedades | HU012 a HU015 | Terminada, en revisión | [fase-05-salud-novedades.md](fase-05-salud-novedades.md) |
| 6. Medicamentos y tratamientos | HU016, HU017 | Pendiente | — |
| 7. Dashboard y reportes | HU018, HU019 | Pendiente | — |
| 8. PWA y offline | HU020, HU021 | Pendiente | — |
| 9. Pruebas y despliegue | — | Pendiente | — |

## Decisiones abiertas

| Decisión | Afecta a | Suposición actual |
|---|---|---|
| ¿Cada ayudante ve toda su finca o solo lo asignado? | Fase 3 | Aplicado: ve toda su finca y no gestiona animales. Pendiente de confirmar |
| ¿La alimentación descuenta inventario? | Fase 4 | Aplicado: sí, permitiendo stock negativo con alerta. Pendiente de confirmar |
| ¿Valores de jornada? | Fase 4 | Decidido (2026-11-18): mañana, tarde y noche |
| ¿Auditoría general de acciones? | Transversal | Fuera: estaba en el primer prompt, no en la especificación |

## Estructura de cada archivo

Objetivo y alcance · Qué se construyó · Decisiones y motivos · Cómo verificar · Particularidades técnicas · Pendientes para fases siguientes.
