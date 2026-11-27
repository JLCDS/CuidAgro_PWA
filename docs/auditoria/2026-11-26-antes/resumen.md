# Auditoría Lighthouse del 2026-11-26

Sitio medido: http://localhost:3190. Perfiles: móvil (emulación por defecto de Lighthouse) y escritorio.
Umbrales: accesibilidad >= 95, buenas prácticas >= 95, SEO >= 90, rendimiento >= 85 en móvil y >= 90 en escritorio. En negrita, lo que no cumple.

## Puntajes

| Página | Perfil | Rendimiento | Accesibilidad | Buenas prácticas | SEO | Resultado |
|---|---|---|---|---|---|---|
| `/login` | Móvil | 99 | 100 | 96 | 92 | Cumple |
| `/login` | Escritorio | 100 | 100 | 96 | 92 | Cumple |
| `/` | Móvil | **69** | 100 | 100 | 92 | No cumple |
| `/` | Escritorio | **75** | 100 | 100 | 92 | No cumple |
| `/consumos` | Móvil | **74** | 100 | 100 | 92 | No cumple |
| `/consumos` | Escritorio | 100 | 100 | 100 | 92 | Cumple |
| `/reportes` | Móvil | 93 | 100 | 100 | 92 | Cumple |
| `/reportes` | Escritorio | 100 | 100 | 100 | 92 | Cumple |
| `/espacios` | Móvil | **72** | 100 | 100 | 92 | No cumple |
| `/espacios` | Escritorio | 94 | 100 | 100 | 92 | Cumple |

## Métricas de laboratorio

| Página | Perfil | LCP | CLS | TBT | FCP | Speed Index | Informe |
|---|---|---|---|---|---|---|---|
| `/login` | Móvil | 0,8 s | 0 | 110 ms | 0,8 s | 0,8 s | [login-movil.html](login-movil.html) |
| `/login` | Escritorio | 0,2 s | 0 | 0 ms | 0,2 s | 0,4 s | [login-escritorio.html](login-escritorio.html) |
| `/` | Móvil | 3,9 s | 0,196 | 420 ms | 0,8 s | 1,3 s | [inicio-movil.html](inicio-movil.html) |
| `/` | Escritorio | 0,9 s | 0,888 | 0 ms | 0,2 s | 0,4 s | [inicio-escritorio.html](inicio-escritorio.html) |
| `/consumos` | Móvil | 3,6 s | 0,03 | 650 ms | 0,8 s | 1,3 s | [consumos-movil.html](consumos-movil.html) |
| `/consumos` | Escritorio | 0,2 s | 0,029 | 10 ms | 0,2 s | 0,4 s | [consumos-escritorio.html](consumos-escritorio.html) |
| `/reportes` | Móvil | 0,8 s | 0 | 330 ms | 0,8 s | 1,1 s | [reportes-movil.html](reportes-movil.html) |
| `/reportes` | Escritorio | 0,8 s | 0,009 | 0 ms | 0,2 s | 0,4 s | [reportes-escritorio.html](reportes-escritorio.html) |
| `/espacios` | Móvil | 3,4 s | 0,238 | 350 ms | 0,8 s | 1,2 s | [espacios-movil.html](espacios-movil.html) |
| `/espacios` | Escritorio | 0,8 s | 0,141 | 0 ms | 0,2 s | 0,2 s | [espacios-escritorio.html](espacios-escritorio.html) |

## Auditorías por debajo de 90

- `/login` (Móvil): errors-in-console (0), unused-javascript (50), robots-txt (0), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/login` (Escritorio): errors-in-console (0), unused-javascript (50), robots-txt (0), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/` (Móvil): largest-contentful-paint (52), total-blocking-time (66), max-potential-fid (82), cumulative-layout-shift (63), interactive (88), layout-shifts (0), robots-txt (0), cls-culprits-insight (0), image-delivery-insight (0), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/` (Escritorio): cumulative-layout-shift (3), layout-shifts (0), robots-txt (0), cls-culprits-insight (0), image-delivery-insight (0), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/consumos` (Móvil): largest-contentful-paint (60), total-blocking-time (46), max-potential-fid (26), robots-txt (0), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/consumos` (Escritorio): robots-txt (0), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/reportes` (Móvil): total-blocking-time (75), max-potential-fid (71), robots-txt (0), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/reportes` (Escritorio): robots-txt (0), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/espacios` (Móvil): largest-contentful-paint (67), total-blocking-time (73), max-potential-fid (83), cumulative-layout-shift (52), layout-shifts (0), robots-txt (0), cls-culprits-insight (0), image-delivery-insight (50), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/espacios` (Escritorio): cumulative-layout-shift (78), layout-shifts (0), robots-txt (0), cls-culprits-insight (0), image-delivery-insight (50), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (50)

## Conclusión

- `/` (Móvil): Rendimiento 69 < 85
- `/` (Escritorio): Rendimiento 75 < 90
- `/consumos` (Móvil): Rendimiento 74 < 85
- `/espacios` (Móvil): Rendimiento 72 < 85
