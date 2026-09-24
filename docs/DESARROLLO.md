# Guía de desarrollo y despliegue

Documentación técnica de **Escriba de la Marca**: cómo está montada, cómo desplegar tu propia instancia
y cómo mantener el catálogo. Para una presentación del proyecto, ver el [README](../README.md).

Resumen del stack:
- HTML + JS (módulos ES) sin build, publicado en GitHub Pages con `.github/workflows/pages.yml`.
- Supabase: Auth con Google, Postgres con RLS y una Edge Function (`bmc-webhook`).
- Escáner: `BarcodeDetector` nativo o ZXing como alternativa.
- Donaciones: Buy Me a Coffee con webhook firmado que activa el estado Mecenas.

## Estructura

```
index.html, manifest.webmanifest, sw.js   shell + PWA
css/fonts.css                             tipografías servidas desde assets/fonts (sin Google Fonts)
css/tokens.css                            variables de cada tema (claro, oscuro, pergamino, retro)
css/base.css · layout.css                 reset, tipografía, botones, formularios · estructura, paneles, diálogos
css/components.css · views.css            piezas reutilizables · estilos de cada pantalla
css/themes.css                            ajustes estructurales de Pergamino y Retro (se cargan al final)
js/config.js                              ← TUS CLAVES AQUÍ
js/app.js                                 arranque, sesión, rutas
js/{api,store,router,ui,util,isbn,scanner,auth,theme}.js
js/views/                                 biblioteca, escanear, catálogo, ficha, perfil, mecenas, ayuda, escribas
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
3. Supabase → **Edge Functions → Secrets** (o `supabase secrets set …`): `BMC_WEBHOOK_SECRET=<secret>`. Nunca lo subas a git.
   El umbral de Mecenas es 5 € por defecto en el código; **no crees** `SUPPORTER_MIN_AMOUNT` salvo que quieras cambiarlo
   (los secretos no muestran su valor, así que es fácil olvidar qué pusiste). Si lo cambias, cambia también `js/config.js`
   y `public.supporter_min_amount()`.
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

Datos de juego (buscador de aventuras): `python3 scripts/codex_fetch.py` descarga las fichas del Codex LMDE a
`data/codex_modulos.csv` (niveles, personajes, sesiones, etiquetas, resumen). `catalog_sync.py` los cruza con el
catálogo por código de publicación; solo sobrescribe un dato si el Codex lo trae, para respetar lo editado por el admin.

Para actualizarlo: edita el CSV (y/o vuelve a ejecutar `codex_fetch.py`), ejecuta `python3 scripts/catalog_sync.py`
y haz commit de la migración generada. El script numera la migración después de la última existente.
Reglas del script: documentadas en la cabecera de `scripts/catalog_sync.py`.

## Cambios en la base de datos
- **Nunca edites una migración ya aplicada.** Crea una nueva: `supabase migration new descripcion` (o a mano, `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`).
- Las migraciones deben poder ejecutarse dentro de una transacción (nada de `create index concurrently`).
- Para añadir libros al catálogo de producción usa una migración (o la propia app como admin); `seed.sql` no llega a producción.
- Flujo: rama → PR → merge a `main` → la integración aplica la migración.

## Monetización propuesta

**Principio:** la app es gratis y completa para lo esencial (biblioteca, escáner, catálogo). Quien quiera apoyar paga una vez un precio simbólico y recibe extras que no rompen la experiencia gratuita.

| | Gratis | Mecenas (un café de 5 €, pago único en Buy Me a Coffee) |
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

## Ajustes de la app (feature flags)
Tabla `app_settings` (clave → valor jsonb), de lectura pública y escritura solo admin, que se cambia en
**Admin → Ajustes** sin publicar versión: `covers_enabled`, `suggestions_enabled` (también se aplica en la política RLS
de `catalog_suggestions` con `setting_enabled()`), `donations_enabled`, `feedback_enabled` (formulario de comentarios o, desactivado, enlace a los issues de GitHub; también en RLS) y `announcement` (franja de aviso general).
La app los lee al arrancar (`js/settings.js`); si fallan, usa los valores por defecto (todo activado, sin aviso).
Para añadir uno: fila en `app_settings` (migración), valor por defecto en `js/settings.js` y su interruptor en `FLAGS`
(`js/views/admin.js`).

## Logros y rangos (gamificación)
- `js/achievements.js` calcula en la app qué logros se cumplen (primer libro, 10/25/50/100 libros, explorador = algo de
  cada categoría, series completas, rangos de escriba) y guarda los nuevos en `user_achievements` (RLS por usuario).
  Se comprueba al entrar y cada vez que cambia la biblioteca (`refreshLibrary`).
- **Los logros son permanentes**: si una serie crece, el logro «Completa» se mantiene y el estado pasa a no estar
  «Al día»; al volver a completarla sube de nivel (×2…) y se celebra de nuevo (`meta.count` e `history`).
- La primera comprobación de cada usuario registra en silencio lo que ya tenía (un solo aviso), sin celebraciones en cadena.
- Rangos por aportaciones **aceptadas**: sugerencias validadas + códigos propuestos aprobados + libros propuestos
  aprobados. Umbrales en `RANKS` (0, 1, 5, 15, 40).
- «Nuevo»: publicaciones con `catalog_date` (o alta en la app) de los últimos 45 días.
- **Página «Escribas»** (`#/escribas`, `js/views/scribes.js`): opt-in con `profiles.show_in_scribes` (Perfil → Rango de
  escriba). La función `scribes()` (`security definer`, solo `authenticated`) devuelve únicamente a quienes lo activan,
  con el nombre abreviado («Toni R.») y sus aportaciones aceptadas, contadas igual que `contributions()`. Si cambia la
  forma de contar en `js/achievements.js`, hay que cambiarla también en la función (migración nueva).

## Herramientas de admin para el catálogo
- **Catálogo → filtros de calidad** (solo admin): sin verificar, códigos duplicados, sin código de barras, sin datos
  de juego y editados en la app, cada uno con su recuento.
- **Escáner → modo «verificar estantería»**: cada código que coincide con un único libro se marca verificado solo; si
  un código está en varios libros, al elegir el correcto se ofrece quitarlo de los demás. Registro de la sesión debajo.
- **`scripts/catalog_export.py`** (app → CSV): copia al CSV fuente los campos corregidos en la app (título, autor,
  páginas, código) y el código de barras aprobado/verificado; lo que no cabe en el CSV (libros creados en la app, datos
  de juego corregidos) va a `data/correcciones_app.csv` (ignorado por git). Necesita la clave *service_role* solo como
  variable de entorno: `SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/catalog_export.py --dry-run`.
- `catalog_sync.py` no vuelve a añadir los códigos que el admin quitó desde la app (lo consulta en `catalog_history`).
- Flujo recomendado: verificar en la app → `catalog_export.py` → revisar diff → commit → `catalog_sync.py` si hace falta.

## Historial y sugerencias
- `catalog_history` guarda cada alta, cambio y borrado de libros y códigos (versión anterior y nueva, quién y cuándo),
  mediante triggers. En la ficha, el admin abre «Historial de cambios» y puede **restaurar** cualquier versión
  (`admin_restore_version`); la restauración también queda registrada.
- `catalog_suggestions`: los usuarios proponen cambios (título, código, autor, páginas, datos de juego, resumen) con una
  nota. El admin los ve en Revisión con el antes/después y los valida (`admin_apply_suggestion`) o rechaza.
- `catalog.locked_fields`: campos editados desde la app. `catalog_sync.py` no los sobrescribe con el CSV, para que una
  corrección validada no se pierda en la siguiente sincronización. Pásalos al CSV cuando actualices la fuente.

## Estilos
- Cada tema es un bloque de **variables** en `css/tokens.css`; lo que un tema cambia de estructura (bordes, tipografía,
  sombras) va en `css/themes.css`, que se carga el último para prevalecer.
- **Tamaño de letra** (Perfil → Apariencia, `applyTextSize` en `js/theme.js`): cambia `--text-scale`, que escala el
  `font-size` de `html`. Por eso los tamaños de texto van en **rem**, no en px. La barra de pestañas limita los suyos con
  `min(… rem, … px)` para que quepa con letra grande.
- **Iconos**: SVG propios en `js/icons.js` (`icon('nombre')`); no uses emojis en la interfaz.
- Para un tema nuevo: añade sus variables en `tokens.css`, su bloque en `themes.css` y la entrada en `THEMES` (`js/theme.js`).
- Estilos de una pantalla nueva → `views.css`; si se reutilizan en varias → `components.css`.

## Métricas y administración
- La app registra eventos mínimos en `public.events` (`app_open` una vez al día, `scan` con `hit`/`multi`/`unknown`,
  `finder_search`, `wishlist_share`). Cada usuario solo puede insertar los suyos; no hay política de lectura.
- Las funciones `admin_metrics()`, `admin_users()`, `admin_donations()`, `admin_set_supporter()` y
  `admin_match_donation()` son `security definer` y lanzan error si quien llama no es admin.
- En la app, la pestaña **Admin** (solo admins) muestra Resumen, Revisión, Usuarios y Donaciones.
- `admin_metrics()` purga los eventos de más de 12 meses cada vez que se consulta.

## Avisos por Telegram
Triggers en la base de datos envían un mensaje al administrador cuando hay un **usuario nuevo**, un **libro o código
propuesto**, una **sugerencia**, un **comentario** o un evento de **Buy Me a Coffee** (donación, reembolso, cancelación).
Usan `pg_net` para llamar a la API de Telegram; el token vive cifrado en **Vault**.

- Formato HTML y un botón que abre la pantalla de la app correspondiente (`tg_button`, `app_url`). Todo texto de usuario
  pasa por `tg_esc()`. `notify_admin(texto, opts)` admite `{silent, buttons, plain}`; los nuevos usuarios llegan sin sonido.
- Contexto: EAN válido y otros libros con el mismo código, aportaciones aceptadas de quien propone (`tg_who`),
  antes → después de cada campo sugerido, y si una donación activa Mecenas y a quién (mirando `auth.users`).
- **Resumen semanal** (`weekly_admin_digest`, `pg_cron` `weekly-admin-digest`, lunes 07:00 UTC): usuarios, escaneos,
  libros añadidos, donaciones, pendientes de revisar (con la antigüedad si pasa de 3 días) y avisos que no llegaron.
  Probarlo: `select public.weekly_admin_digest();`
- **Fallos de las Actions** (publicación, copia de seguridad, tests): avisan por Telegram si existen los secretos
  del repositorio `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` (los mismos valores que en Vault).
- En `notify_on_event()` las condiciones sobre `new.<columna>` van **anidadas** dentro del `if` de cada tabla:
  PL/pgSQL evalúa la expresión entera y falla si la tabla no tiene esa columna.

1. En Telegram, habla con **@BotFather** → `/newbot` → copia el token.
2. Envía cualquier mensaje a tu bot y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`: el `chat.id` es tu chat.
3. En el SQL Editor de Supabase (una sola vez; nunca en una migración, el repositorio es público):
   ```sql
   select vault.create_secret('<TOKEN>', 'telegram_bot_token');
   select vault.create_secret('<CHAT_ID>', 'telegram_chat_id');
   ```
4. Prueba: `select public.notify_admin('Hola desde Supabase');`

**Dos canales** (opcional, recomendado): los avisos de **gestión** (altas, propuestas, sugerencias, comentarios,
donaciones, resumen semanal) van al chat de siempre, y los de **monitorización** (caídas, errores de la app, informe de
Supabase, fallos del webhook y de las Actions) a otro:
1. Crea un grupo de Telegram (p. ej. «Escriba · Monitorización») y añade el bot.
2. Escribe algo en el grupo y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`: el `chat.id` del grupo es un
   número negativo (p. ej. `-1001234567890`).
3. Guárdalo en Vault (`select vault.create_secret('<ID>', 'telegram_monitor_chat_id');`) y en GitHub como secreto
   `TELEGRAM_MONITOR_CHAT_ID`.
Sin ese secreto, todo sigue llegando al chat de siempre. En SQL se elige con `notify_admin(texto, '{"channel": "monitor"}')`.

Sin esos secretos no se envía nada y la app funciona igual. Los mensajes no incluyen emails.

Fiabilidad: cada aviso queda en `admin_notifications` y un trabajo de `pg_cron` (`retry-admin-notifications`, cada
5 minutos) comprueba la respuesta de Telegram en `net._http_response` y reintenta los fallidos hasta 3 veces
(timeout de 15 s); si Telegram rechaza el HTML (400), el reintento lo manda como texto plano. Para revisar: `select * from admin_notifications order by created_at desc;`

## Copias de seguridad
`.github/workflows/backup.yml` hace cada domingo, con `pg_dump` 17 (sin Docker):
- `public.dump`: todo el esquema `public` (tablas, RLS, funciones, triggers, permisos y datos), formato custom;
- `auth_data.sql`: `auth.users` y `auth.identities` (las cuentas);
- `migrations_history.sql`: historial de migraciones aplicadas.

Lo comprime, lo cifra con AES-256 (gpg) y lo guarda 90 días como artefacto del workflow.

Secretos del repositorio (GitHub → Settings → Secrets and variables → Actions):
- `SUPABASE_DB_URL`: Supabase → **Connect** → *Session pooler* (los runners de GitHub no tienen IPv6), con la contraseña.
- `BACKUP_PASSPHRASE`: frase larga; guárdala en tu gestor de contraseñas.

Restaurar en un proyecto de Supabase nuevo (que ya trae los esquemas `auth` y `supabase_migrations`):
```bash
gpg --decrypt backup-AAAA-MM-DD.tar.gz.gpg > backup.tar.gz && tar xzf backup.tar.gz
psql "$NUEVA_DB_URL" -f backup/auth_data.sql            # primero las cuentas (las tablas públicas las referencian)
pg_restore --no-owner --clean --if-exists -d "$NUEVA_DB_URL" backup/public.dump
psql "$NUEVA_DB_URL" -f backup/migrations_history.sql
```

## Monitorización (Supabase + GitHub + Telegram, sin servicios externos)
| Qué | Dónde | Aviso |
|---|---|---|
| **¿Funciona la app?** Web, código, API, Auth, Edge Function y supabase-js del CDN | `.github/workflows/health.yml` + `scripts/health_check.py`, cada 15 min | Telegram al caer, cada 2 h si sigue caída y al recuperarse. Estado en la caché de Actions; resumen en cada run |
| **Errores del navegador** (`error`, promesas sin gestionar, ficheros que no cargan, app que no arranca en 20 s) | `js/errors.js` (se carga antes que `app.js`, sin supabase-js) → tabla `client_errors` | Telegram la primera vez que aparece cada error (por firma, 1 vez al día, máx. 10 avisos/h). Total en el resumen semanal. Topes: 60/h en total y 20/h por usuario; se purgan a los 30 días |
| **Errores del backend** (logs de las últimas 24 h: API 5xx, Edge Functions, Auth, Postgres) | `.github/workflows/supabase-report.yml` + `scripts/supabase_report.py`, a diario | Telegram solo si hay algo que mirar. Los ERROR de Postgres cuentan a partir de 50 (muchos son normales: RLS, duplicados) |
| **Advisors** de seguridad y rendimiento | el mismo informe, los lunes | Telegram siempre (✓ o la lista) |
| **Webhook de Buy Me a Coffee** (firma incorrecta, secreto que falta, fallo al guardar o al activar Mecenas) | `supabase/functions/bmc-webhook` → `notify_admin_once()` | Telegram (la firma incorrecta, como mucho cada 6 h) |
| **Tamaño de la base de datos** frente a los 500 MB del plan gratuito | resumen semanal (`weekly_admin_digest`) | ⚠️ desde el 80 % |

- Ver los errores del navegador: Supabase → Table Editor → `client_errors` (o `select * from client_errors order by id desc`).
- El informe de Supabase necesita el secreto **`SUPABASE_ACCESS_TOKEN`** (Supabase → Account → Access Tokens; ponle
  caducidad). Usa la Management API: `…/analytics/endpoints/logs` (SQL de ClickHouse sobre la tabla `logs`) y
  `…/advisors/{security,performance}` (experimental). Pruébalo con Actions → «Informe de Supabase» → Run workflow.
- `notify_admin_once(clave, texto, intervalo)` evita repetir un aviso con la misma clave dentro del intervalo.
- El chequeo cada 15 min también mantiene activo el proyecto (el plan gratuito se pausa tras ~7 días sin peticiones);
  sustituye al antiguo `keepalive.yml`. GitHub desactiva los workflows programados tras 60 días sin commits:
  reactívalos desde Actions si pasa.

## Publicar una versión
1. En `js/version.js`, sube `APP_VERSION` (semver: `1.1.0` funciones nuevas, `1.0.1` arreglos) y añade una entrada
   **arriba** en `RELEASES` con la fecha y 2-4 notas pensadas para usuarios.
2. Commit y push a `main`. El workflow de Pages:
   - publica la web con caché `edm-<versión>-<commit>`;
   - crea la etiqueta `vX.Y.Z` y la GitHub Release con esas notas (si no existía).
3. Al abrir la app, quien ya la usaba ve una vez «Novedades de la versión X.Y.Z». El historial completo está en
   Perfil → «vX.Y.Z · Novedades».

Los cambios sin nueva versión (arreglos menores) se publican igual; simplemente no generan release ni aviso.

## Tests
Se ejecutan en cada push y pull request (`.github/workflows/tests.yml`) contra un **Supabase local** levantado en el
runner con todas las migraciones y `supabase/seed.sql`; nunca tocan producción.

- **Base de datos** (`supabase/tests/database/*.test.sql`, pgTAP): RLS de cada tabla (cada uno solo lo suyo, extras de
  Mecenas, catálogo aprobado/pendiente, visitantes sin sesión), columnas protegidas del perfil (`is_admin`,
  `is_supporter`), funciones `admin_*` rechazadas a no-admin, funciones internas no ejecutables desde la API,
  interruptores `suggestions_enabled` / `feedback_enabled`, lista compartida, intercambio, Escribas y borrado de cuenta.
  Cada fichero es una transacción que se deshace; para cambiar de usuario usan `_test_login(uid)` / `_test_anon()`
  (el mismo `request.jwt.claims` que pone PostgREST).
- **Flujo principal** (`tests/e2e/*.spec.js`, Playwright, móvil emulado): portada, bienvenida, escanear con la entrada
  manual (libro T1 del seed), añadir, quitar y deshacer, y modo marcar. El login con Google se simula: `fixtures.js`
  crea un usuario con contraseña en el Supabase local y deja su sesión en `localStorage`; `js/config.js` se sustituye
  al vuelo por la URL local. Se niegan a correr contra algo que no sea `127.0.0.1`/`localhost`.

En local (Docker u OrbStack):
```bash
supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta
supabase test db            # pgTAP
npm ci && npx playwright install chromium
npx playwright test         # flujo principal (sirve la app con tests/e2e/serve.js)
supabase stop
```
**Resultados en GitHub**: la página de cada run (*Summary*) muestra una tabla por suite y la lista de pruebas con ✅/❌
(`tests/ci-summary.js`, que lee `reports/pgtap/*.tap` de `tests/pgtap-report.sh` y `reports/playwright.json`).
El artefacto **informe-tests** trae siempre el informe HTML de Playwright (`playwright-report/index.html`) y, si algo
falla, las trazas (ábrelas con `npx playwright show-trace <zip>`).

Al añadir una tabla, una política o una función `security definer`, añade su test. Si la migración nueva cambia
algo que ya se comprueba, el test fallará: es la idea.

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
