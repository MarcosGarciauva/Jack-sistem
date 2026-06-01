// ════════════════════════════════════════════════════════════════════════════
// Jack — Edge Function: Enviar notificación por WhatsApp
// ════════════════════════════════════════════════════════════════════════════
// Triggers desde el frontend cuando:
//   - Se crea una cita (kind: "appointment_created")
//   - Recordatorio 24h antes (cron job futuro)
//   - Cita cancelada (kind: "appointment_cancelled")
//
// Provider soportados:
//   - Twilio WhatsApp API (set WHATSAPP_PROVIDER=twilio)
//   - WhatsApp Cloud API (Meta, set WHATSAPP_PROVIDER=meta)
//
// Deploy: supabase functions deploy send-whatsapp
// Secrets:
//   supabase secrets set WHATSAPP_PROVIDER=twilio
//   supabase secrets set TWILIO_ACCOUNT_SID=AC...
//   supabase secrets set TWILIO_AUTH_TOKEN=...
//   supabase secrets set TWILIO_WHATSAPP_FROM=+14155238886  # número sandbox o producción
//   # — o si usas Meta:
//   supabase secrets set META_WHATSAPP_TOKEN=EAAB...
//   supabase secrets set META_WHATSAPP_PHONE_ID=123456789
// ════════════════════════════════════════════════════════════════════════════

// @ts-expect-error — Deno runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jack-automation-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// ── Seguridad (#9) ────────────────────────────────────────────────────────────
// El WhatsApp automático (Twilio/Meta) NO es el flujo principal del producto: el
// flujo vivo usa `wa.me` manual desde el frontend. Esta función queda DESHABILITADA
// por defecto (fail closed) y solo responde si existe un token fuerte en el entorno
// y el llamante lo presenta. Así evitamos abuso/costos si algún día se configuran
// secrets de Twilio/Meta sin querer dejarla abierta al público.
function checkAutomationGuard(req: Request): Response | null {
  // @ts-expect-error — Deno
  const expected = Deno.env.get("JACK_AUTOMATION_TOKEN");
  const provided = req.headers.get("x-jack-automation-token");
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "WhatsApp automático deshabilitado. Configura el secret JACK_AUTOMATION_TOKEN para habilitarlo." }),
      { status: 503, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
  if (provided !== expected) {
    return new Response(
      JSON.stringify({ error: "No autorizado" }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
  return null;
}

type Kind = "appointment_created" | "appointment_reminder" | "appointment_cancelled" | "custom";

interface SendBody {
  to: string;                     // E.164: "+5215512345678"
  kind: Kind;
  /** Variables interpoladas en la plantilla */
  vars: {
    clientName?: string;
    businessName?: string;
    serviceName?: string;
    date?: string;
    time?: string;
    employeeName?: string;
    [key: string]: string | undefined;
  };
  /** Si kind="custom", se usa este mensaje directamente */
  customMessage?: string;
}

const TEMPLATES: Record<Exclude<Kind, "custom">, string> = {
  appointment_created:
    "Hola {clientName} 👋\n\nTu cita en *{businessName}* fue agendada:\n\n• {serviceName}\n• {date} a las {time}\n• Atiende: {employeeName}\n\nResponde *CONFIRMAR* para confirmar o *CANCELAR* si no podrás asistir.",
  appointment_reminder:
    "Hola {clientName} 👋 Te recordamos tu cita en *{businessName}* mañana {date} a las {time} ({serviceName}). Te esperamos.",
  appointment_cancelled:
    "Hola {clientName}, tu cita en *{businessName}* del {date} a las {time} fue cancelada. Si quieres reagendar, contáctanos."
};

function renderMessage(kind: Kind, vars: SendBody["vars"], custom?: string): string {
  if (kind === "custom") return custom ?? "";
  const tpl = TEMPLATES[kind];
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

async function sendViaTwilio(to: string, body: string) {
  // @ts-expect-error — Deno
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  // @ts-expect-error — Deno
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  // @ts-expect-error — Deno
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM")!;

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${from}`,
    Body: body
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    }
  );
  if (!res.ok) throw new Error(`Twilio error: ${await res.text()}`);
  return await res.json();
}

async function sendViaMeta(to: string, body: string) {
  // @ts-expect-error — Deno
  const token = Deno.env.get("META_WHATSAPP_TOKEN")!;
  // @ts-expect-error — Deno
  const phoneId = Deno.env.get("META_WHATSAPP_PHONE_ID")!;
  const cleanTo = to.replace(/^\+/, "");

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "text",
        text: { body }
      })
    }
  );
  if (!res.ok) throw new Error(`Meta WhatsApp error: ${await res.text()}`);
  return await res.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const blocked = checkAutomationGuard(req);
  if (blocked) return blocked;

  try {
    // @ts-expect-error — Deno
    const provider = Deno.env.get("WHATSAPP_PROVIDER") ?? "twilio";
    const body = (await req.json()) as SendBody;

    if (!body.to || !body.kind) {
      return new Response(JSON.stringify({ error: "to y kind son requeridos" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const message = renderMessage(body.kind, body.vars ?? {}, body.customMessage);
    if (!message) {
      return new Response(JSON.stringify({ error: "mensaje vacío" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    let result;
    if (provider === "meta") {
      result = await sendViaMeta(body.to, message);
    } else {
      result = await sendViaTwilio(body.to, message);
    }

    return new Response(
      JSON.stringify({ success: true, provider, result }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
