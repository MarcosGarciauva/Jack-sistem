// ════════════════════════════════════════════════════════════════════════════
// Jack — Panel super_admin: negocios + administradores
// ════════════════════════════════════════════════════════════════════════════
// Reemplaza al antiguo panel de códigos de invitación. El super_admin crea un
// negocio nuevo junto con su administrador (correo + contraseña) vía el Edge
// Function `admin-manage-user`.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { JEmpty } from "../../components/Editorial";
import { databaseService, type BusinessSummary } from "../../services/databaseService";
import { BUSINESS_TYPES } from "../../lib/businessOptions";

export function SettingsBusinessesAdmin({ onToast }: { onToast: (msg: string) => void }) {
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES[0]);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

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

  return (
    <>
      <div className="j-page-title" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22 }}>Negocios</h1>
        <span className="accent" style={{ fontSize: 22 }}>super admin</span>
      </div>
      <p style={{ color: "var(--fg-muted)", fontSize: 13, margin: "0 0 22px", maxWidth: 620 }}>
        Da de alta un negocio nuevo junto con la cuenta de su administrador. El administrador inicia sesión con el correo y contraseña que definas aquí.
      </p>

      <div className="j-stat-strip">
        <div className="j-stat">
          <div className="j-stat-l">Negocios</div>
          <div className="j-stat-v">{businesses.length}</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-l">Con sitio público</div>
          <div className="j-stat-v">{businesses.filter((b) => b.publicSiteEnabled).length}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <button className="j-btn j-btn-primary" onClick={() => setOpen((v) => !v)}>
            <Plus size={13} strokeWidth={2.25} /> Nuevo negocio
          </button>
        </div>
      </div>

      {open && (
        <div className="j-card" style={{ padding: 22, marginBottom: 16, maxWidth: 880 }}>
          <div className="j-field-label" style={{ marginBottom: 12 }}>Nuevo negocio + administrador</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
            <div className="j-field">
              <div className="j-field-label">Nombre del negocio</div>
              <input className="j-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej. Estética Aurora" />
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
              <div className="j-field-label">Contraseña</div>
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

      <div className="j-card">
        {loading ? (
          <div style={{ padding: 28 }}>Cargando…</div>
        ) : businesses.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty compact title="Sin negocios" description="Crea el primer negocio con su administrador." />
          </div>
        ) : (
          <table className="j-table">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Identificador</th>
                <th>Estado</th>
                <th>Sitio público</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500, color: "var(--fg)" }}>{b.name}</td>
                  <td className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{b.slug}</td>
                  <td>{b.active ? <span className="j-tag dot pos">Activo</span> : <span className="j-tag dot neg">Inactivo</span>}</td>
                  <td>{b.publicSiteEnabled ? <span className="j-tag dot pos">Sí</span> : <span className="j-tag dot">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
