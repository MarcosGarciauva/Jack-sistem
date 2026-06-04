import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("PaymentStatus is intentionally simple", () => {
  const types = read("src/types/index.ts");
  assert.match(types, /export type PaymentStatus = "none" \| "paid";/);
  assert.doesNotMatch(types, /deposit_paid|refunded|failed/);
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

test("WhatsApp button only contacts; confirmation is manual (P3, revisado)", () => {
  const app = read("src/App.tsx");
  // El botón de WhatsApp SOLO contacta (abre wa.me). NO confirma la cita por sí solo.
  assert.match(app, /Contactar por WhatsApp/);
  // Se eliminó el flujo que confirmaba automáticamente al avisar por WhatsApp.
  assert.doesNotMatch(app, /confirmReservationWhatsApp/);
  assert.doesNotMatch(app, /onConfirmWhatsApp/);
  assert.doesNotMatch(app, /Confirmar y avisar por WhatsApp/);
  // La confirmación sigue siendo posible, pero MANUAL, vía el cambio de estado.
  assert.match(app, /updateAppointmentStatus/);
});

test("Appointment actions live in a centered detail modal, not the table (P4/P6)", () => {
  const app = read("src/App.tsx");
  // El detalle de cita usa el modal centrado j-modal (no un drawer lateral).
  assert.match(app, /AppointmentDetailModal/);
  assert.match(app, /j-modal-scrim/);
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
});
