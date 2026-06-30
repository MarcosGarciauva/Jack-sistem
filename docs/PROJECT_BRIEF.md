# Jack - Estado actual del proyecto

Jack es una aplicación web para negocios de servicios que trabajan con citas, clientes, empleados, ventas internas, catálogo, proveedores y corte de caja. El objetivo es venderla a spas, estéticas, barberías, clínicas, consultorios, talleres y negocios similares como sistema instalado y asistido, no como registro público autoservicio.

## Estado actual

- Frontend React + TypeScript + Vite.
- Login real con Supabase Auth.
- Roles reales: `super_admin`, `admin`, `employee`.
- El `super_admin` crea negocios y administradores desde Configuración > Negocios.
- El administrador del negocio crea empleados con correo y contraseña desde Equipo.
- No existe registro público abierto.
- WhatsApp funciona manualmente con enlaces `wa.me`.
- Reservas públicas funcionan desde `/p/:slug` y llegan a Citas > Reservaciones web.
- Mercado Pago, anticipos reales, WhatsApp automático, recordatorios automáticos, plan/facturación y suscripciones reales NO forman parte del producto actual.

## Archivos clave

- `src/App.tsx`: shell principal, sesión, navegación y handlers.
- `src/features/`: pantallas extraídas por área.
- `src/services/databaseService.ts`: conexión de datos, perfiles, negocios, CRUD normalizado y llamadas a Edge Functions.
- `src/services/whatsappService.ts`: WhatsApp manual vía `wa.me`.
- `src/pages/PublicBookingSite.tsx`: página pública de reservas.
- `src/pages/LegalPage.tsx`: términos y aviso de privacidad.
- `supabase/setup_full.sql`: instalación consolidada de BD.
- `supabase/functions/admin-manage-user/index.ts`: creación de negocios, administradores, empleados, onboarding y eliminación segura de negocios.
- `supabase/functions/public-booking/index.ts`: reservas públicas.

## Modelo de datos

La app ya lee entidades principales desde tablas normalizadas con fallback por entidad:

- `business_services`
- `business_employees`
- `business_clients`
- `business_appointments`
- `business_products`
- `business_suppliers`
- `business_cash_cuts`
- `business_sales`

`businesses.app_state` sigue existiendo como compatibilidad/espejo, pero la dirección técnica es migrar gradualmente escrituras restantes a tablas por entidad.

## Producto actual

Incluido:

- Agenda y calendario.
- Reservas públicas conectadas.
- Clientes y citas.
- Equipo/empleados.
- Servicios, productos y proveedores.
- Ventas internas.
- Estados pagado/no pagado y método de pago interno.
- Corte de caja por método.
- Estadísticas operativas.
- Exportación a Excel.
- Términos y aviso de privacidad base.

No incluido por decisión de producto:

- Mercado Pago o anticipos reales.
- WhatsApp automático con API.
- Recordatorios automáticos.
- Plan/facturación dentro de la app.
- Suscripciones reales.
- SLA/monitoreo comercial completo.
- Backups desde la app.
- Integraciones externas completas.
- Web personalizada por cliente.
- Onboarding 100% autoservicio.
- Reportes avanzados contables.

## Operación recomendada

1. El superadmin crea el negocio y su administrador.
2. El administrador entra, completa onboarding y configura horarios/servicios/precios.
3. El administrador crea empleados con cuenta de acceso.
4. Si el negocio compra reservas públicas, el superadmin activa la página `/p/:slug`.
5. El negocio atiende reservaciones web desde Citas > Reservaciones web.
6. WhatsApp se usa manualmente desde botones del sistema.
7. La operación diaria se controla desde Citas, Calendario, Ventas y Corte de caja.
