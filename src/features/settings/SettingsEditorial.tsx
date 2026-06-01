// ════════════════════════════════════════════════════════════════════════════
// Jack — Configuración del negocio (extraído de App.tsx, deuda técnica #10)
// ════════════════════════════════════════════════════════════════════════════
// Agrupa todas las subsecciones de Configuración: Negocio, Horario, Integraciones,
// Sitio público, Negocios (super admin) y Plan. La navegación interna usa pestañas
// (estado local `section`). No contiene lógica de negocio crítica: solo edita
// `AppState.config` y el flag `public_site_enabled` vía databaseService.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Check, Settings } from "lucide-react";
import { SettingsBusinessesAdmin } from "../admin/SettingsBusinessesAdmin";
import { databaseService } from "../../services/databaseService";
import { supabase } from "../../services/supabaseClient";
import type { AppSession, AppState } from "../../types";

type SettingsKey = "business" | "hours" | "integrations" | "public-site" | "businesses" | "notifications" | "plan";

const SETTINGS_NAV_BASE: { id: SettingsKey; label: string; superAdminOnly?: boolean }[] = [
  { id: "business",      label: "Negocio" },
  { id: "hours",         label: "Horario de atención" },
  { id: "integrations",  label: "Integraciones" },
  { id: "public-site",   label: "Sitio público" },
  { id: "businesses",    label: "Negocios", superAdminOnly: true },
  { id: "notifications", label: "Notificaciones" },
  { id: "plan",          label: "Plan & facturación" }
];

export function SettingsEditorial({
  state,
  setState,
  onToast,
  session,
  businessId
}: {
  state: AppState;
  setState: (s: AppState) => void;
  onToast: (msg: string) => void;
  session: AppSession;
  businessId: string;
}) {
  const [section, setSection] = useState<SettingsKey>("business");
  const isSuperAdmin = session.role === "super_admin";
  const nav = SETTINGS_NAV_BASE.filter((s) => !s.superAdminOnly || isSuperAdmin);

  return (
    <div className="j-settings">
      <nav className="j-settings-tabs">
        {nav.map((s) => (
          <button
            key={s.id}
            className={section === s.id ? "active" : ""}
            onClick={() => setSection(s.id)}
          >
            {s.label}
            {s.superAdminOnly && (
              <span className="j-tag" style={{ marginLeft: 8, fontSize: 9, padding: "1px 5px" }}>
                Super admin
              </span>
            )}
          </button>
        ))}
      </nav>

      <div>
        {section === "business" && <SettingsBusiness state={state} setState={setState} onToast={onToast} />}
        {section === "hours" && <SettingsHours state={state} setState={setState} onToast={onToast} />}
        {section === "integrations" && <SettingsIntegrations />}
        {section === "public-site" && <SettingsPublicSite businessId={businessId} isSuperAdmin={isSuperAdmin} onToast={onToast} />}
        {section === "businesses" && isSuperAdmin && <SettingsBusinessesAdmin onToast={onToast} />}
        {section === "plan" && <SettingsPlan />}
        {!["business","hours","integrations","public-site","businesses","plan"].includes(section) && (
          <SettingsSoon label={SETTINGS_NAV_BASE.find((s) => s.id === section)?.label ?? ""} />
        )}
      </div>
    </div>
  );
}

// ─── Settings: Sitio público (paquete add-on) ─────────────────────────────────

function SettingsPublicSite({
  businessId,
  isSuperAdmin,
  onToast
}: {
  businessId: string;
  isSuperAdmin: boolean;
  onToast: (msg: string) => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from("businesses")
        .select("public_site_enabled, slug")
        .eq("id", businessId)
        .maybeSingle();
      if (cancelled) return;
      setEnabled(data?.public_site_enabled ?? false);
      setSlug(data?.slug ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  const toggle = async () => {
    if (!supabase || !isSuperAdmin) return;
    setSaving(true);
    try {
      await databaseService.setBusinessPublicSiteEnabled(businessId, !enabled);
      setEnabled(!enabled);
      onToast(!enabled ? "Sitio público activado" : "Sitio público desactivado");
    } catch (err) {
      onToast("No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = `${window.location.origin}/p/${slug}`;

  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>Sitio público</h1>
        <span className="accent" style={{ fontSize: 22 }}>paquete add-on</span>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 620 }}>
        Permite a tus clientes reservar citas desde un sitio web público (paquete que se vende aparte del sistema). Las reservas llegan al dashboard automáticamente con el origen <span className="mono">public_site</span>.
      </p>

      {loading ? (
        <div className="j-card" style={{ padding: 22 }}>Cargando…</div>
      ) : (
        <>
          <div className="j-card" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: "var(--fg)" }}>
                  Estado: {enabled ? (
                    <span className="j-tag dot pos" style={{ marginLeft: 6 }}>Activo</span>
                  ) : (
                    <span className="j-tag" style={{ marginLeft: 6 }}>Inactivo</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>
                  {isSuperAdmin
                    ? "Como super admin, puedes activar/desactivar este paquete para el negocio."
                    : "El paquete de sitio público se vende aparte. Contacta a Jack para activarlo."}
                </div>
              </div>
              {isSuperAdmin && (
                <button
                  className={enabled ? "j-btn" : "j-btn j-btn-primary"}
                  onClick={toggle}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : enabled ? "Desactivar" : "Activar paquete"}
                </button>
              )}
            </div>
          </div>

          {enabled && (
            <div className="j-card" style={{ padding: 22 }}>
              <div className="j-field-label" style={{ marginBottom: 8 }}>URL pública</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="j-input mono" value={publicUrl} readOnly style={{ fontSize: 13 }} />
                <button
                  className="j-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(publicUrl);
                    onToast("URL copiada");
                  }}
                >
                  Copiar
                </button>
                <a className="j-btn" href={publicUrl} target="_blank" rel="noopener noreferrer">
                  Ver →
                </a>
              </div>
              <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--bg-sunken)", border: "1px dashed var(--border-strong)", borderRadius: 7, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.55 }}>
                Comparte este enlace en tus redes, Google Business o WhatsApp. Las reservas se sincronizan en tiempo real al dashboard.
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function SettingsBusiness({
  state,
  setState,
  onToast
}: {
  state: AppState;
  setState: (s: AppState) => void;
  onToast: (msg: string) => void;
}) {
  const [draft, setDraft] = useState(state.config);

  const save = () => {
    setState({ ...state, config: draft });
    onToast("Información del negocio actualizada");
  };

  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>{draft.businessName || "Tu negocio"}</h1>
        <span className="accent" style={{ fontSize: 22 }}>en Jack</span>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 620 }}>
        La información que tus clientes ven al agendar. Estos datos también se usan en facturación.
      </p>

      <div className="j-card" style={{ padding: 22, display: "grid", gap: 16, maxWidth: 720 }}>
        <div className="j-field">
          <div className="j-field-label">Nombre del negocio</div>
          <input className="j-input" value={draft.businessName} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="j-field">
            <div className="j-field-label">Tipo de negocio</div>
            <input className="j-input" value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value })} />
          </div>
          <div className="j-field">
            <div className="j-field-label">Moneda</div>
            <input className="j-input" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
          </div>
        </div>
        <div className="j-field">
          <div className="j-field-label">Dirección</div>
          <input className="j-input" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="j-field">
            <div className="j-field-label">Teléfono</div>
            <input className="j-input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div className="j-field">
            <div className="j-field-label">WhatsApp</div>
            <input className="j-input" value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="j-field">
            <div className="j-field-label">Instagram</div>
            <input className="j-input" value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })} />
          </div>
          <div className="j-field">
            <div className="j-field-label">Slug público</div>
            <input className="j-input" value={draft.publicSlug} onChange={(e) => setDraft({ ...draft, publicSlug: e.target.value })} />
          </div>
        </div>
        <div className="j-field">
          <div className="j-field-label">Título del sitio público</div>
          <input className="j-input" value={draft.websiteHeadline} onChange={(e) => setDraft({ ...draft, websiteHeadline: e.target.value })} />
        </div>
        <div className="j-field">
          <div className="j-field-label">Descripción</div>
          <textarea className="j-input" rows={3} value={draft.websiteDescription} onChange={(e) => setDraft({ ...draft, websiteDescription: e.target.value })} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button className="j-btn" onClick={() => setDraft(state.config)}>Descartar</button>
          <button className="j-btn j-btn-primary" onClick={save}>
            <Check size={13} strokeWidth={2.25} /> Guardar cambios
          </button>
        </div>
      </div>
    </>
  );
}

function SettingsHours({
  state,
  setState,
  onToast
}: {
  state: AppState;
  setState: (s: AppState) => void;
  onToast: (msg: string) => void;
}) {
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const normalizedHours = dayNames.map((_, day) => (
    state.config.businessHours.find((item) => item.day === day) ?? {
      day,
      enabled: day >= 1 && day <= 5,
      open: "09:00",
      close: "18:00"
    }
  ));
  const [draft, setDraft] = useState(normalizedHours);

  const updateDay = (day: number, patch: Partial<(typeof draft)[number]>) => {
    setDraft(draft.map((item) => item.day === day ? { ...item, ...patch } : item));
  };

  const save = () => {
    const invalid = draft.find((item) => item.enabled && item.open >= item.close);
    if (invalid) return onToast(`Revisa el horario de ${dayNames[invalid.day]}`);
    setState({
      ...state,
      config: {
        ...state.config,
        businessHours: draft
      }
    });
    onToast("Horario actualizado");
  };

  const applyWeekdays = () => {
    setDraft(draft.map((item) => ({
      ...item,
      enabled: item.day >= 1 && item.day <= 5,
      open: item.day >= 1 && item.day <= 5 ? "09:00" : item.open,
      close: item.day >= 1 && item.day <= 5 ? "18:00" : item.close
    })));
  };

  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>Horario de atención</h1>
        <span className="accent" style={{ fontSize: 22 }}>disponibilidad</span>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 680 }}>
        Estos horarios controlan la agenda interna y el sitio público. Si un día está apagado, los clientes no podrán reservar ahí.
      </p>

      <div className="j-card" style={{ padding: 22, maxWidth: 820 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <div className="j-field-label">Semana operativa</div>
          <button className="j-btn j-btn-sm" onClick={applyWeekdays}>Lunes a viernes 9:00-18:00</button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {draft.map((item) => (
            <div
              key={item.day}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(120px, 1fr) 130px 130px auto",
                gap: 10,
                alignItems: "center",
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: item.enabled ? "var(--bg-elev)" : "var(--bg-sunken)"
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(e) => updateDay(item.day, { enabled: e.target.checked })}
                />
                {dayNames[item.day]}
              </label>
              <input
                className="j-input mono"
                type="time"
                value={item.open}
                disabled={!item.enabled}
                onChange={(e) => updateDay(item.day, { open: e.target.value })}
              />
              <input
                className="j-input mono"
                type="time"
                value={item.close}
                disabled={!item.enabled}
                onChange={(e) => updateDay(item.day, { close: e.target.value })}
              />
              <span className={item.enabled ? "j-tag dot pos" : "j-tag"} style={{ justifySelf: "end" }}>
                {item.enabled ? "Abierto" : "Cerrado"}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="j-btn" onClick={() => setDraft(normalizedHours)}>Descartar</button>
          <button className="j-btn j-btn-primary" onClick={save}>
            <Check size={13} strokeWidth={2.25} /> Guardar horario
          </button>
        </div>
      </div>
    </>
  );
}

function SettingsIntegrations() {
  const items = [
    { name: "WhatsApp manual", desc: "Botones que abren WhatsApp Web o la app con el número del cliente. No requiere Twilio ni Meta.", on: true },
    { name: "Google Calendar", desc: "Sincronización futura para bloquear disponibilidad externa y evitar doble agenda.", on: false }
  ];
  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>Integraciones</h1>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 620 }}>
        Jack usa WhatsApp manual con enlaces wa.me para que el negocio confirme, reagende o cancele sin configurar APIs externas.
      </p>
      {items.map((it, i) => (
        <div key={i} style={{ padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 10, display: "flex", gap: 14, alignItems: "center", background: "var(--bg-elev)" }}>
          <div style={{ width: 36, height: 36, borderRadius: 7, background: "var(--bg-sunken)", display: "grid", placeItems: "center", border: "1px solid var(--border)", color: "var(--fg)" }}>
            <Settings size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 13.5, color: "var(--fg)" }}>
              {it.name}
              {it.on && <span className="j-tag dot pos" style={{ marginLeft: 8 }}>Conectado</span>}
              {!it.on && <span className="j-tag" style={{ marginLeft: 8 }}>Próximamente</span>}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--fg-muted)" }}>{it.desc}</div>
          </div>
          <button className="j-btn j-btn-sm" disabled={!it.on}>
            {it.on ? "Configurar" : "Conectar"}
          </button>
        </div>
      ))}
    </>
  );
}

function SettingsPlan() {
  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>Plan & facturación</h1>
        <span className="accent" style={{ fontSize: 22 }}>Jack</span>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 680 }}>
        Espacio comercial para mostrar al negocio qué tiene contratado y qué falta activar.
      </p>
      <div className="j-kpis">
        <div className="j-kpi">
          <div className="j-kpi-label">Sistema Jack</div>
          <div className="j-kpi-value mono">$200</div>
          <div className="j-kpi-delta"><span>Mensualidad base MXN</span></div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Sitio conectado</div>
          <div className="j-kpi-value mono">Add-on</div>
          <div className="j-kpi-delta"><span>Paquete web + reservas</span></div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">WhatsApp</div>
          <div className="j-kpi-value mono">Manual</div>
          <div className="j-kpi-delta"><span>Abre wa.me sin APIs externas</span></div>
        </div>
      </div>
      <div className="j-card" style={{ padding: 22, maxWidth: 760 }}>
        <div className="j-field-label" style={{ marginBottom: 10 }}>Notas de facturación</div>
        <div style={{ display: "grid", gap: 10, fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55 }}>
          <div><b style={{ color: "var(--fg)" }}>Instalación sistema:</b> sugerido $4,000 MXN.</div>
          <div><b style={{ color: "var(--fg)" }}>Sitio informativo:</b> sugerido $2,000 MXN.</div>
          <div><b style={{ color: "var(--fg)" }}>Paquete completo:</b> sugerido $5,000 MXN + $200 MXN mensuales.</div>
        </div>
      </div>
    </>
  );
}

function SettingsSoon({ label }: { label: string }) {
  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>{label}</h1>
      </div>
      <div className="j-soon">
        <div className="title">Próximamente</div>
        <p>Esta sección está en construcción. Por ahora puedes configurar <b style={{ color: "var(--fg)" }}>Negocio</b>, <b style={{ color: "var(--fg)" }}>Servicios</b> e <b style={{ color: "var(--fg)" }}>Integraciones</b>.</p>
      </div>
    </>
  );
}
