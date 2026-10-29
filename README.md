# Rutinas de Regulación

App web (PWA, mobile-first) para hábitos de día y de noche, con planilla semanal, temporizador, rendimiento (semanal y mensual, lunes a domingo), modo oscuro/claro y registro automático en Google Sheets.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de las vistas |
| `styles.css` | Estilos. **Colores en las variables de `:root` (claro) y `:root[data-theme="dark"]` (oscuro)** |
| `config.js` | **Único archivo a editar:** aquí va la `API_URL` de tu Apps Script |
| `app.js` | Lógica de la app |
| `Code.gs` | Backend (se pega en Google Apps Script) |
| `manifest.json`, `sw.js`, `icon*.png/svg` | Instalación como PWA / modo offline |
| `package.json`, `capacitor.config.json`, `.github/workflows/build-apk.yml` | Generan el APK automáticamente en GitHub Actions |

## Vincular con Google Sheets
1. Pega `Code.gs` en Extensiones → Apps Script y despliégalo como Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).
2. Copia la URL que termina en `/exec` y pégala en `config.js`:
   ```js
   const API_URL = "https://script.google.com/macros/s/XXXX/exec";
   ```
3. Sube todo a GitHub. GitHub Pages publica la web y GitHub Actions genera el APK (pestaña Actions → Artifacts).
