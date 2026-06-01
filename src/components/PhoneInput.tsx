// ════════════════════════════════════════════════════════════════════════════
// Jack — Selector de teléfono por país reutilizable (P11)
// ════════════════════════════════════════════════════════════════════════════
// Soporta México (+52) y Estados Unidos (+1). Emite un único string de dígitos
// en formato internacional (código de país + número nacional), p. ej. MX →
// "525512345678", US → "15551234567". Este formato es compatible con
// whatsappService.normalizeWaNumber, que abre wa.me.
//
// La normalización de WhatsApp para México (52 + 10 dígitos, limpiando 521…)
// es una regla crítica del negocio y vive en whatsappService; aquí solo se
// captura el número de forma consistente.
// ════════════════════════════════════════════════════════════════════════════

export type CountryCode = "MX" | "US";

interface Country {
  code: CountryCode;
  dial: string;
  flag: string;
  label: string;
  /** Largo esperado del número nacional (sin código de país). */
  nationalLength: number;
}

export const COUNTRIES: Country[] = [
  { code: "MX", dial: "52", flag: "🇲🇽", label: "México", nationalLength: 10 },
  { code: "US", dial: "1", flag: "🇺🇸", label: "EE.UU.", nationalLength: 10 }
];

const byCode = (code: CountryCode) => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

/** Separa un valor almacenado en { country, national } (solo dígitos). */
export function parsePhone(value: string): { country: CountryCode; national: string } {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return { country: "MX", national: "" };
  // México: 521 + 10 (legacy WhatsApp), 52 + 10, o 10 sueltos.
  if (digits.startsWith("521") && digits.length === 13) return { country: "MX", national: digits.slice(3) };
  if (digits.startsWith("52") && digits.length === 12) return { country: "MX", national: digits.slice(2) };
  // EE.UU.: 1 + 10.
  if (digits.startsWith("1") && digits.length === 11) return { country: "US", national: digits.slice(1) };
  if (digits.length === 10) return { country: "MX", national: digits };
  return { country: "MX", national: digits.slice(-10) };
}

/** Construye el valor internacional a guardar a partir de país + nacional. */
export function buildPhone(country: CountryCode, national: string): string {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "";
  return byCode(country).dial + digits;
}

/** "+52 55 1234 5678" — formato legible para mostrar. */
export function formatPhoneDisplay(value: string): string {
  if (!value) return "";
  const { country, national } = parsePhone(value);
  if (!national) return value;
  const c = byCode(country);
  const groups = country === "MX"
    ? [national.slice(0, 2), national.slice(2, 6), national.slice(6, 10)]
    : [national.slice(0, 3), national.slice(3, 6), national.slice(6, 10)];
  return `+${c.dial} ${groups.filter(Boolean).join(" ")}`.trim();
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  autoFocus
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { country, national } = parsePhone(value);

  const setCountry = (next: CountryCode) => onChange(buildPhone(next, national));
  const setNational = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, byCode(country).nationalLength);
    onChange(buildPhone(country, digits));
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        className="j-input"
        style={{ width: 110, flex: "0 0 auto" }}
        value={country}
        onChange={(e) => setCountry(e.target.value as CountryCode)}
        aria-label="País"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>{c.flag} +{c.dial}</option>
        ))}
      </select>
      <input
        className="j-input mono"
        style={{ flex: 1 }}
        type="tel"
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder={placeholder ?? "55 1234 5678"}
        value={national}
        onChange={(e) => setNational(e.target.value)}
      />
    </div>
  );
}
