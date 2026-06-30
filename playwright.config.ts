import { defineConfig, devices } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════════════
// Jack — Configuración de pruebas E2E (Playwright)
// ════════════════════════════════════════════════════════════════════════════
// Dos clases de prueba, separadas a propósito:
//   · SMOKE (e2e/smoke.spec.ts): no requieren credenciales ni Supabase. Verifican
//     que la app monta: login visible y páginas legales. Corren siempre.
//   · FLUJOS (e2e/flows.spec.ts): login real → crear cita → marcar pagado. Se
//     SALTAN automáticamente si no hay JACK_E2E_EMAIL / JACK_E2E_PASSWORD (la app
//     necesita un Supabase real con esas credenciales).
//
// El webServer arranca `npm run dev` y reusa uno ya corriendo en local.
// ════════════════════════════════════════════════════════════════════════════

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
