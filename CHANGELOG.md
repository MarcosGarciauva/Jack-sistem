# Changelog — Jack

Todas las notas relevantes de cambios del sistema. Las versiones siguen un esquema
informal por "olas" de prioridades (P1–P11). El formato se inspira en
[Keep a Changelog](https://keepachangelog.com/).

## [Sin versión] — Consolidación setup + backfill Supabase (2026-06-03)

Se cerró la migración de lectura normalizada A-E a nivel operativo.

### Changed

- `supabase/setup_full.sql` ahora incluye también:
  - `normalize_clients_appointments.sql`
  - `normalize_catalog.sql`
  - `normalize_suppliers.sql`
  - `normalize_cash_cuts.sql`
- `cash_cuts.sql` ya no crea el índice único incondicional
  `business_cash_cuts_business_date_idx`, porque fallaba con datos existentes
  duplicados por negocio/día. Ahora crea un índice normal de lookup y la unicidad
  real vive en `normalize_cash_cuts.sql` como índice único parcial
  `where deleted_at is null`.
- `normalize_cash_cuts.sql` ahora soft-deletea duplicados activos por negocio/día,
  conservando vivo el corte más reciente antes de crear el índice único parcial.
- `migrate_app_state_to_normalized` ahora tolera citas con `clientId` o `employeeId`
  vacío/no válido: inserta `client_id`/`employee_id` como `null` si no existe la fila
  referenciada. Esto evita que datos históricos sucios bloqueen el backfill.

### Applied in Supabase

- Se ejecutó `supabase/setup_full.sql` contra el proyecto enlazado.
- Se ejecutaron backfills para todos los negocios existentes:
  - `migrate_app_state_to_normalized(id)`
  - `migrate_catalog_to_normalized(id)`
  - `migrate_suppliers_to_normalized(id)`
  - `migrate_cash_cuts_to_normalized(id)`

### Verification

- Negocios detectados:
  - `Jack` (`slug: jack`)
  - `TerraMar` (`slug: terramar`)
- Conteos post-backfill:
  - Jack: 9 clientes, 11 citas, 4 servicios, 3 empleados, 2 categorías, 0 productos,
    1 proveedor, 2 cortes de caja.
  - TerraMar: 0 en todas las entidades normalizadas (negocio nuevo/sin operación).
- Checks de consistencia:
  - cortes activos duplicados por negocio/día: 0
  - citas activas sin cliente: 0
  - citas activas sin empleado: 6 (dato histórico tolerado; quedan sin asignar y
    deben reasignarse manualmente si el negocio las necesita operativas).

## [Sin versión] — WhatsApp solo contacta, confirmación manual (2026-06-03)

Cambio de producto en la ventana de detalle de cita. El botón de WhatsApp dejaba la
cita en `confirmed` al avisar al cliente; eso confirmaba por error cuando el cliente
solo preguntaba o se equivocaba. Ahora el botón **solo contacta** (abre `wa.me`) y la
confirmación es manual con los botones de "Estado de la cita". Build y tests (9/9) verdes.

### Changed

- `AppointmentDetailModal` (`src/App.tsx`): para reservas web pendientes ya NO se
  muestra "Confirmar y avisar por WhatsApp". Se muestra un único botón **"Contactar por
  WhatsApp"** (resaltado si es reserva web pendiente) que abre `wa.me` sin cambiar el
  estado. Se eliminó la función `confirmReservationWhatsApp` y el prop `onConfirmWhatsApp`.
- La confirmación sigue disponible, pero MANUAL, vía los botones grandes de estado
  (`onStatus` → `updateAppointmentStatus`).
- Test estático `static-quality.test.mjs` actualizado a la nueva decisión.

## [Sin versión] — Corrección PhoneInput: dígitos se duplicaban (2026-06-03)

`PhoneInput` mostraba "5252525252…" al escribir. `parsePhone` solo quitaba el código de
país (`52`/`1`) cuando el número tenía el largo EXACTO; con el número a medias el código
quedaba dentro del "nacional" y `buildPhone` lo volvía a anteponer (bola de nieve). Fix:
`parsePhone` ahora quita el código de país aunque el número esté incompleto (`<=12` MX,
`<=11` US), conservando el legacy `521`+10. Un solo archivo: `src/components/PhoneInput.tsx`.
Aplica a todas las secciones (mismo componente). Build y tests (9/9) verdes.

## [Sin versión] — Normalización lote E: corte de caja (#2/#6, cierre) (2026-06-01)

Quinto y ÚLTIMO mini-lote de la fundación de datos. El corte de caja pasa a leerse de
`business_cash_cuts` con fallback por entidad y soft-delete. Con esto, clientes, citas,
servicios, empleados, productos/categorías, proveedores y cortes ya tienen las tablas
normalizadas como fuente principal de lectura. Cortes a NIVEL RAÍZ de AppState + RLS por
negocio → nunca al sitio público. Sin cambios visuales, roles/login intactos. Build y
tests (9/9) verdes.

### SQL a correr (en orden)

1. **`supabase/cash_cuts.sql`** — si aún no se corrió: crea `business_cash_cuts` + RLS.
2. **`supabase/normalize_cash_cuts.sql`** — nuevo: agrega las columnas por método/retiro
   (P7: `cash_amount`, `card_credit`, `card_debit`, `transfer`, `total_received`,
   `expected_total`, `difference`, `withdrawal`, `cash_remaining`) + `deleted_at` + índice
   parcial, y el RPC `migrate_cash_cuts_to_normalized(business_id)` para backfill.
   Idempotente, no destructivo. Correr por cada negocio.

### Changed (persistencia)

- **Carga de cortes normalizada** (`loadNormalizedState`): fetch separado y tolerante,
  filtra `deleted_at is null`, mapea TODOS los campos por método/retiro, fallback por
  entidad a `app_state.cashCuts`. `loadBusinessState` ya NO sobrescribe `cashCuts` desde
  el fallback (lo resuelve el loader).
- **Espejo de cortes** (`mirrorNormalizedState`): upsert por id (un corte por fecha, id
  estable por fecha) con los campos completos; NO manda `deleted_at` → un corte borrado
  no resucita.
- **Borrar corte = soft-delete por id**: `databaseService.softDeleteCashCut` desde
  `CashManager.removeCut`. `CashManager` recibe `businessId`.

### Fixed (post-verificación en vivo)

- **No se podían crear/subir cortes de días anteriores.** El índice único original
  `business_cash_cuts_business_date_idx` era INCONDICIONAL sobre `(business_id, cut_date)`.
  Como el borrado es soft-delete (la fila queda con `deleted_at`), esa fila seguía
  ocupando el día y bloqueaba recrear un corte para una fecha ya usada/borrada → el
  `insert` del espejo lanzaba error y, como el loader prefiere la tabla, el corte
  (solo en `app_state`) no aparecía. Fix en `normalize_cash_cuts.sql`: se reemplaza por
  un índice único PARCIAL `where deleted_at is null` (un corte ACTIVO por día; los
  borrados ya no bloquean). **Acción: re-correr `supabase/normalize_cash_cuts.sql`.**

### Riesgos / pendiente

- Con el índice parcial puede haber varias filas por fecha (1 activa + N borradas); el
  loader filtra `deleted_at is null`, así que siempre se ve solo la activa.
- **Migración #2/#6 (lectura) completa** para todas las entidades en alcance. PENDIENTE
  a futuro: escribir DIRECTO a tablas por entidad (hoy se sigue escribiendo el `app_state`
  completo + espejo), bandera `normalized_ready` por negocio, y eventual retiro de
  `app_state` como almacenamiento. No incluido aquí a propósito.

## [Sin versión] — Normalización lote D: proveedores (#2/#6) (2026-06-01)

Cuarto mini-lote de la fundación de datos. Los proveedores pasan a leerse de
`business_suppliers` con fallback por entidad y soft-delete. Siguen a NIVEL RAÍZ de
AppState (fuera de config) y la tabla tiene RLS por negocio → nunca se exponen al sitio
público. NO migra corte de caja (lote E). Sin cambios visuales, roles/login intactos.
Build y tests (9/9) verdes.

### SQL a correr (en orden)

1. **`supabase/suppliers.sql`** — si aún no se corrió: crea `business_suppliers` + RLS.
2. **`supabase/normalize_suppliers.sql`** — nuevo: agrega `deleted_at` + índice parcial
   y el RPC `migrate_suppliers_to_normalized(business_id)` para backfill desde
   `app_state.suppliers`. Idempotente, no destructivo. Correr por cada negocio.

### Changed (persistencia)

- **Carga de proveedores normalizada** (`loadNormalizedState`): fetch separado y
  tolerante a tabla ausente, filtra `deleted_at is null`, fallback por entidad a
  `app_state.suppliers`. `loadBusinessState` ya NO sobrescribe `suppliers` desde el
  fallback (lo resuelve el loader); `cashCuts` sí se sigue preservando del fallback
  (lote E pendiente).
- **Espejo de proveedores** (`mirrorNormalizedState`): upsert tolerante; NO manda
  `deleted_at` → un proveedor borrado no resucita aunque una sesión vieja lo re-espeje.
- **Borrar proveedor = soft-delete por id**: `databaseService.softDeleteSupplier`
  llamado desde `SuppliersManager.removeFromDraft`. `SuppliersManager` recibe `businessId`.

### Riesgos / pendiente

- Mismo patrón anti-resurrección que clientes/citas. `deleted_at` se agrega vía
  `normalize_suppliers.sql` (la tabla no lo tenía).
- Falta: corte de caja (lote E), aún solo en `app_state` (raíz).

## [Sin versión] — Normalización lote C: productos + categorías (#2/#6) (2026-06-01)

Tercer mini-lote de la fundación de datos. El catálogo (productos + categorías) pasa a
leerse de las tablas normalizadas con fallback por entidad. NO migra proveedores ni
corte de caja (lotes D/E). Sin cambios visuales, roles/login intactos. Build y tests
(9/9) verdes.

### SQL a correr (en este orden)

1. **`supabase/catalog_products.sql`** — si aún no se corrió: crea
   `business_product_categories` y `business_products` + RLS por negocio. Idempotente.
2. **`supabase/normalize_catalog.sql`** — nuevo: RPC `migrate_catalog_to_normalized(business_id)`
   para backfillear el catálogo de `app_state.config` a las tablas. Idempotente, no
   destructivo. Correr por cada negocio existente.

### Changed (persistencia)

- **Carga del catálogo normalizada con fallback por entidad** (`loadNormalizedState`).
  Las categorías y productos se leen de `business_product_categories` /
  `business_products` (productos filtran `active = true`). Fetch **separado y tolerante**:
  si las tablas de catálogo no existen todavía, NO se rompe la carga de citas/clientes;
  se cae a `app_state` solo para el catálogo. Si una tabla está vacía → fallback por
  entidad a `app_state`.
- **Espejo del catálogo** (`mirrorNormalizedState`). Al guardar se upsertean categorías
  (primero, por la FK `category_id`) y luego productos, secuencial y tolerante a tablas
  ausentes. Productos NO mandan `active` en el upsert → mismo patrón anti-resurrección
  que servicios/citas.
- **Borrar producto = desactivar por id**: `databaseService.deactivateProduct` llamado
  desde `CatalogManager.removeFromDraft` (set `active=false`); la fila se conserva.
- Categorías: no hay borrado en la UI (solo crear/usar), así que solo se upsertean.

### Riesgos / pendiente

- Igual que servicios: dos admins simultáneos podrían chocar; el anti-resurrección cubre
  el borrado. Si una tabla de catálogo quedó *parcialmente* poblada, se muestra lo
  normalizado (mitiga el `mirror` al primer guardado o el RPC de backfill).
- Faltan: proveedores (lote D) y corte de caja (lote E), aún solo en `app_state`.

## [Sin versión] — Normalización lote B: servicios + empleados (#2/#6) (2026-06-01)

Segundo mini-lote de la fundación de datos. Servicios y empleados ya se leían de las
tablas normalizadas (loader normalizado-primario + fallback por entidad del lote
anterior); este lote cierra el **delete-sync seguro** para ambos. NO migra productos,
proveedores ni corte de caja. Sin SQL nuevo (las tablas ya existen). Sin cambios
visuales, sin tocar roles/login. Build y tests (9/9) verdes.

### Changed (persistencia)

- **Servicios: borrar = desactivar por id.** `business_services` se filtra por
  `active = true` en la carga. Borrar un servicio ahora llama
  `databaseService.deactivateService(businessId, id)` (set `active=false`) desde
  `CatalogManager.removeFromDraft`; la fila se conserva (las citas viejas lo
  referencian por nombre). `CatalogManager` recibe ahora `businessId`.
- **Espejo de servicios sin forzar `active`.** `mirrorNormalizedState` ya no manda
  `active: true` en el upsert de servicios: al insertar usa el default (true) y al
  actualizar NO toca `active`, así un servicio desactivado no resucita aunque una
  sesión vieja lo vuelva a espejar (mismo patrón anti-resurrección que `deleted_at`).
  Además ahora espeja los valores reales de depósito (`deposit_required` /
  `deposit_amount`) en vez de forzar 0/false (corrige pérdida de depósito al guardar).
- **Empleados fuera del espejo.** `mirrorNormalizedState` ya NO upsertea empleados. La
  fuente de verdad es el Edge Function `admin-manage-user` (crea/edita/borra la fila en
  `business_employees`). Antes, un guardado de admin con sesión vieja podía RESUCITAR un
  empleado borrado vía el espejo. La carga normalizada de empleados no cambia.

### Riesgos / pendiente

- Servicios no tienen escritor concurrente público (a diferencia de citas), pero dos
  admins simultáneos podrían chocar; el patrón anti-resurrección cubre el caso de
  borrado. 
- Productos, proveedores y corte de caja siguen SOLO en `app_state` (sus tablas existen
  pero el front aún no las lee/escribe). Son los lotes C/D/E.

## [Sin versión] — Normalización mini-lote: clientes + citas (#2/#6) (2026-06-01)

Primer mini-lote seguro de la fundación de datos. **Solo** clientes y citas: las
tablas normalizadas pasan a ser la **fuente principal** de lectura, con fallback por
entidad a `app_state` y borrado real con `deleted_at`. NO migra empleados, servicios,
catálogo, proveedores ni corte de caja. Sin DROP, sin borrar datos, sin cambios
visuales, sin tocar roles/login. Build y tests (9/9) en verde.

### SQL a correr (idempotente, no destructivo)

- **`supabase/normalize_clients_appointments.sql`** — garantiza `deleted_at` en
  `business_clients` y `business_appointments` (por si una BD vieja no lo tenía) y
  agrega índices parciales `where deleted_at is null` para la carga normalizada.
  Correr **después** de `normalized_schema.sql`.

### Changed (persistencia)

- **Carga normalizada con fallback POR ENTIDAD** (`databaseService.loadNormalizedState`).
  Antes: si había cualquier dato normalizado, se usaba la capa normalizada para TODO
  (una tabla vacía → lista vacía aunque `app_state` tuviera datos). Ahora cada entidad
  decide por separado: clientes y citas se leen de las tablas normalizadas si tienen
  filas; si están vacías, caen a `app_state` solo para esa entidad. Servicios y
  empleados siguen igual (normalizado si hay, si no `app_state`) — no se migran aquí.
- **Borrado de cita = soft-delete explícito** (`databaseService.softDeleteAppointment`,
  llamado desde `deleteAppointment` en `App.tsx`). Marca `deleted_at` **solo en el id
  borrado**. El loader filtra `deleted_at is null`, así la cita no reaparece al
  recargar. Se agregó también `softDeleteClient` (sin caller de UI por ahora; los
  clientes no se borran desde la interfaz).
- **Create/edit siguen por el espejo existente**: `saveBusinessState` escribe
  `app_state` y hace `upsert` a las tablas normalizadas (clientes y citas incluidas).
  El payload del upsert NO incluye `deleted_at`, así un registro soft-borrado nunca
  resucita aunque una sesión desactualizada lo vuelva a espejar.

### Por qué NO se borra por ausencia (anti-landmine)

Se evitó a propósito el patrón "borra de la tabla lo que no esté en `app_state`": una
reserva pública entrante (escrita por `public-booking` directo a la tabla) no está en
la memoria del admin, y un guardado del admin la habría marcado como borrada. Con
soft-delete por id explícito + lectura normalizada-primaria, la reserva pública
sobrevive aunque el `app_state` del admin esté desactualizado.

### `public-booking`

- Sin cambios: ya escribe `business_clients` + `business_appointments` con los campos
  correctos y `deleted_at` por defecto en null. WhatsApp sigue manual (`wa.me`).

### Pendiente / riesgos

- **Migración parcial**: el fallback por entidad solo dispara si la tabla está
  *totalmente* vacía. Si un negocio tiene citas en `app_state` y la tabla normalizada
  quedó *parcialmente* poblada, se mostrará lo normalizado. Mitigación: `mirror`
  corre en cada guardado (completa la tabla al primer save) o correr el RPC
  `migrate_app_state_to_normalized(business_id)` para backfill.
- `app_state` sigue como espejo/compat; el admin que guarda con sesión vieja deja el
  JSON `app_state` temporalmente desfasado (las lecturas ya no dependen de él para
  clientes/citas).
- Aún NO migrados: empleados, servicios, catálogo, proveedores, corte de caja.

## [Sin versión] — Endurecer public-booking (#8) (2026-06-01)

Lote acotado sobre la Edge Function pública `public-booking`. **No** migra la
escritura a tablas normalizadas (eso es #2/#6, pendiente con respaldo): se conserva
el flujo actual sobre `app_state` + el espejo normalizado existente. Solo se agregó
endurecimiento. Build (`npm run build`) y tests (`node --test`, 9/9) en verde.
Función **redesplegada** (`--no-verify-jwt`) y verificada en vivo.

### Security (auditoría #8)

- **Método y tamaño**: solo `POST` (resto → `405`); payload acotado a 8 KB (→ `413`);
  JSON inválido → `400`.
- **Validación fuerte de entrada del visitante** (corre **antes** de tocar la BD):
  - Nombre: 2–80 caracteres, saneado (sin caracteres de control).
  - Teléfono: solo dígitos, 10–15 (conserva la regla MX 52 / US 1).
  - Email opcional: formato válido + tope de longitud.
  - Notas: tope de 500 caracteres, saneadas.
  - Fecha: formato `YYYY-MM-DD` real, **no pasada** (1 día de tolerancia por zona
    horaria) y **no más de 180 días** a futuro.
  - Hora: formato `HH:MM` válido.
- **Autoridad del servidor (anti-tampering)**: precio, duración y depósito se toman
  **del catálogo**; `id` de cita/cliente, `createdAt`, `status`, `paymentStatus`,
  `paidAmount` y `source` los fija el backend. Se ignora por completo lo que el
  cliente mande para esos campos.
- **Anti-spam sin tablas nuevas**:
  - Throttle por IP en memoria (8 req/min por instancia, best-effort).
  - Tope de ráfaga por negocio: máx. 6 reservas públicas en 10 min (usa `createdAt`
    que ahora controla el servidor) → `429`.
  - Bloqueo de reserva duplicada: mismo teléfono + misma fecha/hora → `409`.
  - Honeypot opcional (`hp`): si llega con contenido, responde `200` falso sin
    escribir (no delata el filtro a los bots). El frontend no envía este campo.
- Se conservan las validaciones previas (servicio/empleado/horario/doble-booking).

### Verificación en vivo

`GET → 405`, `OPTIONS → 200`, honeypot → `200` sin escritura, datos incompletos →
`400`, nombre/teléfono/email/fecha-pasada/hora/fecha-lejana → `400` con el mensaje
correcto, y entrada válida → llega al lookup de negocio (`404` con id de prueba). No
se creó ninguna reserva real.

### Fuera de alcance (intencional)

- Migrar la escritura a tablas normalizadas como fuente principal (#2/#6).
- Rate limit persistente con tabla dedicada (se usó throttle en memoria + topes
  derivados de datos existentes para no tocar el esquema).

## [Sin versión] — Dividir App.tsx + code splitting (#10) (2026-05-31)

Primer ataque al item arquitectónico **#10** ("App.tsx demasiado grande" + "bundle
grande por falta de code splitting"). Cero riesgo de datos: solo se movió código de
presentación y se introdujo carga diferida. Build (`npm run build`) y tests
(`node --test`, 9/9) en verde.

### Changed (refactor)

- **Configuración extraída a su propio módulo.** Las subsecciones de Configuración
  (`SettingsEditorial`, `SettingsBusiness`, `SettingsHours`, `SettingsIntegrations`,
  `SettingsPublicSite`, `SettingsPlan`, `SettingsSoon` + `SETTINGS_NAV_BASE`) salieron
  de `App.tsx` a **`src/features/settings/SettingsEditorial.tsx`** (~486 líneas).
  `App.tsx` ahora la importa de forma diferida. No cambia comportamiento ni props.
- **Code splitting con `React.lazy` + `Suspense`.** Se cargan bajo demanda los
  componentes pesados o ligados a una sola sección/ruta: `PublicBookingSite` (ruta
  aparte), `RevenueChart` (recharts), `StatsManager`, `CatalogManager`, `CashManager`,
  `SuppliersManager`, `EmployeesManager`, `WebReservationsView`, `ClientDetailModal` y
  `SettingsEditorial`. Cada uso quedó envuelto en `<Suspense>` con un fallback ligero.

### Resultado (bundle)

- Chunk principal: **960 kB → 484 kB** (gzip **264 kB → 138 kB**). Desaparece la
  advertencia de Vite de "chunks > 500 kB".
- `recharts` se aísla en su propio chunk (~394 kB) que solo se descarga al renderizar
  una gráfica (dashboard/estadísticas), no en el arranque.
- Cada feature secundaria genera su propio chunk pequeño (2–20 kB) cargado al entrar
  a su sección.

### Pendiente dentro de #10

- `App.tsx` sigue grande (~2.35k líneas). Quedan por extraer, en una fase futura y con
  cuidado por el acoplamiento de props/helpers: `LoginScreen`, `CalendarView`,
  `WeeklyView`, `Dashboard`, `NewAppointmentFullScreen`, `AppointmentDetailModal`.

## [Sin versión] — Correcciones de auditoría técnica (lote 3) (2026-05-31)

Primeras correcciones del bloque "Auditoría Técnica Actual" de `CLAUDE.md`. Se
priorizaron arreglos **concretos y sin riesgo de pérdida de datos** sobre la BD en
vivo. Build (`npm run build`) y tests (`node --test`, 9/9) en verde.

### Fixed (corregido)

- **Auditoría #7 · Corte de caja calculaba mal el efectivo restante**
  (`src/features/cash/CashManager.tsx`). El retiro y el "Efectivo restante" usaban
  `totalReceived` (efectivo + tarjeta + transferencia). Ahora se basan **solo en el
  efectivo físico del cajón** (`cashRemaining = max(efectivo − retiro, 0)`), el tope
  del retiro es el efectivo capturado, y la pantalla de cierre muestra "Efectivo en
  caja" en vez de "Total en caja". La reconciliación (Total recibido / esperado /
  diferencia) sigue sumando todos los métodos, que es lo correcto.
- **Auditoría #4 · Borrar un empleado dejaba citas huérfanas**
  (`EmployeesManager.tsx` + `App.tsx`). Antes solo se advertía. Ahora la eliminación
  usa un callback atómico `onEmployeeRemoved(id)` que, en **una sola** actualización
  de estado, quita al empleado **y** libera (`employeeId = ""`) las citas que lo
  referenciaban, evitando citas apuntando a un empleado inexistente. El toast informa
  cuántas citas quedaron sin asignar.

### Security (#9 · WhatsApp automático fail-closed)

- `supabase/functions/send-whatsapp/index.ts`: no tenía ninguna protección. Se agregó
  un guard **fail-closed** (`JACK_AUTOMATION_TOKEN` + header `x-jack-automation-token`):
  sin el secret configurado responde `503` (deshabilitada); con secret pero token
  inválido, `401`.
- `supabase/functions/send-reminders/index.ts`: su guard era **fail-open** (si
  `REMINDER_SECRET` no estaba configurado, corría sin protección). Ahora también es
  fail-closed: sin secret → `503`.
- Ambas se **redesplegaron** y se verificó en vivo: `503` con JWT válido y sin token.
  El flujo principal sigue siendo `wa.me` manual (estas funciones no se invocan desde
  el frontend), así que el endurecimiento no afecta la operación.

### Pendiente (items arquitectónicos de la auditoría, NO incluidos en este lote)

Requieren migración cuidadosa contra la BD en vivo y se dejan para una fase dedicada
(ver el plan staged más abajo / en la conversación):

- **#1** Tablas normalizadas como fuente principal (hoy el front depende de `app_state`).
- **#2** Sincronización de borrados (`mirrorNormalizedState` solo hace `upsert`).
  ⚠️ Landmine detectada: un delete-sync ingenuo borraría al empleado recién creado
  por la Edge Function si el estado en memoria del admin está desactualizado.
- **#3** RLS/guardado directo para acciones de `employee`.
- **#5** Llaves primarias multi-tenant (`id text` global → UUID o `(business_id, id)`).
- **#6** Fallback por entidad en el loader (evitar listas vacías por migración parcial).
- **#8** ✅ Endurecido en lote acotado (2026-06-01): validación fuerte, autoridad del
  servidor y anti-spam sin tablas nuevas. Falta solo migrar la escritura a tablas
  normalizadas, que pertenece a #2/#6.
- **#10** ✅ Iniciado en el lote de arriba (Settings extraído + code splitting;
  bundle 960 kB → 484 kB). Falta terminar de extraer las vistas grandes restantes.

## [Sin versión] — UX de citas, reservas y caja (P1–P11, lote 2) (2026-05-29)

Segundo lote de 11 prioridades enfocado en flujo de citas/reservas web, ventanas de
detalle unificadas y rediseño del corte de caja. Build (`npm run build`) y tests
estáticos (`node --test`, 9/9) en verde al cierre. Se conservó la compatibilidad con
`businesses.app_state`; **no se requirió migración SQL nueva** (los campos añadidos a
`CashCut` viajan dentro del JSON de `app_state`).

### Fixed (corregido)

- **P1 · Alta de empleados ("Failed to send a request to the Edge Function")**.
  Causa raíz: la falla NO está en el código del frontend ni en la Edge Function
  (`admin-manage-user/index.ts` se auditó y es correcta: CORS `*`, maneja `OPTIONS`,
  acciones `create_employee`/`update_employee`/`delete_employee` alineadas con el
  front, usa `service_role`). El error es **operativo**: la función no está desplegada
  o `VITE_SUPABASE_URL`/la sesión no coinciden. `databaseService.invokeAdminUser`
  ahora distingue `FunctionsFetchError` (red/no desplegada/CORS) de
  `FunctionsHttpError` (lee `error.context` y extrae el `{ error }` del cuerpo), y
  emite un mensaje accionable: _"No se pudo contactar la función 'admin-manage-user'.
  Verifica que esté desplegada (`supabase functions deploy admin-manage-user`), que
  `VITE_SUPABASE_URL` sea correcta y que tu sesión siga activa."_ El alta sigue siendo
  Nombre + Correo + Contraseña, sin códigos de invitación.

### Changed (modificado)

- **P2 · Reservaciones web dejan de ser módulo de nivel superior.** Se eliminó la
  sección `"reservations"` del tipo `Section` y su ícono `Globe` del sidebar. Ahora
  "Reservaciones web" es una **pestaña** (`j-seg`) dentro de **Citas**, controlada por
  el estado `appointmentsTab`. Las reservas web (`source = "public_site"`,
  `status = "pending"`) se mantienen separadas de las citas normales; los filtros y el
  estado de navegación persisten al cambiar de pestaña.
- **P3 · Confirmación de reserva web → cita normal (sin conversión automática).** La
  reserva vive como "Por confirmar" solo en la pestaña web. Al pulsar **"Confirmar y
  avisar por WhatsApp"** (`confirmReservationWhatsApp`) la cita pasa a `confirmed`,
  sale de la bandeja de pendientes, aparece en el listado normal y abre `wa.me`. No
  hay duplicación: `source` es inmutable y solo cambia `status`.
- **P4 · Acciones importantes solo desde ventana de detalle centrada.** Se reemplazó
  el panel lateral `AppointmentDetailDrawer` por `AppointmentDetailModal` (patrón
  `j-modal-scrim`/`j-modal`, igual que "Nuevo proveedor/producto/servicio"). Las
  tablas/listas son ahora **solo lectura** (clic en fila → abre el detalle;
  `ChevronRight` como afford­ance). Mismo patrón aplicado a Empleados
  (`EmployeesManager`), Productos/Servicios (`CatalogManager`) y Proveedores
  (`SuppliersManager`): editar, eliminar y WhatsApp viven dentro del modal. La
  **creación** de cita conserva su asistente a pantalla completa (`j-fm`)
  intencionalmente (mejor para captura larga; mismo resultado funcional).
- **P5 · Filtros de citas.** Se eliminó el filtro "Todos los orígenes" y se agregó
  ordenamiento ("Más recientes" / "Nombre del cliente", `AppointmentFilters.sort`).
  Se conservan filtros de estado (Pendiente/Confirmada/Completada/Cancelada),
  empleado, servicio, fecha y búsqueda.
- **P6 · Estados simplificados con botones grandes (sin selects).** Modelo de 3
  contextos en `appointmentStatusChoices`: reserva web pendiente → Por
  confirmar/Confirmada/Cancelada; ex-web confirmada → Confirmada/Completada/Cancelada;
  cita normal → Pendiente/Completada/Cancelada. Pagado/No pagado también se cambia
  **solo** desde el modal de detalle, con botones grandes. Se quitó `no_show` de los
  selectores de la UI.
- **P7 · Rediseño del corte de caja** (`CashManager.tsx`): captura manual por método
  (Efectivo, Tarjeta de crédito, Tarjeta de débito, Transferencia); cálculo
  automático de **Total recibido**, **Total esperado** (citas pagadas) y
  **Diferencia**; banner de faltante (saldo pendiente por cobrar) o sobrante. Se
  **eliminó el fondo inicial** de la captura. Al confirmar se abre una **segunda
  pantalla** (modal) con Total en caja / Monto a retirar / Efectivo restante y botones
  Cancelar/Confirmar. Se guarda el historial completo (CSV con columnas
  Esperado/Recibido/Diferencia/Retiro, con _fallback_ para cortes antiguos).

### Auditorías (P9 técnica · P10 funcional · P11 consistencia)

- **Técnica (P9)**: `tsc -b` sin errores; sin imports rotos ni referencias a símbolos
  eliminados (`AppointmentDetailDrawer`, `confirmPublicReservation`,
  `cancelPublicReservation`, `Globe`, `onConfirmReservation`/`onCancelReservation`).
  Edge Functions y rutas verificadas.
- **Funcional (P10)**: botones de detalle, formularios (guardan y refrescan listas),
  navegación de pestañas, modales y cambios de estado/pago verificados; las listas se
  actualizan tras cada acción.
- **Consistencia (P11)**: sin funciones duplicadas; sin referencias funcionales al
  sistema de invitaciones por código; las reservaciones web ya no aparecen como
  sección de nivel superior; sin estados de pago viejos (`pending`/`deposit_paid`/
  `failed`/`refunded`).
- **Riesgos pendientes**: (1) **Desplegar** `admin-manage-user` para cerrar P1 en
  producción; (2) bundle > 500 kB (falta code-splitting); (3) el CSS legacy
  `j-drawer-*` permanece en `styles.css` pero ya no se usa en componentes (inofensivo).

### Tests

- `tests/static-quality.test.mjs`: se sustituyó el test de "Reservas web pendientes"
  (obsoleto tras P5) por 4 tests que fijan la nueva arquitectura: P2 (pestaña dentro de
  Citas), P3 (flujo de confirmación a cita), P4/P6 (modal centrado + sin filtro de
  origen + ordenamiento) y P7 (captura por método + paso de retiro). 9/9 en verde.

---

## [Sin versión] — Prioridades P1–P11 (2026-05)

Lote de 11 prioridades aplicado por fases (A–E). Build (`npm run build`) y tests
estáticos (`node --test`) en verde al cierre de cada fase. Se conservaron todas las
funcionalidades previas y la compatibilidad con `businesses.app_state`.

### Added (nuevo)

- **P2 · Onboarding obligatorio** (`src/features/onboarding/OnboardingScreen.tsx`).
  El administrador completa los datos del negocio en su primer ingreso; se persiste
  en `businesses.onboarding_completed` y `businesses.how_found` vía la Edge Function
  `admin-manage-user` (acción `complete_onboarding`).
- **P4 · Productos y servicios** (`src/features/catalog/CatalogManager.tsx`) en el
  grupo Operación.
- **P5 · Corte de caja** (`src/features/cash/CashManager.tsx`): pantalla del día +
  historial, con cierre de corte (fondo inicial, notas) y exportación CSV. Persiste
  en `AppState.cashCuts` (nivel raíz).
- **P6 · Estadísticas** (`src/features/stats/StatsManager.tsx`): filtros por periodo
  (semana/mes/año), gráficas, margen estimado (servicio − costo de catálogo) y
  comparación contra el periodo anterior.
- **P8 · Reservaciones web** (`src/features/reservations/WebReservationsView.tsx`):
  subsección dedicada (grupo Principal) con bandeja de pendientes y acción
  "Confirmar por WhatsApp" (confirma la cita y abre `wa.me`).
- **P9 · Ficha de cliente** (`src/features/clients/ClientDetailModal.tsx`): modal
  CENTRADO (no panel lateral) con datos de contacto, totales e historial de citas.
  Se abre al hacer clic en el cliente desde la tabla de citas.
- **P10 · Proveedores** (`src/features/suppliers/SuppliersManager.tsx`): CRUD con
  WhatsApp directo. Persiste en `AppState.suppliers` (nivel raíz).
- **P11 · Selector de país de teléfono** (`src/components/PhoneInput.tsx`): México
  (+52) y EE.UU. (+1). Usado en alta de cliente nuevo, proveedores y sitio público.
- **Edge Function `admin-manage-user`**: creación directa de cuentas
  (`create_business_admin`, `create_employee`, `update_employee`, `delete_employee`)
  y `complete_onboarding`, con `service_role`.
- **Panel super_admin** (`src/features/admin/SettingsBusinessesAdmin.tsx`): crea
  negocios y administradores; reemplaza al antiguo panel de códigos de invitación.
- **SQL nuevo**: `onboarding.sql`, `accounts_direct.sql`, `remove_invitations.sql`,
  `catalog_products.sql`, `cash_cuts.sql`, `suppliers.sql` y `setup_full.sql`
  (instalación consolidada idempotente, con orden y pasos manuales documentados).

### Changed (modificado)

- **P3/P7 · Reorganización de módulos**: "Servicios" y "Equipo" salieron de
  Configuración y ahora viven en el grupo **Operación** (junto con Productos y
  Proveedores). El admin crea empleados directamente desde Operación.
- `whatsappService`: se agregó `normalizeWaNumber` (cubre EE.UU. `1`+10 dígitos)
  manteniendo intacta `normalizeMexicoWaNumber`; `buildUrl` ahora usa el wrapper.
- `databaseService.loadBusinessState`: re-adjunta `cashCuts` y `suppliers` (nivel
  raíz) tras reconstruir desde tablas normalizadas, para que persistan y **no** se
  filtren al sitio público.
- `types/index.ts`: nuevas interfaces `CashCut` y `Supplier`; `AppState` ahora
  incluye `cashCuts?` y `suppliers?`.
- Varias secciones se extrajeron de `App.tsx` a `src/features/<feature>/`.

### Removed (eliminado)

- **P1 · Sistema de invitaciones por código**:
  - Frontend: página `src/pages/SignupWithCode.tsx` y ruta `/signup?code=...`
    (eliminada de `src/lib/routing.ts`).
  - Base de datos (`remove_invitations.sql`): tabla `invitation_codes` y RPCs
    `redeem_invitation_code` / `check_invitation_code`.
  - No quedan referencias funcionales al flujo de invitaciones por código (solo
    quedan los SQL `wave3` que lo crea y `remove_invitations` que lo borra, y un
    comentario documental en el panel de super_admin).

### Security / Datos sensibles

- `cashCuts` y `suppliers` se almacenan a NIVEL RAÍZ de `AppState`, nunca dentro de
  `config`. `loadPublicBusinessBySlug` solo expone `config`, `employees` y
  `appointments`, por lo que los datos financieros y de proveedores no se exponen al
  visitante del sitio público.

### Migración (qué ejecutar)

1. **Recomendado**: `supabase/setup_full.sql` (idempotente, todo en orden).
2. Manual aparte: `create_admin_profile.sql` (UUID), `fix_profile_access.sql` (si el
   login no carga el perfil) y desplegar Edge Functions
   (`admin-manage-user` es obligatoria).
3. **Obligatorio aunque uses los archivos sueltos**: `onboarding.sql` — el frontend
   selecciona `onboarding_completed` al cargar el negocio; sin esa columna el
   dashboard no carga.

### Notas

- `App.tsx` sigue siendo grande (deuda técnica conocida), pero el code splitting ya
  redujo el chunk inicial bajo el umbral de advertencia de Vite.
- Las tablas normalizadas de catálogo, corte de caja y proveedores ya participan en
  la lectura normalizada con fallback por entidad. La escritura directa por entidad
  sigue pendiente; por ahora el frontend persiste `app_state` + espejo.
- `setup_full.sql` ya consolida los SQL de normalización A-E. En una instalación
  existente se recomienda correrlo completo o correr los archivos granulares en el
  orden documentado en `CLAUDE.md`.
