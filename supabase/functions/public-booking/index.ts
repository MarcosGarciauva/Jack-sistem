// ════════════════════════════════════════════════════════════════════════════
// Jack — Edge Function: Reserva desde el sitio público
// ════════════════════════════════════════════════════════════════════════════
// El visitante del sitio público crea una cita. Como el app_state vive en JSONB
// y no podemos darle al rol `anon` permiso de UPDATE arbitrario, esto pasa por
// esta función que valida y appendea de forma segura.
//
// Endurecimiento (auditoría #8, lote acotado):
//   - Solo POST; tamaño de payload acotado.
//   - Validación fuerte de entrada: fecha (no pasada / no muy futura), hora HH:MM,
//     nombre, teléfono (solo dígitos, 10–15), email opcional, notas con tope.
//   - AUTORIDAD DEL SERVIDOR: precio, duración, depósito, estado, pago, origen,
//     ids y createdAt se fijan en backend. Nunca se confía en lo que envía el
//     cliente para esos campos (anti-tampering).
//   - Anti-spam SIN tablas nuevas: throttle por IP en memoria + tope de ráfaga por
//     negocio (usando createdAt que ahora controla el servidor) + bloqueo de
//     reserva duplicada (mismo teléfono, misma fecha/hora) + honeypot opcional.
// NOTA: este lote NO migra la escritura a tablas normalizadas (eso es #2/#6, que se
// hará con respaldo). Se conserva el flujo actual sobre `app_state` + el espejo.
//
// Deploy: supabase functions deploy public-booking --no-verify-jwt
// ════════════════════════════════════════════════════════════════════════════

// @ts-expect-error — Deno
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error — Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// ── Límites y ventanas ──────────────────────────────────────────────────────
const MAX_BODY_BYTES = 8 * 1024;      // 8 KB: una reserva no necesita más.
const NAME_MIN = 2;
const NAME_MAX = 80;
const NOTES_MAX = 500;
const EMAIL_MAX = 120;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;
const MAX_DAYS_AHEAD = 180;            // No aceptar reservas a más de ~6 meses.
const IP_WINDOW_MS = 60_000;           // Ventana del throttle por IP.
const IP_MAX_HITS = 8;                 // Máx. peticiones por IP en la ventana.
const BUSINESS_BURST_WINDOW_MS = 10 * 60_000; // 10 min.
const BUSINESS_BURST_MAX = 6;          // Máx. reservas públicas por negocio en esa ventana.

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const appointmentOverlaps = (startA: string, durationA: number, startB: string, durationB: number) => {
  const a = toMinutes(startA);
  const b = toMinutes(startB);
  return a < b + durationB && b < a + durationA;
};

// ── Validadores ────────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && ymd(d) === date;
}

/** Solo dígitos. Conserva la regla histórica de WhatsApp (MX 52 / US 1). */
function normalizePhone(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

function sanitizeText(raw: string | undefined, max: number): string {
  if (!raw) return "";
  // Quita caracteres de control y recorta.
  return raw.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

// ── Throttle por IP (best-effort, por instancia) ─────────────────────────────
// No persiste entre cold starts ni entre instancias, pero corta ráfagas obvias
// de un mismo origen sin necesidad de tablas. El tope real anti-abuso es el de
// negocio (más abajo), que sí usa datos persistidos.
const ipHits = new Map<string, number[]>();
function ipThrottled(ip: string): boolean {
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 5000) {
    for (const [key, times] of ipHits) {
      if (times.every((t) => now - t >= IP_WINDOW_MS)) ipHits.delete(key);
    }
  }
  return recent.length > IP_MAX_HITS;
}

interface ClientRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  requestedService?: string;
  amount?: number;
  appointmentDate?: string;
  appointmentTime?: string;
  status?: string;
  assignedEmployeeId?: string;
  notes?: string | null;
}

interface AppointmentRow {
  id: string;
  clientId: string;
  service: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  employeeId: string;
  status: string;
  paymentStatus: string;
  depositAmount: number;
  paidAmount: number;
  source: string;
  createdAt: string;
  notes?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    if (ipThrottled(ip)) {
      return json(429, { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." });
    }

    // Tamaño de payload acotado (anti-abuso): leemos como texto y validamos bytes.
    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return json(413, { error: "Solicitud demasiado grande" });
    }

    let body: {
      businessId?: string;
      appointment?: Partial<AppointmentRow>;
      newClient?: Partial<ClientRow>;
      hp?: string; // honeypot opcional
    };
    try {
      body = JSON.parse(rawText);
    } catch {
      return json(400, { error: "JSON inválido" });
    }

    // Honeypot: los bots suelen rellenar campos ocultos. Si viene con contenido,
    // respondemos 200 "ok" falso (sin escribir) para no darles señal.
    if (typeof body.hp === "string" && body.hp.trim().length > 0) {
      return json(200, { success: true, appointmentId: "ok" });
    }

    const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
    const apptIn = body.appointment ?? {};
    const clientIn = body.newClient ?? {};

    if (!businessId || businessId.length > 64 || !apptIn || !clientIn) {
      return json(400, { error: "Datos incompletos" });
    }

    // ── Validación fuerte de entrada del visitante ────────────────────────────
    const name = sanitizeText(clientIn.name, NAME_MAX);
    if (name.length < NAME_MIN) return json(400, { error: "Nombre inválido" });

    const phone = normalizePhone(clientIn.phone ?? "");
    if (phone.length < PHONE_MIN_DIGITS || phone.length > PHONE_MAX_DIGITS) {
      return json(400, { error: "Teléfono inválido" });
    }

    let email: string | null = null;
    if (clientIn.email && String(clientIn.email).trim().length > 0) {
      const e = String(clientIn.email).trim().slice(0, EMAIL_MAX);
      if (!EMAIL_RE.test(e)) return json(400, { error: "Correo inválido" });
      email = e;
    }

    const notes = sanitizeText(apptIn.notes ?? clientIn.notes ?? "", NOTES_MAX);

    const serviceName = sanitizeText(apptIn.service, 120);
    const employeeId = typeof apptIn.employeeId === "string" ? apptIn.employeeId.trim() : "";
    const date = typeof apptIn.date === "string" ? apptIn.date.trim() : "";
    const time = typeof apptIn.time === "string" ? apptIn.time.trim() : "";

    if (!serviceName || !employeeId) return json(400, { error: "Servicio o empleado faltante" });
    if (!isValidDate(date)) return json(400, { error: "Fecha inválida" });
    if (!TIME_RE.test(time)) return json(400, { error: "Hora inválida" });

    // Fecha no pasada (con 1 día de tolerancia por zona horaria) ni muy futura.
    const now = new Date();
    const minDate = ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const maxDate = ymd(new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000));
    if (date < minDate) return json(400, { error: "No se puede reservar en una fecha pasada" });
    if (date > maxDate) return json(400, { error: "Fecha demasiado lejana" });

    // ── 1. Cargar negocio: activo + sitio público activo ─────────────────────
    const supabaseUrl = (globalThis as any).Deno?.env?.get("SUPABASE_URL");
    const serviceKey = (globalThis as any).Deno?.env?.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, app_state, active, public_site_enabled")
      .eq("id", businessId)
      .maybeSingle();

    if (bizErr || !biz || !biz.active || !biz.public_site_enabled) {
      return json(404, { error: "Negocio no acepta reservas públicas" });
    }

    const state = biz.app_state as {
      appointments: AppointmentRow[];
      clients: ClientRow[];
      config: {
        services: { name: string; basePrice: number; duration: number; depositAmount?: number }[];
        businessHours?: { day: number; enabled: boolean; open: string; close: string }[];
      };
      employees: { id: string; status?: string }[];
    };
    const appointments = Array.isArray(state.appointments) ? state.appointments : [];
    const clients = Array.isArray(state.clients) ? state.clients : [];

    // ── 2. Servicio válido; precio/duración/depósito DESDE catálogo ───────────
    const service = (state.config?.services ?? []).find((s) => s.name === serviceName);
    if (!service) return json(400, { error: "Servicio no existe" });

    // ── 3. Empleado válido y activo ───────────────────────────────────────────
    const employee = (state.employees ?? []).find((e) => e.id === employeeId);
    if (!employee || employee.status === "inactive") {
      return json(400, { error: "Empleado no disponible" });
    }

    // ── 4. Horario de atención ────────────────────────────────────────────────
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const hours = state.config.businessHours?.find((item) => item.day === day);
    const start = toMinutes(time);
    const end = start + service.duration;
    if (!hours?.enabled || start < toMinutes(hours.open) || end > toMinutes(hours.close)) {
      return json(400, { error: "Horario fuera de atención" });
    }

    // ── 5. Tope de ráfaga por negocio (anti-spam, usa datos persistidos) ──────
    const burstFrom = now.getTime() - BUSINESS_BURST_WINDOW_MS;
    const recentPublic = appointments.filter((a) => {
      if (a.source !== "public_site") return false;
      const t = Date.parse(a.createdAt ?? "");
      return Number.isFinite(t) && t >= burstFrom;
    });
    if (recentPublic.length >= BUSINESS_BURST_MAX) {
      return json(429, { error: "Estamos recibiendo muchas reservas. Intenta en unos minutos." });
    }

    // ── 6. Reserva duplicada (mismo teléfono, misma fecha/hora) ───────────────
    const sameClientIds = new Set(
      clients.filter((c) => normalizePhone(c.phone ?? "") === phone).map((c) => c.id)
    );
    const duplicate = appointments.find(
      (a) =>
        a.date === date &&
        a.time === time &&
        a.status !== "cancelled" &&
        sameClientIds.has(a.clientId)
    );
    if (duplicate) {
      return json(409, { error: "Ya tienes una reserva en ese horario" });
    }

    // ── 7. Anti doble booking con duración real ───────────────────────────────
    const conflict = appointments.find(
      (a) =>
        a.date === date &&
        a.employeeId === employeeId &&
        a.status !== "cancelled" &&
        appointmentOverlaps(time, service.duration, a.time, a.duration)
    );
    if (conflict) {
      return json(409, { error: "Ese horario acaba de ocuparse" });
    }

    // ── 7b. Doble booking contra la TABLA normalizada (#1) ────────────────────
    // Las citas que el dashboard/empleado escriben directo a business_appointments
    // pueden NO estar en el app_state (que es espejo best-effort). Verificamos también
    // contra la tabla (fuente de verdad) para no sobre-agendar. Tolerante: si la tabla
    // no existe, se omite y queda la verificación por app_state de arriba.
    try {
      const { data: rows, error: rowsErr } = await supabase
        .from("business_appointments")
        .select("time, duration_minutes, status")
        .eq("business_id", businessId)
        .eq("employee_id", employeeId)
        .eq("date", date)
        .is("deleted_at", null)
        .neq("status", "cancelled");
      if (!rowsErr && Array.isArray(rows)) {
        const tableConflict = rows.some((r) =>
          appointmentOverlaps(time, service.duration, String(r.time).slice(0, 5), Number(r.duration_minutes ?? 60))
        );
        if (tableConflict) {
          return json(409, { error: "Ese horario acaba de ocuparse" });
        }
      }
    } catch (_overlapErr) {
      // best-effort: si la consulta falla, queda la verificación por app_state.
    }

    // ── 8. Construcción del registro CON AUTORIDAD DEL SERVIDOR ────────────────
    // Se ignora todo lo que el cliente mande para campos sensibles: ids, precio,
    // duración, depósito, estado, pago y createdAt los fija el backend.
    const createdAt = now.toISOString();
    const clientId = `cli-${crypto.randomUUID()}`;
    const appointmentId = `apt-${crypto.randomUUID()}`;
    const price = service.basePrice;
    const duration = service.duration;
    const depositAmount = typeof service.depositAmount === "number" ? service.depositAmount : 0;

    const safeClient: ClientRow = {
      id: clientId,
      name,
      phone,
      email,
      requestedService: serviceName,
      amount: price,
      appointmentDate: date,
      appointmentTime: time,
      status: "pending",
      assignedEmployeeId: employeeId,
      notes: notes || null
    };

    const safeAppointment: AppointmentRow = {
      id: appointmentId,
      clientId,
      service: serviceName,
      date,
      time,
      duration,
      price,
      employeeId,
      status: "pending",
      paymentStatus: "none",
      depositAmount,
      paidAmount: 0,
      source: "public_site",
      createdAt,
      notes: notes || undefined
    };

    // ── 9. Appendear a app_state ──────────────────────────────────────────────
    const newState = {
      ...state,
      clients: [safeClient, ...clients],
      appointments: [safeAppointment, ...appointments]
    };

    const { error: updErr } = await supabase
      .from("businesses")
      .update({ app_state: newState, updated_at: createdAt })
      .eq("id", businessId);

    if (updErr) return json(500, { error: updErr.message });

    // Espejo a tablas normalizadas (comportamiento existente; no se amplía aquí).
    await supabase.from("business_clients").upsert({
      id: clientId,
      business_id: businessId,
      name,
      phone,
      email,
      notes: notes || null
    });

    await supabase.from("business_appointments").upsert({
      id: appointmentId,
      business_id: businessId,
      client_id: clientId,
      employee_id: employeeId,
      service_name: serviceName,
      date,
      time,
      duration_minutes: duration,
      price,
      status: "pending",
      payment_status: "none",
      paid_amount: 0,
      source: "public_site",
      notes: notes || null,
      created_at: createdAt
    });

    return json(200, { success: true, appointmentId });
  } catch (err) {
    return json(500, { error: String(err) });
  }
});
