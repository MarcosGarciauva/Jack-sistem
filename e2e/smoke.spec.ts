import { expect, test } from "@playwright/test";

// ── Smoke: la app monta sin credenciales ─────────────────────────────────────
// No requieren Supabase: el login se renderiza igual (con o sin sesión) y las
// páginas legales son públicas. Si esto falla, el build está roto.

test("la raíz muestra la pantalla de acceso", async ({ page }) => {
  await page.goto("/");
  // El login editorial siempre se ve cuando no hay sesión.
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByPlaceholder("tu@correo.com")).toBeVisible();
});

test("términos de servicio carga en /terminos", async ({ page }) => {
  await page.goto("/terminos");
  await expect(page.getByRole("heading", { name: "Términos de servicio" })).toBeVisible();
  await expect(page.getByText("Última actualización:")).toBeVisible();
});

test("aviso de privacidad carga en /privacidad", async ({ page }) => {
  await page.goto("/privacidad");
  await expect(page.getByRole("heading", { name: "Aviso de privacidad" })).toBeVisible();
  await expect(page.getByText("Derechos ARCO")).toBeVisible();
});

test("el login enlaza a términos y privacidad", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Términos" }).click();
  await expect(page.getByRole("heading", { name: "Términos de servicio" })).toBeVisible();
});
