# Resumen del Proyecto

Jack es una aplicacion web tipo SaaS para administrar negocios de servicios que trabajan con citas, clientes, empleados, cobros internos e ingresos. Nacio como una demo para SPA, pero la direccion actual es que sea un sistema generico adaptable a esteticas, barberias, clinicas, consultorios, talleres y otros negocios que necesitan agenda, reservas y control operativo.

El problema principal que resuelve es centralizar la operacion diaria de un negocio pequeno o mediano: ver agenda, recibir reservas desde un sitio publico, confirmar/cancelar citas, asignar empleados, marcar pagos, revisar ingresos y exportar informacion sin depender de hojas de calculo o mensajes dispersos.

El publico objetivo son negocios locales de servicios en Mexico, especialmente negocios que pueden comprar un paquete combinado: sistema administrativo Jack + sitio web informativo conectado a reservas. El modelo comercial pensado es instalacion inicial y mensualidad recurrente.

Estado actual del proyecto:

- Frontend funcional en React + TypeScript + Vite.
- Backend conectado a Supabase Auth y Supabase Database.
- Login real con perfiles por rol: `super_admin`, `admin`, `employee`.
- El sistema de invitaciones por codigo fue ELIMINADO. Las cuentas se crean
  directamente con la Edge Function `admin-manage-user` (super_admin crea
  negocios+administradores; admin crea empleados con correo+contrasena).
- Onboarding obligatorio en el primer ingreso del administrador: datos del negocio, horarios, servicios/precios; empleados, proveedores y catálogo son omitibles. Solo marca `businesses.onboarding_completed` al finalizar.
- Dashboard editorial blanco/negro premium.
- Sitio publico de reservas en `/p/:slug` como paquete add-on.
- Reservas publicas entran al dashboard como `source = "public_site"` y estado `pending`.
- "Reservaciones web" NO es una seccion de nivel superior: es una PESTAÑA dentro de
  Citas (estado `appointmentsTab`). El botón de WhatsApp en el detalle SOLO contacta
  (abre `wa.me`); NO confirma la cita. La confirmación es MANUAL con los botones de
  "Estado de la cita" (para no confirmar por error al solo contactar al cliente).
- WhatsApp principal es manual mediante `wa.me`; no se debe usar Twilio/Meta como flujo principal por ahora.
- Selector de pais reutilizable para telefonos (Mexico +52, EE.UU. +1) en `components/PhoneInput.tsx`.
- Mercado Pago, anticipos reales, WhatsApp automático, recordatorios automáticos, Plan/facturación, suscripciones, backups desde la app, integraciones externas completas, web personalizada por cliente, onboarding autoservicio y reportes contables avanzados NO son parte del producto actual.
- Modulos extraidos de `App.tsx` a `src/features/<feature>/` (onboarding, cash,
  stats, suppliers, reservations, clients, catalog, employees, admin).
- Existe capa normalizada de base de datos, pero el frontend todavia mantiene compatibilidad con `businesses.app_state`.
- `App.tsx` quedo en ~1336 lineas tras extraer todas las vistas grandes a
  `features/` (auth, dashboard, calendar, appointments) con lazy loading (2026-06-10).

# Objetivos del Sistema

Funcionalidades principales actuales:

- Inicio de sesion real con Supabase Auth.
- Carga de perfil desde tabla `profiles`.
- Roles:
  - `super_admin`: acceso global, crea negocios y administradores (Edge Function
    `admin-manage-user`), configuracion avanzada y activacion de sitio publico.
  - `admin`: administracion del negocio; crea/edita/elimina empleados directamente
    (con correo + contrasena) sin codigos de invitacion.
  - `employee`: vista limitada a dashboard, calendario, citas y perfil.
- Onboarding obligatorio (P2): el admin completa datos del negocio en su primer
  ingreso; se marca `businesses.onboarding_completed`.
- Dashboard con KPIs, ingresos, citas proximas, resumen semanal y visualizaciones.
- Calendario mensual/semanal visual. Las celdas del mes muestran mini-preview de
  hasta 2 citas (hora + estado + primer nombre) en escritorio y conteo compacto en
  móvil; leyenda Confirmada/Pendiente/Cancelada; el panel del día tiene botón
  "Nueva cita" con la fecha precargada.
- Citas con filtros por fecha, estado, empleado, servicio, busqueda y ORDENAMIENTO
  ("Más recientes" / "Nombre del cliente"). El filtro por origen se eliminó.
- Ficha de cliente como modal centrado con historial de citas (P9).
- Reservaciones web como PESTAÑA dentro de Citas (no seccion de nivel superior). La
  bandeja de pendientes es solo lectura; el detalle vive en la ventana centrada. El
  botón "Contactar por WhatsApp" solo abre `wa.me`; confirmar es manual (estado).
- Crear, editar, eliminar y cambiar estado de citas. Todas las acciones importantes
  (estado, pago, editar, eliminar, WhatsApp) viven en una VENTANA DE DETALLE CENTRADA
  (`AppointmentDetailModal`, patron `j-modal`); las tablas son solo lectura. El estado
  y el pago se cambian con botones grandes (sin selects).
- Marcar cita como `paid` o `none` (solo desde la ventana de detalle). Al marcar
  `paid` se elige el MÉTODO de pago (efectivo / t. crédito / t. débito /
  transferencia, tipo `SalePaymentMethod`, el mismo de Ventas); nada se marca hasta
  elegir método. Persiste en `business_appointments.payment_method`.
- Corte de caja v2: CONTEO VERIFICADO por método. El sistema calcula el ESPERADO
  por método (citas pagadas con método + ventas de productos del día) y el usuario
  solo teclea lo contado; cada fila muestra Esperado | Contado | Diferencia. Los
  cobros sin método registrado aparecen como fila aparte. Cierre con retiro
  (Monto a retirar / Efectivo restante, SOLO efectivo). Sin fondo inicial.
  Historial clickeable con detalle por corte y borrado con confirmación en dos
  pasos. Día + historial con exportación Excel. Las VENTAS DE PRODUCTOS entran al
  total esperado y al detalle del día.
- Estadisticas (P6 · v2): filtros por periodo (semana/mes/ano), toggle Línea/
  Barras, comparativa visual contra el periodo anterior (línea punteada), margen
  estimado y top de servicios/productos. Las VENTAS DE PRODUCTOS entran a
  ingresos, margen, serie, ranking de empleados y export. La gráfica formatea
  moneda con `formatCurrency`/`formatCurrencyShort` (no números crudos).
- Empleados/equipo operativo en el grupo Operacion (P7).
- Productos y servicios en el grupo Operacion (P4).
- Proveedores: CRUD con WhatsApp directo (P10).
- Telefonos con selector de pais reutilizable (Mexico +52, EE.UU. +1) (P11).
- Configuracion del negocio:
  - Datos generales.
  - Horarios.
  - Reservas publicas.
  - Negocios (solo super_admin).
  - Se eliminaron las pestanas decorativas de Integraciones, Notificaciones y Plan/facturacion.
- Sitio publico `/p/:slug` con:
  - Catalogo de servicios.
  - Seleccion de empleado.
  - Disponibilidad por horario.
  - Formulario de datos del cliente (telefono con selector de pais).
  - Creacion de reserva pendiente via Edge Function `public-booking`.
- Creacion de cuentas directa via Edge Function `admin-manage-user` (sin codigos).
- Reset/flujo de acceso soportado por Supabase Auth.
- Boton visible "WhatsApp" por cita/pedido que abre WhatsApp Web/app con `https://wa.me/...`.
- Tests estaticos con `node --test` (`npm test`) + E2E con Playwright (`npm run
  test:e2e`): smoke sin credenciales y flujos autenticados gated por env.

Funcionalidades futuras planeadas o pendientes:

- Completar migracion a tablas normalizadas como fuente unica, eliminando dependencia operativa de `app_state`.
- ~~Dividir `App.tsx` en modulos por seccion y aplicar lazy loading.~~ (HECHO 2026-06-10)
- Onboarding wizard para nuevos negocios.
- Historial/ficha individual de cliente.
- Auditoria visible en UI.
- Google Calendar o bloqueo externo de disponibilidad.
- No reintroducir recordatorios automaticos, WhatsApp API, Mercado Pago, suscripciones o integraciones externas sin decision nueva de producto.
- CI/CD con GitHub Actions sigue pendiente.
- Tests funcionales/E2E adicionales siguen pendientes.
- Textos legales base existen en `/terminos` y `/privacidad`; deben revisarse con abogado antes de venta masiva.

# Arquitectura General

Tecnologias utilizadas:

- React 19.
- TypeScript.
- Vite 7.
- Tailwind CSS 3.
- CSS editorial propio en `src/styles.css`.
- Supabase JS client.
- Supabase Auth.
- Supabase PostgreSQL.
- Supabase Edge Functions en Deno.
- Lucide React para iconos.
- Recharts para graficas.
- Node test runner para pruebas estaticas.

Scripts principales:

```bash
npm run dev
npm run build
npm test
npm run preview
```

Estructura relevante:

```text
.
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── src
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   ├── types/index.ts
│   ├── components
│   │   ├── Badge.tsx
│   │   ├── Charts.tsx
│   │   ├── Editorial.tsx
│   │   ├── PhoneInput.tsx        # P11: selector de pais reutilizable (+52 / +1)
│   │   └── Toast.tsx
│   ├── features                 # secciones extraidas de App.tsx
│   │   ├── admin/SettingsBusinessesAdmin.tsx   # super_admin crea negocios+admins
│   │   ├── cash/CashManager.tsx                # P5: corte de caja (dia + historial)
│   │   ├── catalog/CatalogManager.tsx          # P4: productos y servicios
│   │   ├── clients/ClientDetailModal.tsx       # P9: ficha de cliente (modal centrado)
│   │   ├── employees/EmployeesManager.tsx      # P7: alta directa de empleados
│   │   ├── onboarding/OnboardingScreen.tsx     # P2: onboarding obligatorio
│   │   ├── reservations/WebReservationsView.tsx# P8: bandeja de reservas web
│   │   ├── stats/StatsManager.tsx              # P6: estadisticas con filtros/margenes
│   │   └── suppliers/SuppliersManager.tsx      # P10: proveedores
│   ├── lib
│   │   ├── availability.ts
│   │   ├── calculations.ts
│   │   ├── format.ts
│   │   └── routing.ts
│   ├── pages
│   │   ├── PublicBookingSite.tsx
│   │   └── LegalPage.tsx          # /terminos y /privacidad (publicas)
│   └── services
│       ├── databaseService.ts
│       ├── monitoringService.ts
│       ├── supabaseClient.ts
│       └── whatsappService.ts
├── supabase
│   ├── schema.sql
│   ├── wave3_invitations_public_site.sql
│   ├── normalized_schema.sql
│   ├── onboarding.sql           # P2: columna onboarding_completed (OBLIGATORIO)
│   ├── accounts_direct.sql      # P7: soporte para empleados directos
│   ├── remove_invitations.sql   # P1: elimina el sistema de invitaciones por codigo
│   ├── catalog_products.sql     # P4: capa normalizada futura
│   ├── cash_cuts.sql            # P5: capa normalizada futura
│   ├── suppliers.sql            # P10: capa normalizada futura
│   ├── remove_mercado_pago.sql
│   ├── create_admin_profile.sql
│   ├── fix_profile_access.sql
│   ├── setup_full.sql           # instalacion consolidada idempotente (todo en orden)
│   └── functions
│       ├── admin-manage-user/index.ts   # crea negocios/admins/empleados + onboarding + elimina negocios
│       ├── public-booking/index.ts
│       └── health/index.ts
└── tests
    └── static-quality.test.mjs
```

Flujo general de la aplicacion:

1. `src/main.tsx` monta React.
2. `src/App.tsx` parsea ruta con `src/lib/routing.ts`.
3. Rutas soportadas (ver `src/lib/routing.ts`):
   - `/`: dashboard/login.
   - `/p/:slug`: sitio publico de reservas.
   - `/terminos` y `/privacidad`: paginas legales publicas (`pages/LegalPage.tsx`).
   - `/forgot-password`: ruta reconocida, flujo ligado a Supabase.
   - (La ruta `/signup?code=...` y la pagina `SignupWithCode.tsx` fueron eliminadas
     junto con el sistema de invitaciones por codigo.)
4. Si la ruta es dashboard, `DashboardApp` revisa sesion Supabase.
5. Se carga `profiles` para conocer rol, negocio y empleado.
6. Se carga estado del negocio con `databaseService.loadBusinessState`.
7. Para admins/super_admins se renderiza `BusinessDashboard`.
8. Para publico se renderiza `PublicBookingSite`.
9. Los cambios del negocio se guardan con `databaseService.saveBusinessState`.
10. `saveBusinessState` actualiza `businesses.app_state` y espejea datos a tablas normalizadas.

Base de datos utilizada:

- Supabase PostgreSQL.
- `schema.sql` crea base inicial:
  - `businesses`
  - `profiles`
  - RLS principal para perfiles y negocio asignado.
- `wave3_invitations_public_site.sql` agrega:
  - `invitation_codes`
  - `businesses.public_site_enabled`
  - RPC `redeem_invitation_code`
  - RPC `check_invitation_code`
  - RPC `get_public_business`
- `normalized_schema.sql` agrega capa normalizada:
  - `business_services`
  - `business_employees`
  - `business_clients`
  - `business_appointments`
  - `appointment_audit_events`
  - RPC `record_appointment_audit`
  - RPC `migrate_app_state_to_normalized`
- `onboarding.sql` agrega `businesses.onboarding_completed` y `businesses.how_found`
  (OBLIGATORIO: el front selecciona `onboarding_completed` al cargar el negocio).
- `accounts_direct.sql` agrega `business_employees.email` e indice `profile_id`
  (soporte para el alta directa de empleados; ejecutar despues de normalized_schema).
- `remove_invitations.sql` elimina `invitation_codes`, `redeem_invitation_code` y
  `check_invitation_code` (sistema viejo de invitaciones por codigo).
- `catalog_products.sql`, `cash_cuts.sql`, `suppliers.sql`: capa normalizada FUTURA
  (`business_products`, `business_cash_cuts`, `business_suppliers` con RLS por
  negocio). El front aun no las usa; persiste en `app_state`.
- `setup_full.sql`: instalacion consolidada e idempotente con todo lo anterior en
  orden. No incluye `create_admin_profile.sql` (UUID manual) ni el deploy de funciones.
- `remove_mercado_pago.sql` limpia tabla/politicas legacy de pagos externos si existieron.

Servicios externos:

- Supabase Auth y Database son obligatorios.
- Supabase Edge Functions:
  - `admin-manage-user`: OBLIGATORIA. Crea negocios+administradores (super_admin),
    crea/edita/elimina empleados (admin) y completa el onboarding. Usa service_role.
    Acciones: `create_business_admin`, `delete_business`, `create_employee`,
    `update_employee`, `delete_employee`, `complete_onboarding`.
  - `public-booking`: activa para reservas publicas.
  - `health`: diagnostico tecnico basico; no representa SLA comercial.
- WhatsApp actual usa solo `wa.me` desde el frontend.
- Mercado Pago, Twilio/Meta WhatsApp API y recordatorios automaticos fueron retirados del producto activo y no deben reintroducirse sin nueva decision explicita.

# Decisiones Tecnicas Importantes

- El sistema se llama Jack. No volver a nombres anteriores como "Service Suite" o "demo".
- La estetica es B/W minimalista. DECISION (2026-06-04): se ELIMINO el estilo
  "editorial" con fuente serif en cursiva (Instrument Serif) de titulos/acentos/estados.
  Direccion actual: tipografia PLANA (Inter), sin cursivas ni serif, clara y CONSISTENTE
  en todo el sistema. No reintroducir cursivas/serif decorativos ni la paleta verde/spa legacy.
- El sistema debe ser generico para negocios de servicios, no quedar acoplado a SPA.
- El registro publico esta cerrado. Las cuentas se crean DIRECTAMENTE con la Edge
  Function `admin-manage-user` (service_role): super_admin crea negocios+admins,
  admin crea empleados. El sistema de invitaciones por codigo fue ELIMINADO
  (no reintroducir `invitation_codes`, `redeem_invitation_code`, `check_invitation_code`,
  ni la ruta `/signup?code=...`).
- `super_admin` y `admin` se tratan como administradores en la UI del negocio, pero `super_admin` tiene capacidades adicionales.
- Telefonos: usar siempre `components/PhoneInput.tsx` (selector de pais MX/US). El
  valor emitido es solo digitos internacionales (MX = `52`+10, US = `1`+10);
  `formatPhoneDisplay` los muestra legibles. `whatsappService.normalizeWaNumber`
  cubre ambos paises sin romper la regla historica de Mexico.
- Datos sensibles (`cashCuts`, `suppliers`) viven a NIVEL RAIZ de `AppState`, nunca
  dentro de `config`, para que `loadPublicBusinessBySlug` (que solo expone config,
  employees y appointments) jamas los filtre al sitio publico.
- El sitio publico es un add-on por negocio y se activa con `businesses.public_site_enabled`.
- Las reservas publicas entran como `status = "pending"` y `source = "public_site"`.
- Confirmar/cancelar reserva = cambio de estado MANUAL (botones de estado). El botón de
  WhatsApp NO confirma; solo contacta (abre `wa.me`).
- El flujo principal de WhatsApp debe abrir `wa.me`, no llamar Edge Functions de Twilio/Meta.
- Para Mexico, los telefonos de WhatsApp deben normalizarse como `52` + numero de 10 digitos. Si entra `521...`, se limpia a `52...`.
- `PaymentStatus` esta intencionalmente simplificado a:
  - `none`
  - `paid`
- Ingresos del dashboard y corte se calculan con citas marcadas como `paymentStatus === "paid"`.
- No usar estados viejos de pago: `pending`, `deposit_paid`, `failed`, `refunded`.
- Mercado Pago fue eliminado. No crear nuevamente `mercadoPagoService.ts` ni Edge Functions `mercadopago-*` sin aprobacion.
- `businesses.app_state` sigue existiendo como almacenamiento de compatibilidad.
- La capa normalizada debe ser la direccion futura. Actualmente se lee primero normalizado si hay datos, y se usa `app_state` como fallback.
- Al guardar, `saveBusinessState` escribe `app_state` y espejea a tablas normalizadas.
- `PublicBookingSite` escribe por Edge Function para evitar dar permisos anonimos de escritura directa al JSON del negocio.
- `get_public_business` es RPC sanitizado. No exponer `app_state` completo al visitante publico.
- Los formatters estan centralizados en `src/lib/format.ts`; no usar `toLocaleString` crudo en componentes.
- La disponibilidad vive en `src/lib/availability.ts`; no duplicar logica de solapamiento.
- El monitoreo frontend no debe romper la app si falla el endpoint externo.
- `dist`, `.env.local` y `*.tsbuildinfo` no deben versionarse.

# Historial de Cambios Importantes

Branding y UX/UI:

- El producto se renombro a Jack.
- Se agrego logo/favicons y metadatos.
- Se reemplazo el estilo original tipo SPA verde por diseño editorial blanco/negro.
- Se implemento sidebar por grupos: Principal, Operacion, Analisis, Sistema.
- Se agrego topbar con busqueda y accion principal.
- Dashboard, calendario, citas, empleados, estadisticas, corte de caja y configuracion fueron reskineados al estilo editorial.
- Se eliminaron referencias visuales `spa-*` y `shadow-soft`.
- Se agregaron empty states y skeleton de carga.
- Se oculto la seccion independiente de Clientes del menu porque era repetitiva; los clientes siguen existiendo como entidad y se crean/consultan desde citas.

Autenticacion y acceso:

- Se paso de login simulado a Supabase Auth real.
- Se crearon perfiles en tabla `profiles`.
- Se agregaron roles `super_admin`, `admin`, `employee`.
- Se agrego sistema de codigos de invitacion.
- Se agrego proteccion para que un usuario existente no pueda canjear una invitacion y sobrescribir su perfil.
- Admins pueden gestionar codigos de empleados de su negocio; super_admin gestiona globalmente.

Reservas web:

- Se creo ruta publica `/p/:slug`.
- Se agrego flag `public_site_enabled`.
- Se agrego RPC `get_public_business` para devolver solo datos seguros al visitante.
- Se agrego Edge Function `public-booking` para validar y crear reservas publicas.
- La reserva publica valida:
  - negocio activo.
  - sitio publico activo.
  - servicio existente.
  - precio/duracion desde catalogo.
  - empleado activo.
  - horario de atencion.
  - doble booking por duracion real.
- La reserva publica se guarda en `app_state` y se espejea a tablas normalizadas.
- Las reservas web aparecen como una PESTAÑA dentro de Citas (no seccion aparte). La
  bandeja de pendientes es solo lectura; al confirmar desde la ventana de detalle, la
  reserva pasa a `confirmed`, sale de la bandeja y entra al listado normal de citas
  (sin duplicar: `source` no cambia, solo `status`).

Pagos e ingresos:

- Se elimino Mercado Pago del frontend y de funciones locales.
- Se agrego `remove_mercado_pago.sql` para limpiar la tabla `payments` si existia.
- Se simplifico `PaymentStatus` a `none | paid`.
- Dashboard, estadisticas y corte de caja calculan ingresos solo con citas pagadas.
- Se corrigio el cambio de pago para que actualizar de `paid` a `none` tambien actualice dashboard y saldo.

WhatsApp:

- Originalmente se prepararon Edge Functions para Twilio/Meta.
- Decision posterior: no usar WhatsApp automatico desde Supabase por ahora.
- Flujo principal actual: boton "WhatsApp" en cada cita/pedido abre `wa.me`.
- El boton usa mensaje prellenado con negocio, servicio, fecha, hora y empleado.
- `send-whatsapp` y `send-reminders` fueron eliminadas del repo; si quedan desplegadas en Supabase por historial, no forman parte de la app y deben retirarse manualmente del dashboard/CLI.

Arquitectura de datos:

- Se creo `normalized_schema.sql` para produccion futura.
- Se agregaron tablas normalizadas para servicios, empleados, clientes y citas.
- Se agrego auditoria de citas con `appointment_audit_events`.
- `databaseService` ahora intenta cargar tablas normalizadas primero.
- `databaseService` normaliza estados viejos de pago al cargar.
- `databaseService` espejea cambios a tablas normalizadas al guardar.

Limpieza de codigo:

- Se eliminaron componentes legacy de formularios/modales de cliente independientes.
- Se elimino `StatCard` legacy.
- Se elimino `vite.config.js`; queda `vite.config.ts`.
- Se movio el parseo de rutas a `src/lib/routing.ts`.
- Se agregaron tests estaticos para proteger decisiones clave.

# Problemas Encontrados Durante el Desarrollo

Pantalla en blanco inicial:

- Causa: la app original estaba siendo abierta como archivo local o con configuracion/build incompleto.
- Solucion: correr mediante Vite y corregir estructura de frontend.
- Leccion: usar servidor local (`npm run dev`) para desarrollo.

Errores SQL por columnas faltantes:

- Error: `column "active" of relation "businesses" does not exist`.
- Causa: el SQL asumio columnas que no existian en el esquema real.
- Solucion: `schema.sql` se hizo idempotente con `alter table add column if not exists`.
- Leccion: todo SQL de setup debe tolerar esquemas parcialmente creados.

Error SQL por `business_type` not null:

- Error: `null value in column "business_type" violates not-null constraint`.
- Causa: inserts a `businesses` no llenaban columnas obligatorias de una version anterior del esquema.
- Solucion: agregar columnas/defaults y actualizar script de admin.
- Leccion: mantener SQL de onboarding alineado con la tabla real.

Perfil superadmin sobrescrito:

- Sintoma: al iniciar sesion como Marcos superadmin aparecia nombre/negocio de otra cuenta invitada.
- Causa: canje de invitacion podia hacer `upsert` sobre un perfil existente.
- Solucion: `redeem_invitation_code` ahora rechaza canjear si `profiles.id` ya existe.
- Leccion: invitaciones deben crear perfiles nuevos, no mutar usuarios existentes.

Rate limit de email en Supabase Auth:

- Sintoma: `email rate limit exceeded` al crear cuentas.
- Causa: limites de Supabase Auth por intentos/envios.
- Solucion: esperar o usar correos distintos; no es bug de UI.
- Leccion: el onboarding debe manejar mensajes claros de rate limit.

Duplicacion y repeticion de secciones:

- Problema: Clientes, Calendario y Citas repetian informacion.
- Solucion parcial: se oculto Clientes del menu y se centro el flujo en Citas/Calendario.
- Leccion: para negocios pequenos, menos secciones con acciones claras vale mas que CRUDs separados.

WhatsApp automatico prematuro:

- Problema: conectar Twilio/Meta agrega credenciales, plantillas y complejidad antes de validar ventas.
- Solucion: flujo manual con `wa.me`.
- Leccion: para MVP vendible, el boton manual resuelve gran parte del valor sin infraestructura extra.

Mercado Pago prematuro:

- Problema: pagos externos no eran prioridad y complicaban producto.
- Solucion: eliminar Mercado Pago y dejar pagos internos `none | paid`.
- Leccion: primero controlar agenda/confirmacion/pago interno; cobros online pueden venir despues.

JSONB monolitico:

- Problema: `businesses.app_state` puede sufrir race conditions si dos usuarios guardan a la vez.
- Solucion parcial: crear tablas normalizadas y empezar lectura/espejo.
- Leccion: antes de escalar a muchos clientes, normalizar como fuente unica.

Bundle grande:

- Sintoma: build advertia chunk JS de mas de 500 KB.
- Causa: `App.tsx` enorme y pantallas sin lazy loading.
- Solucion (parcial, #10): se aplico `React.lazy` + `Suspense` a los componentes
  pesados o de una sola seccion/ruta (`PublicBookingSite`, `RevenueChart`/recharts,
  `StatsManager`, `CatalogManager`, `CashManager`, `SuppliersManager`,
  `EmployeesManager`, `WebReservationsView`, `ClientDetailModal`, `SettingsEditorial`).
  El chunk principal bajo de 960 kB a 484 kB (gzip 264 → 138 kB) y desaparecio la
  advertencia de Vite. `recharts` quedo en su propio chunk (~394 kB) que solo se
  descarga al pintar una grafica. Pendiente: terminar de dividir las vistas grandes
  restantes de `App.tsx`.

# Estado Actual del Codigo

Modulos terminados o funcionales:

- Login con Supabase Auth.
- Carga de perfiles y roles.
- Dashboard principal.
- Calendario.
- Citas con filtros/ordenamiento; acciones desde ventana de detalle centrada.
- Reservas web como pestaña dentro de Citas (bandeja de pendientes solo lectura;
  confirmar desde el detalle convierte la reserva en cita normal).
- Corte de caja con captura por método + paso de retiro y CSV (dia + historial).
- Estadisticas con filtros, graficas, margen estimado y comparacion de periodos.
- Onboarding obligatorio del negocio en el primer ingreso.
- Configuracion basica de negocio, horarios y sitio publico.
- Productos y servicios (grupo Operacion).
- Proveedores (grupo Operacion).
- Equipo/empleados operativo (grupo Operacion; alta directa por admin).
- Ficha de cliente como modal centrado con historial.
- Selector de pais reutilizable para telefonos (MX/US).
- Sitio publico de reservas.
- Creacion directa de cuentas via Edge Function `admin-manage-user` (sin invitaciones).
- WhatsApp manual con `wa.me`.
- Health check Edge Function.
- Tests estaticos de decisiones clave.

Modulos en desarrollo/transicion:

- Capa normalizada de base de datos:
  - Lectura normalizada con fallback por entidad ya cubre clientes, citas,
    servicios, empleados, productos/categorias, proveedores y corte de caja.
  - `setup_full.sql` ya incluye los lotes de normalizacion A-E.
  - Frontend todavia conserva `app_state` como espejo/backward compatibility.
  - Falta cambiar las escrituras CRUD para escribir directo por entidad.
  - Falta retirar gradualmente `app_state` cuando la migracion sea segura.
- Auditoria:
  - Registro existe para cambio de estado/pago.
  - Falta vista de auditoria en UI.
- Monitoreo:
  - `monitoringService` es solo registro tecnico/best-effort de errores.
  - `health` es diagnostico tecnico, no SLA ni monitoreo comercial completo.
- WhatsApp/API:
  - El flujo principal y unico activo es manual con `wa.me`.
  - Las Edge Functions `send-whatsapp` y `send-reminders` fueron eliminadas del repo.
- Onboarding:
  - Ya no usa invitaciones por codigo.
  - Wizard inicial ya cubre datos del negocio, horarios, servicios/precios y pasos omitibles de empleados/proveedores/catalogo.

Verificacion Supabase aplicada (2026-06-03):

- Se ejecuto `supabase/setup_full.sql` contra el proyecto enlazado
  `gdcsuhidiccyfcltrsug`.
- Se ejecutaron backfills para todos los negocios existentes:
  - `migrate_app_state_to_normalized(id)`
  - `migrate_catalog_to_normalized(id)`
  - `migrate_suppliers_to_normalized(id)`
  - `migrate_cash_cuts_to_normalized(id)`
- Negocios encontrados:
  - Jack (`slug: jack`): 9 clientes, 11 citas, 4 servicios, 3 empleados,
    2 categorias, 0 productos, 1 proveedor, 2 cortes de caja.
  - TerraMar (`slug: terramar`): 0 entidades normalizadas (negocio nuevo/sin datos).
- Checks post-backfill:
  - cortes activos duplicados por negocio/dia: 0
  - citas activas sin cliente: 0
  - citas activas sin empleado: 6
- Las 6 citas sin empleado vienen de datos historicos con `employeeId` vacio o no
  valido. El RPC `migrate_app_state_to_normalized` ahora las tolera guardando
  `employee_id = null`. Si el negocio las necesita operativas, deben reasignarse
  manualmente desde la UI o con una migracion especifica.
- `setup_full.sql`, `cash_cuts.sql` y `normalize_cash_cuts.sql` se ajustaron para
  tolerar cortes duplicados existentes: se soft-deletean duplicados activos y se usa
  un indice unico parcial para permitir un solo corte activo por negocio/dia.

Modulos que requieren revision:

- `src/App.tsx`: ~1336 lineas (bajo de ~2630 al extraer las vistas grandes en
  2026-06-10: `LoginScreen` → `features/auth/`, `Dashboard`+`WeeklyView` →
  `features/dashboard/`, `CalendarView` → `features/calendar/`,
  `AppointmentDetailModal` y `NewAppointmentFullScreen` → `features/appointments/`,
  helpers compartidos → `lib/appointmentUi.ts`; todas cargan lazy). Lo que queda en
  App.tsx es razonable: routing, sesion, shell (sidebar/topbar), handlers de
  persistencia y las vistas chicas `AppointmentsView`/`EmployeesView`. Nuevas
  funcionalidades grandes siguen SIN agregarse aqui.
- `databaseService.ts`: hace demasiadas cosas: perfiles, estado, normalizacion,
  publico, cuentas, auditoria y espejos.
- RLS de tablas normalizadas debe revisarse antes de produccion con multiples negocios.
- `public-booking` todavia actualiza `app_state` completo; puede haber race conditions.
- `send-reminders` y `send-whatsapp` fueron eliminadas del repo; no reintroducir sin aprobacion.
- `.supabase/.temp` existe localmente; no debe versionarse.


## Actualizacion 2026-06-30 — Limpieza de alcance y Superadmin

- Se eliminaron del producto activo: Mercado Pago/anticipos reales, WhatsApp automatico con API, recordatorios automaticos, Plan & facturacion, suscripciones reales, SLA/monitoreo comercial completo, backups desde la app, integraciones externas completas, web personalizada por cliente, onboarding 100% autoservicio y reportes avanzados contables.
- `SettingsEditorial` solo muestra secciones activas: Negocio, Horario de atención, Reservas públicas y Negocios (super_admin).
- `SettingsBusinessesAdmin` fue rediseñado como sistema superadmin: KPIs, busqueda, alta de negocios, eliminar/archivar, reactivar, activar/desactivar reservas publicas y abrir `/p/:slug`.
- Eliminar negocio es una baja operativa segura: `admin-manage-user` accion `delete_business` marca `businesses.active=false`, apaga `public_site_enabled`, desactiva perfiles vinculados y marca empleados como inactivos. `restore_business` reactiva negocio/accesos y `set_business_public_site` controla reservas publicas desde superadmin. No hard-deletea historico.
- Se eliminaron del repo `supabase/functions/send-whatsapp` y `supabase/functions/send-reminders`. WhatsApp queda exclusivamente manual con `wa.me`.
- `LegalPage.tsx` contiene terminos y aviso de privacidad integrales para Mexico; deben revisarse con abogado antes de venta masiva.


## Actualizacion 2026-07-06 — Superadmin completo

- El superadmin ya no solo crea negocios: administra el ciclo operativo completo desde Configuracion > Negocios.
- Acciones disponibles: crear negocio + administrador, buscar, eliminar/archivar, reactivar, activar/desactivar reservas publicas y abrir `/p/:slug`.
- Backend: `admin-manage-user` soporta `delete_business`, `restore_business` y `set_business_public_site`.
- IMPORTANTE: despues de estos cambios siempre desplegar `supabase functions deploy admin-manage-user`; si no se despliega, Vercel mostrara botones pero Supabase respondera accion no reconocida.

# Pendientes Prioritarios

Bugs/riesgos conocidos:

- Race condition por guardar `app_state` completo.
- `App.tsx` demasiado grande y dificil de mantener.
- Bundle JS inicial ya fue reducido con code splitting; mantener vigilancia si vuelve a crecer.
- Capa normalizada ya es fuente principal de lectura, pero todavia no es fuente unica de escritura.
- Public booking puede pisar cambios si entra reserva al mismo tiempo que admin guarda.
- No hay tests E2E reales.
- No hay SLA/monitoreo comercial completo por decision de producto actual.
- No hay vista de historial/auditoria.
- No hay backups desde la app por decision de producto actual.

Mejoras prioritarias:

1. Cambiar operaciones CRUD para escribir directamente en tablas normalizadas por entidad.
2. Agregar bandera `normalized_ready` por negocio cuando la migracion este validada.
3. Dejar `app_state` solo para configuracion o eliminarlo gradualmente.
4. Dividir `App.tsx`. (HECHO 2026-06-10: `features/auth`, `features/dashboard`,
   `features/calendar`, `features/appointments` extraidos con lazy; `features/settings`
   ya existia. App.tsx ~1336 lineas, chunk principal 472 kB sin advertencia.)
5. Agregar lazy loading por seccion. (HECHO: todas las secciones y modales grandes.)
6. Crear onboarding wizard para negocios nuevos.
7. Crear ficha de cliente con historial.
8. Mostrar auditoria de cita.
9. Agregar tests E2E:
   - login.
   - crear cita.
   - reservar desde web.
   - confirmar/cancelar reserva.
   - abrir WhatsApp manual.
   - marcar pagado/no pagado.
10. Configurar monitoreo real.
11. Configurar CI/CD.
12. Revisar RLS con pruebas de aislamiento multi-tenant.

Funciones planeadas pero no urgentes:

- Google Calendar.
- Recordatorios automaticos.
- Pagos online.
- Planes/facturacion real.
- Reportes avanzados.
- Exportaciones adicionales.

# Auditoria Tecnica Actual

Esta seccion resume la auditoria tecnica mas reciente del proyecto. Debe usarse como
referencia antes de hacer refactors, cambios de base de datos, cambios de permisos o
funcionalidades nuevas.

## Resumen del Estado Real

Jack ya funciona como una demo avanzada/MVP controlado: compila, tiene login real,
reservas publicas, gestion de citas, empleados, catalogo, proveedores, corte de caja,
dashboard, WhatsApp manual con `wa.me` y Supabase Auth. Visualmente ya se acerca a un
producto vendible.

El principal riesgo tecnico es que el sistema vive en una etapa hibrida: existen tablas
normalizadas, pero el frontend todavia depende mucho de `businesses.app_state` como JSON
grande. Esa mezcla puede causar datos duplicados, datos que reaparecen despues de borrar,
conflictos cuando dos usuarios guardan al mismo tiempo y errores de permisos para empleados.

## Cosas Que Funcionan Bien

- Build y pruebas actuales pasan (`npm run build`, `npm test`).
- Supabase Auth esta integrado con roles reales (`super_admin`, `admin`, `employee`).
- El flujo principal de WhatsApp manual con `wa.me` esta alineado con la decision de producto.
- La UI editorial B/W ya es consistente en la mayoria de vistas.
- La bandeja de reservaciones web vive dentro de Citas, que es una decision correcta para evitar redundancia.
- `admin-manage-user` centraliza creacion de negocios, administradores y empleados con service role.
- `public-booking` valida negocio, servicio, empleado, horario y disponibilidad desde backend.
- Hay documentacion util en `CHANGELOG.md` y este archivo.

## Problemas Criticos Detectados

### 1. `app_state` sigue siendo demasiado importante

Archivos principales:

- `src/services/databaseService.ts`
- `src/App.tsx`
- `supabase/functions/public-booking/index.ts`

Aunque existen tablas normalizadas, muchas acciones todavia actualizan el JSON completo
`businesses.app_state`. Esto puede provocar race conditions: si admin y empleado guardan
a la vez, uno puede sobrescribir el cambio del otro. La solucion correcta es hacer que
clientes, empleados, citas, servicios, cortes, proveedores y catalogo usen tablas como
fuente principal, dejando `app_state` solo para configuracion ligera.

Avance (2026-06-01): CLIENTES y CITAS ya son fuente principal de LECTURA (loader
normalizado con fallback por entidad). `app_state` se mantiene como espejo/compat.

Avance (2026-06-04, #1): CITAS y CLIENTES ya también se ESCRIBEN directo por fila
(`upsertAppointment`/`upsertClient`/`softDeleteAppointment`), NO reescribiendo el JSON
completo. El upsert por fila es atómico → sin race entre citas. `app_state` se sincroniza
best-effort (`saveAppStateBestEffort`). `public-booking` checa doble-booking también
contra la tabla.

Avance (2026-06-12, #1/#2): se migraron a escritura por fila CATÁLOGO
(`upsertService`/`upsertProduct`/`upsertCategory` + import CSV secuencial),
PROVEEDORES (`upsertSupplier`), CORTE DE CAJA (`upsertCashCut`) y VENTAS de productos
(`insertSale` + `updateProductStock` en la nueva tabla `business_sales`, ver
`supabase/sales.sql`). En `App.tsx` esas secciones usan `applyWithStateMirror`
(UI local + `app_state` espejo best-effort) en vez de `saveBusinessState`. SOLO
`Configuración` (config ligera) sigue escribiendo el `app_state` completo, por
diseño. PENDIENTE: empleados (su alta real ya pasa por la Edge Function, no por
app_state) y, a futuro, retirar `app_state` como espejo.

### 2. Datos borrados pueden reaparecer — RESUELTO para citas/clientes (2026-06-01)

Archivo principal:

- `src/services/databaseService.ts`

Estado: en el mini-lote de normalización (clientes + citas) se resolvió para esas dos
entidades. El borrado de cita ahora hace SOFT-DELETE EXPLÍCITO por id
(`softDeleteAppointment`, llamado desde `deleteAppointment`) y el loader filtra
`deleted_at is null`, así la cita no reaparece. Se agregó `softDeleteClient` (aún sin
caller de UI). NO se usa borrado-por-ausencia (evita borrar reservas públicas entrantes
si la sesión del admin está vieja). `mirrorNormalizedState` sigue haciendo `upsert` para
create/edit, sin tocar `deleted_at`, así un registro borrado no resucita.

Pendiente: empleados, servicios, catálogo, proveedores y corte de caja todavía dependen
del `upsert` sin sincronización de borrado (no se migraron en este lote).

### 3. Empleados pueden no guardar cambios por RLS — RESUELTO para citas (2026-06-04)

Archivos principales:

- `src/App.tsx`
- `src/services/databaseService.ts`

Estado: RESUELTO para citas (#1) y VENTAS (#1, 2026-06-12). Las acciones de cita
(crear/editar/estado/pago/borrar), el alta de cliente y el REGISTRO DE VENTAS escriben
DIRECTO por fila (`upsertAppointment`/`upsertClient`/`softDeleteAppointment`/`insertSale`/
`updateProductStock`), que la RLS de `business_appointments`/`business_clients`/
`business_sales` sí permite al `employee`. Ya no dependen de `update businesses` (que el
employee no puede). El `app_state` se sincroniza best-effort (`saveAppStateBestEffort`).
Esto cerró el bug por el que un empleado vendiendo en la pestaña Ventas no podía guardar.
El empleado solo accede a dashboard/calendario/agenda(citas+ventas), así que las demas
secciones (config/catálogo/proveedores/caja) no le aplican.

### 4. Borrar empleados puede dejar citas huerfanas

Archivo principal:

- `src/features/employees/EmployeesManager.tsx`

Al eliminar un empleado, las citas existentes pueden seguir apuntando a su `employeeId`.
Esto puede causar citas sin responsable, errores de FK en tablas normalizadas o fallos al
sincronizar. Antes de borrar empleado debe forzarse reasignacion o poner `employeeId = null`
en app state y tablas.

### 5. Llaves primarias normalizadas no son seguras multi-tenant

Archivos principales:

- `supabase/normalized_schema.sql`
- `supabase/catalog_products.sql`
- `supabase/cash_cuts.sql`
- `supabase/suppliers.sql`

Varias tablas usan `id text primary key` global. Si dos negocios generan el mismo ID
pueden chocar y un upsert `on conflict (id)` podría REASIGNAR la fila a otro negocio.

Estado (2026-06-04): riesgo práctico NEUTRALIZADO sin migración destructiva.
- `uid()` es aleatorio (`prefix-random-timestamp`) y los negocios nuevos arrancan con
  `services: []` (sin ids deterministas) → colisión global casi imposible.
- `supabase/harden_multitenant_pks.sql` agrega un TRIGGER guardián
  (`jack_block_business_id_change`) en todas las tablas normalizadas que BLOQUEA
  cualquier UPDATE que intente cambiar `business_id` → un upsert cruzado falla en vez
  de corromper.
Pendiente (opcional, CON RESPALDO): migrar a PK compuesta `(business_id, id)` o UUID.
Es destructivo (drop/recreate PK + FKs + RLS + onConflict del front + edge functions),
por eso NO se ejecutó; el guardián cubre el riesgo mientras tanto.

### 6. Carga normalizada parcial puede ocultar datos reales

Archivo principal:

- `src/services/databaseService.ts`

Estado (2026-06-01): se implemento FALLBACK POR ENTIDAD en `loadNormalizedState`. Cada
entidad (servicios, empleados, clientes, citas) usa la tabla normalizada si tiene filas;
si esta vacia, cae a `app_state` solo para esa entidad. Asi ya no se ven listas vacias por
una migracion parcial entre entidades.

Riesgo restante: el fallback solo dispara si la tabla esta TOTALMENTE vacia. Si una tabla
quedo PARCIALMENTE poblada (algunas citas migradas y otras solo en `app_state`), se muestra
lo normalizado. Mitigacion: `mirror` corre en cada guardado (completa la tabla al primer
save) o correr el RPC `migrate_app_state_to_normalized(business_id)` para backfill. Una
bandera `normalized_ready` por negocio sigue siendo deseable a futuro.

### 7. Corte de caja calcula mal efectivo restante

Archivo principal:

- `src/features/cash/CashManager.tsx`

El efectivo restante se calcula con total recibido, incluyendo tarjeta/transferencia. Para
negocio real, retiro y efectivo restante deben basarse solo en pagos de efectivo. Esto afecta
la utilidad contable del modulo.

### 8. Reservas publicas — ENDURECIDA (2026-06-01); migracion a tablas pendiente

Archivo principal:

- `supabase/functions/public-booking/index.ts`

Estado: se endurecio en un lote acotado y se redesployo/verifico en vivo. Ya aplica:
solo `POST` (405), payload acotado (8 KB), validacion fuerte de entrada (nombre,
telefono solo digitos 10-15, email, notas con tope, fecha no pasada / no mas de 180
dias, hora `HH:MM`), AUTORIDAD DEL SERVIDOR sobre campos sensibles (precio/duracion/
deposito desde catalogo; id/createdAt/status/paymentStatus/paidAmount/source fijados
en backend, ignorando lo que mande el cliente) y anti-spam SIN tablas nuevas (throttle
por IP en memoria, tope de rafaga por negocio, bloqueo de reserva duplicada por
telefono+fecha/hora, honeypot opcional `hp`).

Pendiente (NO en este lote): la funcion sigue escribiendo `app_state` completo + espejo
normalizado; migrar a escritura directa a tablas normalizadas como fuente principal es
parte de #2/#6 y se hara con respaldo. Un rate limit persistente (tabla dedicada) queda
para cuando se aborde la fundacion de datos.

### 9. Edge Functions de WhatsApp automatico — RESUELTO (2026-06-30)

Archivos retirados del repositorio:

- `supabase/functions/send-whatsapp/index.ts`
- `supabase/functions/send-reminders/index.ts`

La decision actual del producto es NO usar WhatsApp automatico con Twilio/Meta ni recordatorios automaticos. El flujo principal debe ser boton manual `wa.me`. Si alguna funcion quedo desplegada en Supabase de despliegues anteriores, debe eliminarse desde el dashboard/CLI de Supabase o dejarse sin secrets; la app ya no la llama.

### 10. `App.tsx` sigue siendo grande — RESUELTO (2026-06-10)

Archivo principal:

- `src/App.tsx`

Estado: RESUELTO en dos fases.
- Fase 1 (2026-05-31): se extrajo Configuracion a `features/settings/` y se aplico
  code splitting con `React.lazy` + `Suspense` a los componentes pesados
  (`PublicBookingSite`, recharts, managers de secciones). Chunk 960 kB → 484 kB.
- Fase 2 (2026-06-10): se extrajeron las vistas grandes restantes, todas lazy:
  `LoginScreen` → `features/auth/`, `Dashboard` + `WeeklyView` →
  `features/dashboard/`, `CalendarView` → `features/calendar/`,
  `AppointmentDetailModal` y `NewAppointmentFullScreen` → `features/appointments/`.
  Los helpers compartidos (`appointmentStatusLabel`, `appointmentStatusChoices`,
  `PAY_METHOD_LABELS`) se movieron a `src/lib/appointmentUi.ts`. `App.tsx` bajo de
  ~2630 a ~1336 lineas y el chunk principal de 504 kB a 472 kB (gzip 136 kB), sin
  advertencia de Vite.

En `App.tsx` quedan routing, sesion, shell (sidebar/topbar/nav), handlers de
persistencia y las vistas chicas `AppointmentsView`/`EmployeesView`/`EmployeeSettings`.
Regla vigente: nuevas funcionalidades grandes NO deben agregarse a `App.tsx`.

## Funciones Incompletas o Simuladas

- Normalizacion de BD: existe, pero `app_state` aun vive como compatibilidad.
- WhatsApp automatico: eliminado del repo; el producto usa `wa.me` manual.
- Recordatorios automaticos: eliminados del producto actual.
- Plan y facturacion: eliminado de la UI actual.
- Google Calendar/integraciones externas completas: fuera del alcance actual.
- Onboarding: wizard de 4 pasos (sobre ti, horarios, primer servicio, equipo) (2026-06-12).
  Pendiente opcional: activar/configurar el sitio publico desde el mismo wizard.
- Catalogo: administra productos/servicios; las VENTAS de productos se registran en la
  pestaña Ventas (tabla `business_sales`, escritura por fila) (2026-06-12).
- Proveedores: funcional en UI; escribe por fila (`upsertSupplier`) + espejo app_state.
- Cortes de caja: corte v2 por metodo; escribe por fila (`upsertCashCut`) + espejo.
- Tests: estaticos (node --test, 16) + E2E Playwright (smoke siempre; flujos
  autenticados gated por `JACK_E2E_EMAIL`/`JACK_E2E_PASSWORD`) (2026-06-12).

## Prioridades Recomendadas

Prioridad alta:

1. Hacer tablas normalizadas fuente principal. (CASI: citas, clientes, catalogo,
   proveedores, caja y ventas escriben por fila; solo config sigue en app_state.)
2. Corregir guardado de acciones de empleados. (HECHO: citas y ventas por fila, RLS
   permite al employee; 2026-06-12.)
3. Resolver deletes/sincronizacion para que datos borrados no reaparezcan. (HECHO para
   citas/clientes/servicios/productos/proveedores/cortes; patron anti-resurreccion.)
4. Corregir corte de caja por metodo de pago. (HECHO, #7)
5. Endurecer `public-booking`. (HECHO, lote acotado 2026-06-01; falta solo la
   migracion a tablas normalizadas, que pertenece a #2/#6.)
6. Corregir llaves primarias multi-tenant. (Mitigado con trigger guardian, #5.)
7. Desactivar o proteger WhatsApp automatico. (HECHO, #9)
8. Agregar pruebas E2E. (HECHO: Playwright smoke + flujos gated; 2026-06-12.)
9. Paginas legales (terminos/privacidad). (HECHO: /terminos y /privacidad; falta
   completar campos [entre corchetes] y revision legal.)

Prioridad media:

1. Separar `App.tsx` en modulos por feature. (HECHO 2026-06-10; antes PARCIAL: Settings extraido; faltaban las
   vistas grandes acopladas.)
2. Completar onboarding real.
3. Conectar catalogo, proveedores y cortes a tablas reales.
4. Consolidar SQL oficial y archivar scripts viejos.
5. Reducir bundle con lazy loading. (HECHO: 960 kB → 484 kB, sin advertencia de Vite.)
6. Agregar auditoria de acciones importantes.

Prioridad baja:

1. Limpiar CSS y componentes legacy no usados.
2. Ocultar botones sin accion real.
3. Mejorar mensajes de error y empty states.
4. Pulir detalles visuales menores.

## Plan Tecnico Recomendado

1. Congelar nuevas features hasta estabilizar persistencia.
2. Definir migracion oficial por negocio desde `app_state` hacia tablas.
3. Agregar bandera de migracion completa (`normalized_ready` o equivalente).
4. Reescribir `databaseService` por entidad: clientes, citas, empleados, servicios, cortes y proveedores.
5. Ajustar RLS para admin/employee segun acciones reales.
6. Refactorizar `public-booking` para escribir directo a tablas.
7. Corregir corte de caja.
8. Dividir `App.tsx` en modulos.
9. Agregar pruebas E2E minimas: login, crear cita, reserva web, confirmar, marcar pagado, corte de caja.
10. Despues de estabilizar, mejorar onboarding y preparar venta a negocios.

# Prompt Recomendado Para Claude

Usa este prompt cuando abras una nueva sesion de Claude Code para continuar el proyecto:

```text
Actua como un programador full stack senior especializado en React, TypeScript,
Supabase, PostgreSQL, RLS, arquitectura SaaS multi-tenant y UX de productos para
negocios locales.

Antes de escribir codigo:
1. Lee CLAUDE.md completo.
2. Revisa package.json, src/types/index.ts, src/services/databaseService.ts,
   src/App.tsx, supabase/schema.sql, supabase/normalized_schema.sql y las Edge
   Functions relevantes.
3. No asumas que una funcion esta lista solo porque existe un archivo.
4. Verifica si la funcion esta conectada, usada, protegida por RLS y persistiendo
   en la fuente correcta.

Contexto del producto:
- Jack es un sistema SaaS para negocios de servicios con citas, empleados,
  reservas web, WhatsApp manual, corte de caja, catalogo, proveedores y dashboard.
- El flujo principal de WhatsApp NO debe usar Twilio/Meta por ahora. Debe abrir
  WhatsApp manualmente con wa.me.
- Mercado Pago fue eliminado del MVP actual.
- El sistema de invitaciones por codigo fue eliminado; las cuentas se crean con
  la Edge Function admin-manage-user.
- Reservaciones web viven dentro de Citas como pestana/bandeja, no como seccion
  principal separada.

Objetivo tecnico inmediato:
Prioriza estabilidad antes de nuevas funciones. El problema principal es que el
frontend aun depende de businesses.app_state, aunque ya existen tablas normalizadas.
Hay que convertir las tablas normalizadas en fuente principal sin romper la app.

Reglas:
- No agregues mas logica grande a App.tsx.
- No reintroduzcas Mercado Pago.
- No reintroduzcas codigos de invitacion.
- No conviertas WhatsApp manual a API automatica sin autorizacion explicita.
- No hagas DROP destructivo sin explicar el impacto.
- Mantén SQL idempotente.
- Respeta roles: super_admin, admin, employee.
- Respeta PaymentStatus = none | paid.
- Ejecuta npm test y npm run build antes de cerrar.

Prioridades de trabajo:
1. Normalizar persistencia real por entidad.
2. Corregir RLS/guardado para empleados.
3. Evitar que datos borrados reaparezcan.
4. Corregir corte de caja por metodo de pago.
5. Endurecer public-booking.
6. Separar App.tsx en modulos.
7. Completar onboarding real.
8. Agregar pruebas E2E.

Entrega siempre:
- Resumen de cambios.
- Archivos modificados.
- Riesgos o pendientes.
- Resultado de npm test y npm run build.
```

# Reglas Para Futuras Modificaciones

Partes criticas:

- `src/types/index.ts`: cualquier cambio a tipos afecta toda la app.
- `src/services/databaseService.ts`: cualquier cambio puede romper login, carga de negocio, invitaciones o persistencia.
- `src/lib/availability.ts`: no duplicar ni cambiar sin probar reservas y doble booking.
- `src/lib/calculations.ts`: afecta dashboard, estadisticas y corte de caja.
- `supabase/schema.sql`, `wave3_invitations_public_site.sql`, `normalized_schema.sql`: cualquier cambio requiere pensar en RLS, idempotencia y datos existentes.
- `supabase/functions/public-booking/index.ts`: entrada publica; validar siempre negocio, horario, servicio, empleado, precio y disponibilidad.
- `src/services/whatsappService.ts`: flujo principal actual de WhatsApp. No convertirlo a API automatica sin decision explicita.

No modificar sin analizar impacto:

- Roles (`super_admin`, `admin`, `employee`).
- `PaymentStatus = "none" | "paid"`.
- `BookingSource = "dashboard" | "public_site"`.
- Edge Function `admin-manage-user` (creacion de cuentas y onboarding con service_role).
  No reintroducir el sistema de invitaciones por codigo ya eliminado.
- RPC `get_public_business` y politica de no exponer `app_state` completo al anonimo.
- `cashCuts` y `suppliers` deben permanecer a nivel raiz de `AppState` (no en config).
- RLS de negocios/perfiles.
- Normalizacion de telefono para `wa.me` (`normalizeMexicoWaNumber` / `normalizeWaNumber`).
- Calculo de ingresos basado en `paymentStatus === "paid"`.

Buenas practicas especificas:

- Usar `rg` para buscar referencias antes de editar.
- Ejecutar `npm test` despues de cambios de arquitectura o decisiones de producto.
- Ejecutar `npm run build` antes de entregar cambios funcionales.
- Mantener SQL idempotente con `if not exists`, `drop policy if exists` y cuidado con tablas que pueden no existir.
- No usar `DROP TABLE` destructivo salvo en scripts explicitamente destinados a limpieza y documentados.
- No guardar secretos en codigo ni en `CLAUDE.md`.
- No usar `dist` como fuente; es output de build.
- Evitar meter mas logica en `App.tsx`; nuevas funciones grandes deben ir a archivos separados.
- Mantener el lenguaje visual B/W minimalista, PLANO y consistente (sin serif/cursiva).
- No agregar CRUDs redundantes si una accion ya vive naturalmente en Citas/Calendario.
- Para nuevas integraciones externas, primero definir si son parte del MVP vendible o solo preparacion futura.
- Para el sitio publico, nunca confiar en precio/duracion enviados por el cliente; siempre recalcular desde catalogo del negocio.
- Para reservas, siempre validar disponibilidad en frontend y backend.
- Para WhatsApp manual, siempre abrir en nueva pestana con `noopener,noreferrer`.

Comandos utiles:

```bash
npm run dev
npm test
npm run build
supabase functions deploy admin-manage-user
supabase functions deploy public-booking --no-verify-jwt
supabase functions deploy health --no-verify-jwt
```

SQL recomendado:

- Forma rapida (recomendada): ejecutar `supabase/setup_full.sql`. Es idempotente
  y aplica TODO en el orden correcto (schema, wave3, normalized, onboarding,
  accounts_direct, remove_invitations, catalog/cash/suppliers, normalize A-E y
  remove_mercado_pago).
  Sirve tanto en instancia nueva como existente.
- Pasos manuales que `setup_full.sql` NO incluye:
  1. `supabase/create_admin_profile.sql` adaptando el UUID del usuario Auth.
  2. `supabase/fix_profile_access.sql` solo si el login no carga el perfil.
  3. Desplegar Edge Functions (ver "Comandos utiles"); `admin-manage-user` es
     OBLIGATORIA para crear cuentas y completar el onboarding.

Forma granular (equivalente, por archivos, en este orden):

1. `supabase/schema.sql`
2. `supabase/wave3_invitations_public_site.sql`
3. `supabase/normalized_schema.sql`
4. `supabase/onboarding.sql`  (OBLIGATORIO: el front hace `select onboarding_completed`)
5. `supabase/accounts_direct.sql`  (despues de normalized_schema)
6. `supabase/remove_invitations.sql`
7. `supabase/catalog_products.sql`, `cash_cuts.sql`, `suppliers.sql` (tablas base
   para catalogo, corte de caja y proveedores)
8. `supabase/normalize_clients_appointments.sql` (mini-lote #2/#6: garantiza `deleted_at`
   en clientes/citas + indices parciales; correr despues de normalized_schema.sql)
9. `supabase/normalize_catalog.sql` (lote C #2/#6: RPC backfill de productos/categorias;
   correr DESPUES de catalog_products.sql)
9b. `supabase/product_inventory.sql` (inventario: columnas `stock`/`low_stock` en
    business_products; correr DESPUES de catalog_products.sql)
10. `supabase/normalize_suppliers.sql` (lote D #2/#6: deleted_at + RPC backfill de
    proveedores; correr DESPUES de suppliers.sql)
11. `supabase/normalize_cash_cuts.sql` (lote E #2/#6: columnas por metodo/retiro +
    deleted_at + RPC backfill de cortes; correr DESPUES de cash_cuts.sql)
11b. `supabase/cash_cut_v2.sql` (corte v2: `business_appointments.payment_method` +
     esperado por metodo y ventas en `business_cash_cuts`; correr DESPUES de
     normalized_schema.sql y cash_cuts.sql; el front tolera que falte)
11c. `supabase/sales.sql` (ventas de productos por fila en `business_sales`, con RLS
     que permite al `employee` registrar ventas; correr DESPUES de schema.sql; el
     front tolera que falte —la venta queda en app_state mientras tanto)
12. `supabase/harden_multitenant_pks.sql` (#5: trigger guardián que bloquea cambiar
    `business_id` en UPDATE; idempotente, no destructivo; correr al final)
13. `supabase/remove_mercado_pago.sql` (solo si hubo tablas legacy de Mercado Pago)
14. `supabase/create_admin_profile.sql` (UUID manual)

Mantenimiento (no parte del install): `supabase/fix_corrupted_phones.sql` limpia
teléfonos arruinados por el bug viejo de PhoneInput (revisar el SELECT antes del UPDATE).

Nota final:

Jack ya es una demo funcional y vendible como primera version controlada para negocios pequenos, especialmente si el soporte/instalacion lo hace el vendedor. Todavia no debe tratarse como SaaS masivo sin antes resolver normalizacion completa, modularizacion, pruebas E2E, monitoreo y backups.
