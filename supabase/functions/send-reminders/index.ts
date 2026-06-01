// Jack — Daily WhatsApp reminders
// Call this function once per day from UptimeRobot, Supabase Cron, or any scheduler.
// Required secret for public calls: REMINDER_SECRET. Send it as x-jack-cron-secret.

// @ts-expect-error — Deno runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error — Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jack-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const tomorrowISO = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

function renderMessage(vars: Record<string, string>) {
  return `Hola ${vars.clientName}. Te recordamos tu cita en ${vars.businessName} manana ${vars.date} a las ${vars.time} (${vars.serviceName}). Te esperamos.`;
}

async function sendViaTwilio(to: string, body: string) {
  // @ts-expect-error — Deno
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  // @ts-expect-error — Deno
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  // @ts-expect-error — Deno
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
  if (!sid || !token || !from) throw new Error("Twilio secrets incompletos");

  const params = new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  if (!res.ok) throw new Error(`Twilio error: ${await res.text()}`);
}

async function sendViaMeta(to: string, body: string) {
  // @ts-expect-error — Deno
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  // @ts-expect-error — Deno
  const phoneId = Deno.env.get("META_WHATSAPP_PHONE_ID");
  if (!token || !phoneId) throw new Error("Meta WhatsApp secrets incompletos");

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { body }
    })
  });
  if (!res.ok) throw new Error(`Meta WhatsApp error: ${await res.text()}`);
}

function normalizeMxPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("52")) return `+${digits}`;
  if (digits.length === 10) return `+52${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // @ts-expect-error — Deno
    const expectedSecret = Deno.env.get("REMINDER_SECRET");
    const url = new URL(req.url);
    const providedSecret = req.headers.get("x-jack-cron-secret") ?? url.searchParams.get("secret");
    // Seguridad (#9): fail closed. Antes, si REMINDER_SECRET no estaba configurado,
    // la función corría SIN protección (cualquiera con la URL podía dispararla y
    // generar costos). Ahora queda deshabilitada salvo que el secret exista.
    if (!expectedSecret) {
      return new Response(JSON.stringify({ error: "Recordatorios deshabilitados. Configura el secret REMINDER_SECRET para habilitarlos." }), {
        status: 503,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // @ts-expect-error — Deno
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // @ts-expect-error — Deno
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase service env incompleto");

    // @ts-expect-error — Deno
    const provider = Deno.env.get("WHATSAPP_PROVIDER") ?? "twilio";
    const supabase = createClient(supabaseUrl, serviceKey);
    const targetDate = tomorrowISO();

    const { data, error } = await supabase
      .from("business_appointments")
      .select(`
        id,business_id,client_id,employee_id,service_name,date,time,status,reminder_sent_at,
        businesses(name),
        business_clients(name,phone),
        business_employees(name)
      `)
      .eq("date", targetDate)
      .in("status", ["pending", "confirmed"])
      .is("deleted_at", null)
      .is("reminder_sent_at", null);

    if (error) throw error;

    const results = [];
    for (const appointment of data ?? []) {
      const client = Array.isArray(appointment.business_clients) ? appointment.business_clients[0] : appointment.business_clients;
      const business = Array.isArray(appointment.businesses) ? appointment.businesses[0] : appointment.businesses;
      const employee = Array.isArray(appointment.business_employees) ? appointment.business_employees[0] : appointment.business_employees;
      if (!client?.phone) {
        results.push({ id: appointment.id, skipped: "sin telefono" });
        continue;
      }

      const message = renderMessage({
        clientName: client.name ?? "cliente",
        businessName: business?.name ?? "el negocio",
        serviceName: appointment.service_name,
        date: appointment.date,
        time: String(appointment.time).slice(0, 5),
        employeeName: employee?.name ?? ""
      });
      const phone = normalizeMxPhone(client.phone);

      if (provider === "meta") await sendViaMeta(phone, message);
      else await sendViaTwilio(phone, message);

      await supabase
        .from("business_appointments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", appointment.id);

      results.push({ id: appointment.id, sent: true });
    }

    return new Response(JSON.stringify({ success: true, date: targetDate, count: results.length, results }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
