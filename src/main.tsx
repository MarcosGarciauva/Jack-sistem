import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// ─── Error tracking (Sentry) — opcional ───────────────────────────────────────
// Para activarlo: `npm i @sentry/react` y agregá VITE_SENTRY_DSN en .env.local
// La carga es dinámica para que la app NO requiera la dependencia hasta usarla.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  const sentryModule = "@sentry/react";
  import(/* @vite-ignore */ sentryModule)
    .then((Sentry: { init: (opts: Record<string, unknown>) => void }) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1
      });
    })
    .catch(() => {
      console.warn("[Jack] VITE_SENTRY_DSN definido pero @sentry/react no está instalado.");
    });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
