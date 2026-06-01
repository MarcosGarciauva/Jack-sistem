import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // @sentry/react se carga dinámicamente solo si VITE_SENTRY_DSN existe.
      // Es opcional: márcalo como external para que Vite no intente bundlearlo
      // cuando el paquete no esté instalado.
      external: ["@sentry/react"]
    }
  }
});
