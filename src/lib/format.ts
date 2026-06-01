// ─── Formatters — Jack editorial design system ────────────────────────────────
// Usa SIEMPRE estos helpers para mostrar moneda, fechas y horas.
// NO uses Intl.* directamente en componentes, NO uses toLocaleString crudo.

const LOCALE = "es-MX";

/** "$1,250" — moneda en formato largo según divisa */
export const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);

/** "$1.2k" — abreviado para gráficas/sparklines */
export const formatCurrencyShort = (value: number, currency = "MXN") => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return formatCurrency(value, currency);
};

/** "mié, 27 may" — fecha corta para tablas y filtros */
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(new Date(`${date}T12:00:00`));

/** "miércoles, 27 de mayo de 2026" — fecha larga para headers */
export const formatLongDate = (date: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));

/** "27 may" — fecha mínima sin día de la semana */
export const formatShortDate = (date: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short"
  }).format(new Date(`${date}T12:00:00`));

/** "10:30" — hora normalizada (asume input ya tiene formato HH:MM) */
export const formatTime = (time: string) => time.slice(0, 5);

/** "hace 3 d" / "hoy" / "mañana" / "en 5 d" — fecha relativa al día actual */
export const formatRelative = (date: string): string => {
  const today = new Date(`${todayISO()}T12:00:00`);
  const target = new Date(`${date}T12:00:00`);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  if (diff > 0 && diff <= 30) return `en ${diff} d`;
  if (diff < 0 && diff >= -30) return `hace ${Math.abs(diff)} d`;
  return formatShortDate(date);
};

/** YYYY-MM-DD del día actual en zona local */
export const todayISO = () => {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
};

/** ID único legible con prefijo */
export const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;

/** "MH" — iniciales para avatares */
export const initialsFromName = (name: string): string => {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
};
