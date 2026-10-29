# Rutinas de Regulación

App web (PWA, mobile-first) para hábitos de día y de noche, con temporizador, rendimiento y registro automático en Google Sheets.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de las 4 vistas |
| `styles.css` | Estilos. **Todos los colores están en las variables de `:root`** |
| `app.js` | Lógica, temporizador, scroll día→noche y conexión con Apps Script |
| `Code.gs` | Backend (se pega en Google Apps Script, **no** se sube a GitHub Pages) |
| `manifest.json`, `sw.js`, `icon.svg` | Instalación como PWA y modo offline |

## Cambiar colores
Abre `styles.css` y edita el bloque `:root`: `--day-1/2/3` (gradiente de día), `--night-1/2/3` (gradiente de noche), `--accent-*`, `--btn-*`, `--card-*`.

## Vincular con Google Sheets (paso a paso)
1. Crea una **Hoja de cálculo** nueva en Google Sheets.
2. Ve a **Extensiones → Apps Script**, borra lo que haya y pega el contenido de `Code.gs`. Guarda.
3. Pulsa **Implementar → Nueva implementación → ⚙️ Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
4. Pulsa **Implementar** y **autoriza** los permisos (si aparece "Google no ha verificado esta aplicación": *Avanzado → Ir a (proyecto)*).
5. Copia la **URL de la aplicación web** (termina en `/exec`).
6. En `app.js`, pega la URL en la constante de la primera línea:
   ```js
   const API_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
   ```
7. Sube todo (menos `Code.gs`, si quieres) a un repositorio de GitHub y activa **Settings → Pages → Deploy from branch → main / root**.
8. Abre la URL de GitHub Pages: al marcar un hábito, se crea la pestaña `Registro` con las columnas `Fecha`, `Momento (Día/Noche)`, `Hábito`, `Completado (Sí/No)`; verde si es *Sí*, rojo si es *No*.

> Si modificas `Code.gs` más adelante, usa **Implementar → Administrar implementaciones → ✏️ → Versión nueva** para que los cambios apliquen con la misma URL.
> La URL de `/exec` queda visible en el código público; cualquiera que la conozca podría escribir en tu hoja. Para uso personal suele bastar, pero no guardes datos sensibles.
