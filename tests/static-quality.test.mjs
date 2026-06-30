import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("PaymentStatus is intentionally simple", () => {
  const types = read("src/types/index.ts");
  assert.match(types, /export type PaymentStatus = "none" \| "paid";/);
  assert.doesNotMatch(types, /deposit_paid|refunded|failed/);
});

test("Dashboard y Estadísticas usan la MISMA semana (lunes–domingo)", () => {
  const calc = read("src/lib/calculations.ts");
  // El dashboard calcula la semana como lunes–domingo (getDay() || 7).
  assert.match(calc, /getDay\(\)\s*\|\|\s*7/);
  const stats = read("src/features/stats/StatsManager.tsx");
  // Estadísticas debe usar la misma semana calendario, NO una ventana móvil de 7 días.
  assert.match(stats, /getDay\(\)\s*\|\|\s*7/);
  assert.doesNotMatch(stats, /setDate\(today\.getDate\(\) - 6\)/);
});

test("Mercado Pago frontend and edge functions were removed", () => {
  assert.equal(existsSync(new URL("../src/services/mercadoPagoService.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../supabase/functions/mercadopago-create-preference/index.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../supabase/functions/mercadopago-webhook/index.ts", import.meta.url)), false);
});

test("Web reservations live as a subsection inside Citas (P2)", () => {
  const app = read("src/App.tsx");
  // "Reservaciones web" ya no es una sección de nivel superior: es una pestaña.
  assert.match(app, /appointmentsTab/);
  assert.match(app, /Reservaciones web/);
  assert.match(app, /WebReservationsView/);
  // La sección de nivel superior fue eliminada del tipo Section.
  assert.doesNotMatch(app, /"dashboard" \| "calendar" \| "appointments" \| "reservations"/);
});

test("Accepting a web reservation turns it into a normal pending appointment", () => {
  const app = read("src/App.tsx");
  assert.match(app, /acceptsWebReservation/);
  assert.match(app, /source: "dashboard", status: "pending"/);
  assert.match(app, /Reserva aceptada como cita pendiente/);
  // Los estados visibles (incluido "Aceptar como cita") viven en el helper compartido.
  const ui = read("src/lib/appointmentUi.ts");
  assert.match(ui, /Aceptar como cita/);
});

test("WhatsApp button only contacts; confirmation is manual (P3, revisado)", () => {
  const app = read("src/App.tsx");
  const modal = read("src/features/appointments/AppointmentDetailModal.tsx");
  // El botón de WhatsApp SOLO contacta (abre wa.me). NO confirma la cita por sí solo.
  assert.match(modal, /Contactar por WhatsApp/);
  // Se eliminó el flujo que confirmaba automáticamente al avisar por WhatsApp.
  for (const file of [app, modal]) {
    assert.doesNotMatch(file, /confirmReservationWhatsApp/);
    assert.doesNotMatch(file, /onConfirmWhatsApp/);
    assert.doesNotMatch(file, /Confirmar y avisar por WhatsApp/);
  }
  // La confirmación sigue siendo posible, pero MANUAL, vía el cambio de estado.
  assert.match(app, /updateAppointmentStatus/);
});

test("Appointment actions live in a centered detail modal, not the table (P4/P6)", () => {
  const app = read("src/App.tsx");
  // El detalle de cita usa el modal centrado j-modal (no un drawer lateral).
  assert.match(app, /AppointmentDetailModal/);
  const modal = read("src/features/appointments/AppointmentDetailModal.tsx");
  assert.match(modal, /j-modal-scrim/);
  // El filtro por origen se eliminó y se agregó ordenamiento (P5).
  assert.doesNotMatch(app, /Todos los orígenes/);
  assert.match(app, /Más recientes/);
});

test("Cash cut captures payment methods and a withdrawal step (P7)", () => {
  const cash = read("src/features/cash/CashManager.tsx");
  assert.match(cash, /Tarjeta de crédito/);
  assert.match(cash, /Tarjeta de débito/);
  assert.match(cash, /Transferencia/);
  assert.match(cash, /Total recibido/);
  assert.match(cash, /Monto a retirar/);
  assert.match(cash, /Efectivo restante/);
  // El fondo inicial se eliminó de la captura (P7).
  assert.doesNotMatch(cash, /Fondo inicial de caja/);
});

test("Cash cut v2: conteo verificado por método + ventas de productos integradas", () => {
  const cash = read("src/features/cash/CashManager.tsx");
  // El corte calcula el ESPERADO por método (citas con método + ventas del día)
  // y el usuario solo teclea lo contado; ya no es captura a ciegas.
  assert.match(cash, /expectedBy/);
  assert.match(cash, /daySales/);
  assert.match(cash, /salesTotal/);
  assert.match(cash, /Sin método registrado/);
  // El historial abre detalle por corte y elimina sin confirm() nativo.
  assert.match(cash, /detailCut/);
  assert.doesNotMatch(cash, /\bconfirm\(/);

  // Al marcar "Pagado" se elige el método (un tap extra); el botón NO marca solo.
  const modal = read("src/features/appointments/AppointmentDetailModal.tsx");
  assert.match(modal, /¿Cómo pagó el cliente\?/);
  assert.match(modal, /PAY_METHOD_LABELS/);

  // El método persiste en la tabla normalizada y las ventas sobreviven al loader.
  const service = read("src/services/databaseService.ts");
  assert.match(service, /payment_method/);
  assert.match(service, /business_sales/);

  // El tipo existe y es el MISMO de Ventas (no inventar otro enum de métodos).
  const types = read("src/types/index.ts");
  assert.match(types, /paymentMethod\?: SalePaymentMethod/);
});

test("Ventas por fila (#1/#2) y dashboard con ventas incluidas (#3)", () => {
  // La venta se inserta POR FILA (los empleados no pueden escribir el JSON
  // completo de businesses); el stock se actualiza por producto.
  const service = read("src/services/databaseService.ts");
  assert.match(service, /insertSale/);
  assert.match(service, /updateProductStock/);
  assert.match(service, /upsertCashCut/);
  assert.match(service, /upsertSupplier/);
  assert.match(service, /upsertProduct/);

  const app = read("src/App.tsx");
  assert.match(app, /persistSaleRow/);
  // Catálogo/proveedores/caja ya NO guardan vía saveBusinessState (JSON completo):
  // usan applyWithStateMirror (definición + 3 secciones = 4 menciones mínimo).
  // SettingsEditorial SÍ conserva setBusiness por diseño (config vive en app_state).
  assert.ok((app.match(/applyWithStateMirror/g) ?? []).length >= 4, "catálogo/proveedores/caja deben usar applyWithStateMirror");
  assert.equal((app.match(/setState=\{setBusiness\}/g) ?? []).length, 1, "solo SettingsEditorial debe guardar app_state completo");

  const sales = read("src/features/sales/ProductSalesView.tsx");
  assert.match(sales, /onRegisterSale/);

  // El dashboard suma ventas de productos en sus KPIs de ingresos.
  const dash = read("src/features/dashboard/Dashboard.tsx");
  assert.match(dash, /salesForDay/);
  assert.match(dash, /salesForCurrentWeek/);
  assert.match(dash, /salesForMonth/);
});

test("Estadísticas v2: ventas integradas, toggle Línea/Barras y comparativa", () => {
  const stats = read("src/features/stats/StatsManager.tsx");
  // Las ventas de productos entran a ingresos/margen/serie y hay top de productos.
  assert.match(stats, /state\.sales/);
  assert.match(stats, /Top de productos/);
  assert.match(stats, /salesRevenue/);
  // Toggle Línea/Barras y línea punteada del periodo anterior.
  assert.match(stats, /chartType/);
  assert.match(stats, /anterior/);
  // Sin "+100%" engañoso cuando no hay periodo anterior.
  assert.match(stats, /isNewPeriod/);

  // La gráfica formatea moneda con los helpers centralizados (no números crudos).
  const charts = read("src/components/Charts.tsx");
  assert.match(charts, /formatCurrency/);
  assert.match(charts, /formatCurrencyShort/);
  assert.match(charts, /anterior/);
  assert.doesNotMatch(charts, /\[`\$\$\{value\}`/);
});

test("Calendario v2: preview en celdas, leyenda completa y cita desde el día", () => {
  const cal = read("src/features/calendar/CalendarView.tsx");
  // Celdas del mes con mini-preview de citas (hora + nombre) en escritorio.
  assert.match(cal, /j-cal-mpre/);
  // La leyenda cubre los tres estados que el punto puede señalar.
  assert.match(cal, /Confirmada/);
  assert.match(cal, /Pendiente/);
  assert.match(cal, /Cancelada/);
  // Crear cita desde el día seleccionado con fecha precargada.
  assert.match(cal, /onNewAppointment\(selectedDay\)/);
  assert.match(read("src/App.tsx"), /\.\.\.emptyAppointment\(\), date/);

  const css = read("src/styles.css");
  assert.match(css, /\.j-cal-mpre/);
});

test("Main sections export Excel through the shared helper", () => {
  assert.equal(existsSync(new URL("../src/lib/excelExport.ts", import.meta.url)), true);
  const helper = read("src/lib/excelExport.ts");
  assert.match(helper, /\.xlsx/);
  assert.match(helper, /openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(helper, /buildZip/);
  assert.match(helper, /styles\.xml/);
  assert.match(helper, /columnWidthsXml/);
  assert.match(helper, /autoFilter/);
  assert.match(helper, /state="frozen"/);
  assert.doesNotMatch(helper, /<html|vnd\.ms-excel|\.xls"/);
  const files = [
    "src/App.tsx",
    "src/features/reservations/WebReservationsView.tsx",
    "src/features/catalog/CatalogManager.tsx",
    "src/features/suppliers/SuppliersManager.tsx",
    "src/features/employees/EmployeesManager.tsx",
    "src/features/cash/CashManager.tsx",
    "src/features/stats/StatsManager.tsx",
    "src/features/settings/SettingsEditorial.tsx"
  ];
  for (const file of files) assert.match(read(file), /downloadExcel/);
  assert.doesNotMatch(read("src/App.tsx"), /text\/csv|exportCsv|CSV exportado/);
  assert.doesNotMatch(files.map(read).join("\n"), /> Excel|Excel historial/);
});

test("Normalized tables are used by the app service", () => {
  const service = read("src/services/databaseService.ts");
  assert.match(service, /business_services/);
  assert.match(service, /business_appointments/);
  assert.match(service, /mirrorNormalizedState/);
});

test("Monitoring health function exists", () => {
  assert.equal(existsSync(new URL("../supabase/functions/health/index.ts", import.meta.url)), true);
});

test("WhatsApp primary flow is manual wa.me, not API sending", () => {
  const service = read("src/services/whatsappService.ts");
  assert.match(service, /https:\/\/wa\.me\//);
  assert.match(service, /normalizeMexicoWaNumber/);
  assert.match(service, /digits\.startsWith\("521"\)/);
  assert.match(service, /digits\.length === 10/);
  assert.match(service, /window\.open/);
  assert.doesNotMatch(service, /functions\.invoke\("send-whatsapp"/);
  assert.equal(existsSync(new URL("../supabase/functions/send-whatsapp/index.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../supabase/functions/send-reminders/index.ts", import.meta.url)), false);
});


test("Settings only exposes active product sections", () => {
  const settings = read("src/features/settings/SettingsEditorial.tsx");
  assert.match(settings, /Reservas públicas/);
  assert.match(settings, /Negocios/);
  assert.doesNotMatch(settings, /Plan & facturación/);
  assert.doesNotMatch(settings, /function SettingsPlan/);
  assert.doesNotMatch(settings, /function SettingsIntegrations/);
  assert.doesNotMatch(settings, /Notificaciones/);
});


test("Super admin can safely delete businesses through the admin edge function", () => {
  const adminPanel = read("src/features/admin/SettingsBusinessesAdmin.tsx");
  const service = read("src/services/databaseService.ts");
  const edge = read("supabase/functions/admin-manage-user/index.ts");
  assert.match(adminPanel, /deleteBusiness/);
  assert.match(adminPanel, /Negocio eliminado de forma segura/);
  assert.match(service, /delete_business/);
  assert.match(edge, /action === "delete_business"/);
  assert.match(edge, /active: false/);
  assert.match(edge, /public_site_enabled: false/);
});
