# Auditoría Lighthouse del 2026-11-27

Sitio medido: http://localhost:3190. Perfiles: móvil (emulación por defecto de Lighthouse) y escritorio.
Umbrales: accesibilidad >= 95, buenas prácticas >= 95, SEO >= 90, rendimiento >= 85 en móvil y >= 90 en escritorio. En negrita, lo que no cumple.

## Puntajes

| Página | Perfil | Rendimiento | Accesibilidad | Buenas prácticas | SEO | Resultado |
|---|---|---|---|---|---|---|
| `/login` | Móvil | 99 | 100 | 96 | 100 | Cumple |
| `/login` | Escritorio | 100 | 100 | 96 | 100 | Cumple |
| `/` | Móvil | **81** | 100 | 100 | 100 | No cumple |
| `/` | Escritorio | 99 | 100 | 100 | 100 | Cumple |
| `/consumos` | Móvil | **84** | 100 | 100 | 100 | No cumple |
| `/consumos` | Escritorio | 100 | 100 | 100 | 100 | Cumple |
| `/reportes` | Móvil | 90 | 100 | 100 | 100 | Cumple |
| `/reportes` | Escritorio | 100 | 100 | 100 | 100 | Cumple |
| `/espacios` | Móvil | 87 | 100 | 100 | 100 | Cumple |
| `/espacios` | Escritorio | 100 | 100 | 100 | 100 | Cumple |

## Métricas de laboratorio

| Página | Perfil | LCP | CLS | TBT | FCP | Speed Index | Informe |
|---|---|---|---|---|---|---|---|
| `/login` | Móvil | 0,8 s | 0 | 100 ms | 0,8 s | 1,4 s | [login-movil.html](login-movil.html) |
| `/login` | Escritorio | 0,8 s | 0 | 0 ms | 0,3 s | 0,4 s | [login-escritorio.html](login-escritorio.html) |
| `/` | Móvil | 3,6 s | 0 | 380 ms | 0,8 s | 1,2 s | [inicio-movil.html](inicio-movil.html) |
| `/` | Escritorio | 0,9 s | 0 | 0 ms | 0,2 s | 0,4 s | [inicio-escritorio.html](inicio-escritorio.html) |
| `/consumos` | Móvil | 0,8 s | 0,033 | 660 ms | 0,8 s | 1,6 s | [consumos-movil.html](consumos-movil.html) |
| `/consumos` | Escritorio | 0,2 s | 0,02 | 10 ms | 0,2 s | 0,6 s | [consumos-escritorio.html](consumos-escritorio.html) |
| `/reportes` | Móvil | 0,8 s | 0 | 400 ms | 0,8 s | 1,1 s | [reportes-movil.html](reportes-movil.html) |
| `/reportes` | Escritorio | 0,7 s | 0 | 0 ms | 0,2 s | 0,6 s | [reportes-escritorio.html](reportes-escritorio.html) |
| `/espacios` | Móvil | 3,0 s | 0 | 330 ms | 0,8 s | 1,0 s | [espacios-movil.html](espacios-movil.html) |
| `/espacios` | Escritorio | 0,7 s | 0 | 0 ms | 0,2 s | 0,4 s | [espacios-escritorio.html](espacios-escritorio.html) |

## Auditorías por debajo de 90

- `/login` (Móvil): max-potential-fid (66), errors-in-console (0), unused-javascript (50), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/login` (Escritorio): errors-in-console (0), unused-javascript (0), image-delivery-insight (50), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/` (Móvil): largest-contentful-paint (61), total-blocking-time (69), max-potential-fid (63), image-delivery-insight (0), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/` (Escritorio): image-delivery-insight (0), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/consumos` (Móvil): total-blocking-time (45), max-potential-fid (26), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/consumos` (Escritorio): image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/reportes` (Móvil): total-blocking-time (68), max-potential-fid (61), image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/reportes` (Escritorio): image-delivery-insight (50), network-dependency-tree-insight (0), render-blocking-insight (50)
- `/espacios` (Móvil): largest-contentful-paint (77), total-blocking-time (76), max-potential-fid (67), image-delivery-insight (50), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (0)
- `/espacios` (Escritorio): image-delivery-insight (50), lcp-discovery-insight (0), network-dependency-tree-insight (0), render-blocking-insight (50)

## Conclusión

- `/` (Móvil): Rendimiento 81 < 85
- `/consumos` (Móvil): Rendimiento 84 < 85
