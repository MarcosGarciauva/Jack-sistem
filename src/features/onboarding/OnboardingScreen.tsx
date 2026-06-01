// ════════════════════════════════════════════════════════════════════════════
// Jack — Onboarding inicial del negocio (P2)
// ════════════════════════════════════════════════════════════════════════════
// Pantalla obligatoria en el primer ingreso del administrador. Captura nombre,
// apellido, tipo de negocio y cómo nos conoció. Al completar marca
// `onboarding_completed = true` en el negocio (vía Edge Function admin-manage-user)
// y no se vuelve a mostrar.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { databaseService } from "../../services/databaseService";
import { BUSINESS_TYPES, HOW_FOUND_OPTIONS } from "../../lib/businessOptions";
import type { AppSession, AppState } from "../../types";

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function OnboardingScreen({
  session,
  businessState,
  onDone,
  onToast
}: {
  session: AppSession;
  businessState: AppState;
  onDone: () => void;
  onToast: (msg: string) => void;
}) {
  const seed = splitName(session.name);
  const seedType = BUSINESS_TYPES.includes(businessState.config.businessType as (typeof BUSINESS_TYPES)[number])
    ? businessState.config.businessType
    : BUSINESS_TYPES[0];

  const [firstName, setFirstName] = useState(seed.first);
  const [lastName, setLastName] = useState(seed.last);
  const [businessType, setBusinessType] = useState<string>(seedType);
  const [howFound, setHowFound] = useState<string>(HOW_FOUND_OPTIONS[0]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!firstName.trim()) return onToast("Tu nombre es obligatorio");
    if (!lastName.trim()) return onToast("Tu apellido es obligatorio");
    setBusy(true);
    try {
      await databaseService.completeOnboarding({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        businessType,
        howFound
      });
      onToast("¡Listo! Bienvenido a Jack");
      onDone();
    } catch (err) {
      onToast((err as Error).message || "No se pudo completar el onboarding");
      setBusy(false);
    }
  };

  return (
    <div className="j-onboarding">
      <div className="j-card j-onboarding-card">
        <div className="j-onboarding-brand">Jack</div>
        <h1 className="j-onboarding-title">
          Bienvenido a <span className="accent">{businessState.config.businessName || "tu negocio"}</span>
        </h1>
        <p className="j-onboarding-sub">
          Antes de empezar, cuéntanos un poco sobre ti y tu negocio. Solo te lo pediremos esta vez.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 }}>
          <div className="j-field">
            <div className="j-field-label">Nombre</div>
            <input className="j-input" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div className="j-field">
            <div className="j-field-label">Apellido</div>
            <input className="j-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Tu apellido" />
          </div>
          <div className="j-field">
            <div className="j-field-label">Tipo de negocio</div>
            <select className="j-input" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="j-field">
            <div className="j-field-label">¿Cómo nos conociste?</div>
            <select className="j-input" value={howFound} onChange={(e) => setHowFound(e.target.value)}>
              {HOW_FOUND_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button className="j-btn j-btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Guardando…" : "Comenzar"} <ArrowRight size={14} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}
