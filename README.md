# Escriba de la Marca

App web (móvil primero) para llevar el control de tu colección de **Aventuras en la Marca del Este**.

- Biblioteca personal organizada por categorías, con contador «tengo X de Y».
- Escáner de códigos de barras (EAN-13 / ISBN) con la cámara del móvil:
  - si ya lo tienes → «Ya registrado el 12 de marzo de 2025»;
  - si no → «¿Añadirlo a tu biblioteca?»;
  - si el código no existe en el catálogo → el admin lo da de alta (o lo asigna a un libro sin código) y el resto de usuarios lo proponen.
- Login con Google (Supabase Auth). Cada usuario tiene su biblioteca, protegida con RLS.
- PWA instalable. HTML + JS sin build: se publica tal cual en GitHub Pages.
- Monetización: donación en Buy Me a Coffee y estado **Mecenas** con extras.

## Estructura

```
index.html, manifest.webmanifest, sw.js   shell + PWA
css/app.css                               estilos (claro / oscuro / pergamino)
js/config.js                              ← TUS CLAVES AQUÍ
js/app.js                                 arranque, sesión, rutas
js/{api,store,router,ui,util,isbn,scanner,auth,theme}.js
js/views/                                 biblioteca, escanear, catálogo, ficha, perfil, mecenas
supabase/config.toml                      config CLI + funciones que despliega la integración GitHub
supabase/migrations/                      esquema (tablas, RLS, triggers) y catálogo inicial
supabase/seed.sql                         datos de prueba (solo local / ramas preview)
supabase/functions/bmc-webhook/           Edge Function para Buy Me a Coffee
data/catalogo_marca_del_este.csv          catálogo fuente (Sombra + Tesoros de la Marca + Codex LMDE)
scripts/catalog_sync.py                   CSV → migración SQL de sincronización
```

## Puesta en marcha

### 1. Proyecto Supabase
1. Crea un proyecto en <https://supabase.com> (el plan gratuito basta).
2. **Project Settings → API**: copia `Project URL` y `anon public key` en `js/config.js`.

### 2. Repositorio y GitHub Pages
1. Sube el proyecto a GitHub:
   ```bash
   git init -b main && git add . && git commit -m "init"
   git remote add origin git@github.com:Favashi/escribadelamarca.git && git push -u origin main
   ```
2. Repo → **Settings → Pages** → *Source*: **GitHub Actions**. El workflow `.github/workflows/pages.yml` publica cada push a `main`
   (solo los ficheros de la web) y fija la versión de caché del service worker al hash del commit.
3. Abre `https://favashi.github.io/escribadelamarca/`. La cámara exige HTTPS: GitHub Pages ya lo da.

### 3. Integración GitHub ↔ Supabase (despliegue del backend)
1. Supabase → **Project Settings → Integrations → GitHub** → autoriza y elige el repositorio.
2. *Supabase directory*: `supabase`. *Production branch*: `main`. Activa **Deploy to production**.
3. Desactiva *Automatic branching* salvo que quieras ramas preview (cada rama crea una instancia aparte; consulta su coste en la página de precios de Supabase).
4. Haz un push a `main` (o vuelve a lanzar el despliegue): se aplican las migraciones de `supabase/migrations/` y se despliega `bmc-webhook` (declarada en `config.toml` con `verify_jwt = false`).

Qué **no** sincroniza la integración (se configura en el panel): Auth/Google, URLs de redirección, secretos y `seed.sql`.

> **¿Ya ejecutaste el esquema a mano en el SQL Editor?** Márcalo como aplicado para que la integración no intente repetirlo:
> ```bash
> supabase link --project-ref TU-PROYECTO
> supabase migration repair --status applied 20260923000000 20260923000100
> ```

<details><summary>Sin integración (despliegue manual con la CLI)</summary>

```bash
supabase login
supabase link --project-ref TU-PROYECTO
supabase db push                       # aplica migraciones
supabase functions deploy bmc-webhook  # verify_jwt se lee de config.toml
```
</details>

### 4. Login con Google
1. En <https://console.cloud.google.com> → APIs y servicios → Pantalla de consentimiento OAuth (tipo *Externo*).
2. Credenciales → Crear ID de cliente OAuth → *Aplicación web*.
   - Orígenes autorizados: `https://favashi.github.io`
   - URI de redirección: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
3. En Supabase → **Authentication → Providers → Google**: activa y pega Client ID y Secret.
4. **Authentication → URL Configuration**:
   - Site URL: `https://favashi.github.io/escribadelamarca/`
   - Redirect URLs: la misma y `http://localhost:8000/` (para pruebas locales).

### 5. Hazte administrador
Entra una vez con tu cuenta de Google y ejecuta en el SQL Editor:
```sql
update public.profiles set is_admin = true where email = 'tu@email.com';
```
Como admin puedes crear/editar/borrar libros, aprobar propuestas (libros y códigos) y asignar o verificar códigos de barras: escanea un libro y, si el código es desconocido, elige a qué libro pertenece.

### 6. Buy Me a Coffee (monetización)
1. La URL de donación está en `DONATION_URL` (`js/config.js`): `https://buymeacoffee.com/toniruiz`.
2. BMC → **Settings → Webhooks → Create webhook**:
   - URL: `https://fuhchwedoxopzcybccrj.supabase.co/functions/v1/bmc-webhook`
   - Eventos: `donation.created` (y, si los usas, `membership.started`, `recurring_donation.started`, `extra_purchase.created`).
   - Copia el **signing secret** de la página del webhook.
3. Supabase → **Edge Functions → Secrets** (o `supabase secrets set …`): `BMC_WEBHOOK_SECRET=<secret>` y, opcional, `SUPPORTER_MIN_AMOUNT=3`. Nunca lo subas a git.
4. En BMC envía un evento de prueba y revisa la tabla `donations` (columna `raw`). Los eventos de prueba (`live_mode = false`) se registran pero no activan Mecenas.

## Catálogo

El catálogo sale de `data/catalogo_marca_del_este.csv` (103 publicaciones), elaborado a partir de:
- [Distribuciones Sombra](https://dbsombra.com/index.asp?cod=12LM): título, autor, clave interna, formato, páginas, «ISBN» publicado, precio, fecha.
- [Tesoros de la Marca](https://tesorosdelamarca.com/): SKU `ALME` + código de publicación.
- [Codex LMDE](https://github.com/diacritica/codexlmde): códigos históricos (B19, C4, G3, H1…).

Cómo identifica la app un libro:
1. **Código de barras** (tabla `catalog_barcodes`). Un libro puede tener varios y, por errores de las fuentes,
   un código puede estar en varios libros: la app deja elegir. Los importados de Sombra están *sin verificar*.
2. **Código de publicación** (B19, G0, CR…) escrito en la caja del escáner, para libros sin código de barras.
3. Si no se encuentra, el usuario elige el libro en una lista (código **propuesto**) o propone un libro nuevo.

Para actualizarlo: edita el CSV, ejecuta `python3 scripts/catalog_sync.py` y haz commit de la migración generada.
Reglas del script: documentadas en la cabecera de `scripts/catalog_sync.py`.

## Cambios en la base de datos
- **Nunca edites una migración ya aplicada.** Crea una nueva: `supabase migration new descripcion` (o a mano, `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`).
- Las migraciones deben poder ejecutarse dentro de una transacción (nada de `create index concurrently`).
- Para añadir libros al catálogo de producción usa una migración (o la propia app como admin); `seed.sql` no llega a producción.
- Flujo: rama → PR → merge a `main` → la integración aplica la migración.

## Monetización propuesta

**Principio:** la app es gratis y completa para lo esencial (biblioteca, escáner, catálogo). Quien quiera apoyar paga una vez un precio simbólico y recibe extras que no rompen la experiencia gratuita.

| | Gratis | Mecenas (≥ 3 €, pago único en Buy Me a Coffee) |
|---|---|---|
| Biblioteca, categorías, escáner, sincronización | ✔ | ✔ |
| Insignia ★ Mecenas | | ✔ |
| Lista de deseos | | ✔ |
| Registro de préstamos | | ✔ |
| Estadísticas de colección | | ✔ |
| Exportar CSV / JSON | | ✔ |
| Tema «Pergamino» | | ✔ |

**Por qué Buy Me a Coffee:** es la misma cuenta que usa OSR Manager, no requiere backend propio de pagos y su webhook firmado activa el estado Mecenas automáticamente.

**Cómo se vincula el pago:** la Edge Function `bmc-webhook` busca el email del pago y cualquier email escrito en el mensaje de la donación. Si coincide con una cuenta, la marca como Mecenas. Si la persona dona antes de registrarse, se activa sola al crear la cuenta (trigger `handle_new_user`). Si no hay coincidencia, el pago queda en `donations` y puedes activarlo a mano:
```sql
update public.profiles set is_supporter = true, supporter_since = now() where email = 'x@y.com';
```

**Costes a cubrir:** Supabase gratuito (500 MB de base de datos, 50k usuarios activos al mes) y GitHub Pages gratuito. Las donaciones cubren un dominio propio (~12 €/año) o Supabase Pro (25 $/mes) si la app crece. Ampliación futura: membresía mensual de Buy Me a Coffee usando el mismo webhook (`membership.started`).

**Seguridad:** los extras están protegidos en la base de datos (RLS de `wishlist` y `loans` exige `is_supporter`) y el usuario no puede cambiarse `is_supporter` ni `is_admin` (solo puede actualizar las columnas `display_name` y `avatar_url`).

## Desarrollo local
```bash
python3 -m http.server 8000
# abre http://localhost:8000  (la cámara funciona en localhost)
```
Para probar desde el móvil en local necesitas HTTPS (p. ej. `npx localtunnel --port 8000`) o prueba directamente en GitHub Pages.

No hace falta tocar `VERSION` en `sw.js`: el workflow de Pages la cambia en cada despliegue.

## Compatibilidad del escáner
- Android / Chrome: `BarcodeDetector` nativo.
- iOS Safari, Firefox y otros: ZXing (`@zxing/browser`), cargado solo si hace falta.
- Siempre queda la entrada manual del ISBN.

## Licencia
Código bajo **GNU Affero General Public License v3.0** (ver [`LICENSE`](LICENSE)). Puedes usarlo, modificarlo y publicarlo, pero si distribuyes o ofreces por red una versión modificada debes publicar su código fuente bajo la misma licencia.

La licencia cubre solo el código de este repositorio. *Aventuras en la Marca del Este*, sus títulos, logotipos e ilustraciones pertenecen a sus respectivos autores y no se incluyen aquí.

Copyright (C) 2026 Favashi

---
Proyecto de fans, no oficial. *Aventuras en la Marca del Este* es propiedad de sus autores.
