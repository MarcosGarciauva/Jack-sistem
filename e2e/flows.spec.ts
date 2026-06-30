import { expect, test } from "@playwright/test";

// ── Flujos con credenciales reales ────────────────────────────────────────────
// Requieren un Supabase real y una cuenta de prueba. Se SALTAN si no están las
// variables de entorno (así el smoke sigue corriendo en cualquier entorno):
//
//   JACK_E2E_EMAIL=...  JACK_E2E_PASSWORD=...  npm run test:e2e
//
// El dev server debe arrancar con el mismo .env.local que apunta a ese Supabase
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).

const email = process.env.JACK_E2E_EMAIL;
const password = process.env.JACK_E2E_PASSWORD;

test.describe("flujos autenticados", () => {
  test.skip(!email || !password, "Define JACK_E2E_EMAIL y JACK_E2E_PASSWORD para correr estos flujos.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("tu@correo.com").fill(email!);
    await page.getByPlaceholder("••••••••").fill(password!);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    // El dashboard montó cuando aparece la marca del sidebar y un KPI.
    await expect(page.getByText("Ingresos de hoy")).toBeVisible({ timeout: 15_000 });
  });

  test("login carga el dashboard con KPIs", async ({ page }) => {
    await expect(page.getByText("Total de citas")).toBeVisible();
    await expect(page.getByText("Ingresos del mes")).toBeVisible();
  });

  test("abrir 'Nueva cita' muestra el formulario de alta", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva cita" }).first().click();
    // Paso 1 del wizard de alta.
    await expect(page.getByText("¿Para qué cliente?")).toBeVisible();
    // Cerrar sin guardar (Esc) deja el dashboard intacto.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Ingresos de hoy")).toBeVisible();
  });

  test("navegar a Agenda muestra las pestañas Citas / Ventas / Reservaciones web", async ({ page }) => {
    await page.getByRole("button", { name: "Agenda" }).click();
    await expect(page.getByRole("button", { name: "Ventas" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reservaciones web/ })).toBeVisible();
  });
});
