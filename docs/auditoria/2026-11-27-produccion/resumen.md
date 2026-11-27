# Auditoría Lighthouse del 2026-11-27

Sitio medido: https://cuidagro.onrender.com. Perfiles: móvil (emulación por defecto de Lighthouse) y escritorio.
Umbrales: accesibilidad >= 95, buenas prácticas >= 95, SEO >= 90, rendimiento >= 85 en móvil y >= 90 en escritorio. En negrita, lo que no cumple.

## Puntajes

| Página | Perfil | Rendimiento | Accesibilidad | Buenas prácticas | SEO | Resultado |
|---|---|---|---|---|---|---|
| `/login` | Móvil | 98 | 100 | 96 | 100 | Cumple |
| `/login` | Escritorio | 100 | 100 | 96 | 100 | Cumple |
| `/` | Móvil | 95 | 100 | 100 | 100 | Cumple |
| `/` | Escritorio | 99 | 100 | 100 | 100 | Cumple |
| `/consumos` | Móvil | 93 | 100 | 100 | 100 | Cumple |
| `/consumos` | Escritorio | 99 | 100 | 100 | 100 | Cumple |
| `/reportes` | Móvil | **81** | 100 | 100 | 100 | No cumple |
| `/reportes` | Escritorio | 100 | 100 | 100 | 100 | Cumple |
| `/espacios` | Móvil | **83** | 100 | 100 | 100 | No cumple |
| `/espacios` | Escritorio | **88** | 100 | 100 | 100 | No cumple |

## Métricas de laboratorio

| Página | Perfil | LCP | CLS | TBT | FCP | Speed Index | Informe |
|---|---|---|---|---|---|---|---|
| `/login` | Móvil | 0,9 s | 0 | 140 ms | 0,9 s | 2,4 s | [login-movil.html](login-movil.html) |
| `/login` | Escritorio | 0,5 s | 0 | 0 ms | 0,3 s | 1,0 s | [login-escritorio.html](login-escritorio.html) |
| `/` | Móvil | 2,1 s | 0 | 200 ms | 0,9 s | 3,1 s | [inicio-movil.html](inicio-movil.html) |
| `/` | Escritorio | 0,6 s | 0 | 0 ms | 0,3 s | 1,2 s | [inicio-escritorio.html](inicio-escritorio.html) |
| `/consumos` | Móvil | 0,9 s | 0,03 | 310 ms | 0,9 s | 2,2 s | [consumos-movil.html](consumos-movil.html) |
| `/consumos` | Escritorio | 0,3 s | 0,02 | 100 ms | 0,3 s | 1,1 s | [consumos-escritorio.html](consumos-escritorio.html) |
| `/reportes` | Móvil | 0,9 s | 0 | 780 ms | 0,9 s | 3,1 s | [reportes-movil.html](reportes-movil.html) |
| `/reportes` | Escritorio | 0,3 s | 0 | 0 ms | 0,3 s | 1,1 s | [reportes-escritorio.html](reportes-escritorio.html) |
| `/espacios` | Móvil | 0,9 s | 0 | 690 ms | 0,9 s | 2,4 s | [espacios-movil.html](espacios-movil.html) |
| `/espacios` | Escritorio | 0,5 s | 0 | 280 ms | 0,3 s | 1,4 s | [espacios-escritorio.html](espacios-escritorio.html) |

## Auditorías por debajo de 90

- `/login` (Móvil): max-potential-fid (88), errors-in-console (0), unused-javascript (50), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/login` (Escritorio): errors-in-console (0), unused-javascript (50), image-delivery-insight (50), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/` (Móvil): image-delivery-insight (0), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/` (Escritorio): image-delivery-insight (0), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/consumos` (Móvil): total-blocking-time (78), max-potential-fid (41), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/consumos` (Escritorio): max-potential-fid (85), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/reportes` (Móvil): total-blocking-time (38), max-potential-fid (4), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/reportes` (Escritorio): image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/espacios` (Móvil): total-blocking-time (43), max-potential-fid (3), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/espacios` (Escritorio): speed-index (88), total-blocking-time (64), max-potential-fid (29), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)

## Conclusión

- `/reportes` (Móvil): Rendimiento 81 < 85
- `/espacios` (Móvil): Rendimiento 83 < 85
- `/espacios` (Escritorio): Rendimiento 88 < 90
