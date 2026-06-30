// ════════════════════════════════════════════════════════════════════════════
// Jack — Configuración del negocio (extraído de App.tsx, deuda técnica #10)
// ════════════════════════════════════════════════════════════════════════════
// Agrupa solo la configuración activa del producto: datos del negocio, horario,
// reservas públicas y administración de negocios para super_admin. Se quitaron las
// pestañas decorativas de integraciones, notificaciones y plan/facturación.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import { SettingsBusinessesAdmin } from "../admin/SettingsBusinessesAdmin";
import { downloadExcel } from "../../lib/excelExport";
import { databaseService } from "../../services/databaseService";
import { supabase } from "../../services/supabaseClient";
import type { AppSession, AppState } from "../../types";

type SettingsKey = "business" | "hours" | "public-site" | "businesses";

const SETTINGS_NAV_BASE: { id: SettingsKey; label: string; superAdminOnly?: boolean }[] = [
  { id: "business",    label: "Negocio" },
  { id: "hours",       label: "Horario de atención" },
  { id: "public-site", label: "Reservas públicas" },
  { id: "businesses",  label: "Negocios", superAdminOnly: true }
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
  const exportExcel = () => {
    const config = state.config;
    downloadExcel("configuracion-jack", "Configuración Jack", [
      { Sección: "Negocio", Campo: "Nombre", Valor: config.businessName },
      { Sección: "Negocio", Campo: "Tipo", Valor: config.businessType },
      { Sección: "Negocio", Campo: "Moneda", Valor: config.currency },
      { Sección: "Negocio", Campo: "Dirección", Valor: config.address },
      { Sección: "Negocio", Campo: "Teléfono", Valor: config.phone },
      { Sección: "Negocio", Campo: "WhatsApp", Valor: config.whatsapp },
      { Sección: "Negocio", Campo: "Instagram", Valor: config.instagram },
      { Sección: "Reservas públicas", Campo: "Slug", Valor: config.publicSlug },
      { Sección: "Reservas públicas", Campo: "Título", Valor: config.websiteHeadline },
      { Sección: "Reservas públicas", Campo: "Descripción", Valor: config.websiteDescription },
      ...config.businessHours.map((hour) => ({
        Sección: "Horario",
        Campo: `Día ${hour.day}`,
        Valor: hour.enabled ? `${hour.open} - ${hour.close}` : "Cerrado"
      })),
      ...(config.services ?? []).map((service) => ({
        Sección: "Servicio",
        Campo: service.name,
        Valor: service.basePrice,
        Duración: service.duration,
        Depósito: service.depositAmount
      })),
      ...(config.products ?? []).map((product) => ({
        Sección: "Producto",
        Campo: product.name,
        Valor: product.salePrice,
        Costo: product.cost,
        Stock: product.stock ?? ""
      })),
      ...(state.suppliers ?? []).map((supplier) => ({
        Sección: "Proveedor",
        Campo: supplier.name,
        Valor: supplier.phone ?? "",
        Contacto: supplier.contactName ?? "",
        Correo: supplier.email ?? ""
      }))
    ]);
    onToast("Exportación descargada");
  };

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
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className="j-btn j-btn-sm" onClick={exportExcel}>
            <Download size={12} /> Exportar
          </button>
        </div>
        {section === "business" && <SettingsBusiness state={state} setState={setState} onToast={onToast} />}
        {section === "hours" && <SettingsHours state={state} setState={setState} onToast={onToast} />}
        {section === "public-site" && <SettingsPublicSite businessId={businessId} isSuperAdmin={isSuperAdmin} onToast={onToast} />}
        {section === "businesses" && isSuperAdmin && <SettingsBusinessesAdmin onToast={onToast} />}
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
      onToast(!enabled ? "Reservas públicas activadas" : "Reservas públicas desactivadas");
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
        <h1 style={{ fontSize: 22 }}>Reservas públicas</h1>
        <span className="accent" style={{ fontSize: 22 }}>agenda conectada</span>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 620 }}>
        Permite a tus clientes reservar citas desde una página pública de agenda. No es una web personalizada completa: es el formulario conectado para que las solicitudes lleguen a Citas como reservaciones web.
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
                    : "Las reservas públicas se activan desde el panel superadmin."}
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
                Comparte este enlace en redes, Google Business o WhatsApp. Las solicitudes llegan al dashboard para que el negocio las revise y atienda.
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
        La información básica del negocio. Estos datos se usan en la agenda pública y en la operación diaria.
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
