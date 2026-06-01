# Jack - Estado actual del proyecto

Jack es una aplicacion web para negocios de servicios que trabajan con citas. El objetivo es venderla a spas, esteticas, barberias, clinicas, consultorios, talleres y negocios similares.

## Estado actual

La app ya no usa cuentas falsas ni almacenamiento local para iniciar sesion. El acceso ahora esta pensado para funcionar con Supabase Auth.

El flujo correcto es:

1. Crear el usuario en Supabase Authentication.
2. Ejecutar `supabase/schema.sql`.
3. Ejecutar `supabase/create_admin_profile.sql` cambiando el UUID y correo del usuario.
4. Entrar a Jack con correo y contrasena desde la pantalla de login.

No existe registro publico. Solo usuarios creados desde Supabase o por un panel interno futuro pueden entrar.

## Archivos clave

- `src/App.tsx`: interfaz principal, login, dashboard, clientes, citas, calendario, empleados, estadisticas y configuracion.
- `src/services/supabaseClient.ts`: conexion con Supabase usando variables de entorno.
- `src/services/databaseService.ts`: carga perfil, carga negocio y guarda cambios del negocio.
- `supabase/schema.sql`: tablas y policies de produccion.
- `supabase/create_admin_profile.sql`: script para vincular el primer usuario administrador.
- `public/assets/jack-logo.png`: logo del sistema.

## Modelo de datos actual

La tabla `businesses` guarda el estado operativo del negocio en `app_state` como JSON:

- Configuracion del negocio.
- Clientes.
- Empleados.
- Citas.
- Servicios.
- Horarios.

La tabla `profiles` vincula usuarios de Supabase Auth con Jack:

- `id`: mismo UUID del usuario en `auth.users`.
- `email`.
- `full_name`.
- `role`: `super_admin`, `admin` o `employee`.
- `business_id`.
- `employee_id`.
- `active`.

La tabla `payments` queda lista para Mercado Pago.

## Importante

- No poner access tokens privados en frontend.
- Mercado Pago debe implementarse con backend o edge functions.
- Los anticipos de clientes finales deben ir a la cuenta del negocio, no a la cuenta del proveedor de Jack.
- Los empleados pueden crear citas.
- Solo admin puede eliminar citas y modificar configuracion del negocio.

## Pendientes recomendados

1. Ejecutar SQL en Supabase.
2. Crear tu usuario Auth.
3. Vincular tu UUID con `create_admin_profile.sql`.
4. Probar login real.
5. Crear flujo para alta de empleados reales.
6. Crear ruta publica de reservas para cada negocio.
7. Agregar Edge Function para Mercado Pago.
