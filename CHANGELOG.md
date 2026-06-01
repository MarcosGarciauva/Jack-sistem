# Changelog — Jack

Todas las notas relevantes de cambios del sistema. Las versiones siguen un esquema
informal por "olas" de prioridades (P1–P11). El formato se inspira en
[Keep a Changelog](https://keepachangelog.com/).

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

- `App.tsx` sigue siendo grande (deuda técnica conocida) y el bundle supera 500 kB;
  pendiente code-splitting / lazy loading.
- Las tablas normalizadas de catálogo, corte de caja y proveedores existen como
  capa futura; el frontend todavía persiste en `app_state`.
