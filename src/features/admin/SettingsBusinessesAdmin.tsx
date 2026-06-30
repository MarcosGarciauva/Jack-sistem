// ════════════════════════════════════════════════════════════════════════════
// Jack — Panel super_admin: negocios + administradores
// ════════════════════════════════════════════════════════════════════════════
// El super_admin crea negocios, consulta su estado operativo y puede eliminar
// negocios de forma segura. "Eliminar" significa desactivar el negocio y sus
// perfiles asociados; no borra el histórico físico de citas/cortes/clientes.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Globe, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { JEmpty } from "../../components/Editorial";
import { databaseService, type BusinessSummary } from "../../services/databaseService";
import { BUSINESS_TYPES } from "../../lib/businessOptions";

export function SettingsBusinessesAdmin({ onToast }: { onToast: (msg: string) => void }) {
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES[0]);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const activeBusinesses = businesses.filter((b) => b.active);
  const publicBusinesses = businesses.filter((b) => b.active && b.publicSiteEnabled);
  const inactiveBusinesses = businesses.filter((b) => !b.active);

  const filteredBusinesses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return businesses;
    return businesses.filter((b) =>
      [b.name, b.slug, b.businessType ?? ""].some((value) => value.toLowerCase().includes(needle))
    );
  }, [businesses, query]);

  const load = async () => {
    setLoading(true);
    try {
      setBusinesses(await databaseService.listBusinesses());
    } catch {
      onToast("No se pudo cargar la lista de negocios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const reset = () => {
    setBusinessName("");
    setBusinessType(BUSINESS_TYPES[0]);
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
  };

  const create = async () => {
    if (!businessName.trim()) return onToast("Nombre del negocio obligatorio");
    if (!adminName.trim()) return onToast("Nombre del administrador obligatorio");
    if (!adminEmail.trim()) return onToast("Correo del administrador obligatorio");
    if (adminPassword.length < 8) return onToast("La contraseña debe tener al menos 8 caracteres");
    setCreating(true);
    try {
      await databaseService.createBusinessWithAdmin({
        businessName: businessName.trim(),
        businessType,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword
      });
      onToast("Negocio y administrador creados");
      reset();
      setOpen(false);
      void load();
    } catch (err) {
      onToast((err as Error).message || "No se pudo crear el negocio");
    } finally {
      setCreating(false);
    }
  };

  const deleteBusiness = async (business: BusinessSummary) => {
    const ok = window.confirm(
      `Eliminar ${business.name}?\n\nEsto desactiva el negocio y las cuentas vinculadas. No borra físicamente el histórico para que puedas recuperarlo si fue un error.`
    );
    if (!ok) return;
    setDeletingId(business.id);
    try {
      await databaseService.deleteBusiness(business.id);
      setBusinesses((items) => items.map((item) => item.id === business.id ? { ...item, active: false, publicSiteEnabled: false } : item));
      onToast("Negocio eliminado de forma segura");
    } catch (err) {
      onToast((err as Error).message || "No se pudo eliminar el negocio");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>Negocios</h1>
        <span className="accent" style={{ fontSize: 22 }}>super admin</span>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 720 }}>
        Control central de negocios en Jack. Desde aquí das de alta cuentas administrativas y puedes eliminar un negocio de forma segura cuando ya no debe operar.
      </p>

      <div className="j-stat-strip" style={{ alignItems: "stretch" }}>
        <div className="j-stat">
          <div className="j-stat-l">Activos</div>
          <div className="j-stat-v">{activeBusinesses.length}</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-l">Reservas públicas</div>
          <div className="j-stat-v">{publicBusinesses.length}</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-l">Eliminados</div>
          <div className="j-stat-v">{inactiveBusinesses.length}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="j-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2.25} /> Actualizar
          </button>
          <button className="j-btn j-btn-primary" onClick={() => setOpen((v) => !v)}>
            <Plus size={13} strokeWidth={2.25} /> Nuevo negocio
          </button>
        </div>
      </div>

      {open && (
        <div className="j-card" style={{ padding: 22, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, display: "grid", placeItems: "center", background: "var(--bg-sunken)", border: "1px solid var(--border)" }}>
              <Building2 size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--fg)" }}>Nuevo negocio + administrador</div>
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>El administrador completará el onboarding al entrar por primera vez.</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <div className="j-field">
              <div className="j-field-label">Nombre del negocio</div>
              <input className="j-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej. Terramar Spa" />
            </div>
            <div className="j-field">
              <div className="j-field-label">Tipo de negocio</div>
              <select className="j-input" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="j-field">
              <div className="j-field-label">Nombre del administrador</div>
              <input className="j-input" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Nombre y apellido" />
            </div>
            <div className="j-field">
              <div className="j-field-label">Correo del administrador</div>
              <input className="j-input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@correo.com" />
            </div>
            <div className="j-field">
              <div className="j-field-label">Contraseña temporal</div>
              <input className="j-input" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button className="j-btn" onClick={() => { setOpen(false); reset(); }} disabled={creating}>Cancelar</button>
            <button className="j-btn j-btn-primary" onClick={create} disabled={creating}>
              <Check size={13} strokeWidth={2.25} /> {creating ? "Creando…" : "Crear negocio"}
            </button>
          </div>
        </div>
      )}

      <div className="j-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--fg)" }}>Directorio de negocios</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>Eliminado = negocio desactivado y accesos bloqueados.</div>
          </div>
          <label style={{ position: "relative", minWidth: 260 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)" }} />
            <input className="j-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar negocio o slug" style={{ paddingLeft: 34 }} />
          </label>
        </div>

        {loading ? (
          <div style={{ padding: 28 }}>Cargando…</div>
        ) : filteredBusinesses.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty compact title="Sin resultados" description="Crea un negocio o ajusta la búsqueda." />
          </div>
        ) : (
          <table className="j-table">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Tipo</th>
                <th>Identificador</th>
                <th>Estado</th>
                <th>Reservas públicas</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredBusinesses.map((b) => (
                <tr key={b.id} style={!b.active ? { opacity: 0.62 } : undefined}>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--fg)" }}>{b.name}</div>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2 }}>{b.id}</div>
                  </td>
                  <td style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{b.businessType || "Servicio"}</td>
                  <td className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{b.slug}</td>
                  <td>{b.active ? <span className="j-tag dot pos">Activo</span> : <span className="j-tag dot neg">Eliminado</span>}</td>
                  <td>{b.publicSiteEnabled ? <span className="j-tag dot pos"><Globe size={11} /> Activas</span> : <span className="j-tag">No</span>}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="j-btn j-btn-sm"
                      onClick={() => deleteBusiness(b)}
                      disabled={!b.active || deletingId === b.id}
                      title="Desactiva el negocio y sus accesos"
                    >
                      <Trash2 size={12} /> {deletingId === b.id ? "Eliminando…" : "Eliminar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
