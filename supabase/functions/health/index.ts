// Jack — Health check
// Deploy: supabase functions deploy health --no-verify-jwt

// @ts-expect-error Deno runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(() => new Response(JSON.stringify({
  ok: true,
  service: "jack",
  at: new Date().toISOString()
}), {
  headers: { "Content-Type": "application/json" }
}));
