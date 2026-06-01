// ════════════════════════════════════════════════════════════════════════════
// Jack — Proveedores (Operación, P10)
// ════════════════════════════════════════════════════════════════════════════
// CRUD de proveedores del negocio: nombre, contacto, teléfono (con selector de
// país, P11), correo, categoría y notas. Botón de WhatsApp directo al contacto.
//
// Persistencia: app_state.suppliers (nivel raíz, fuera de config para no
// exponer datos al sitio público). El espejo normalizado es preparación futura
// (ver supabase/suppliers.sql).
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { Check, ChevronRight, MessageCircle, Plus, Trash2, X } from "lucide-react";
import { JEmpty } from "../../components/Editorial";
import { PhoneInput, formatPhoneDisplay } from "../../components/PhoneInput";
import { uid } from "../../lib/format";
import { whatsappService } from "../../services/whatsappService";
import type { AppState, Supplier } from "../../types";

interface Draft {
  mode: "create" | "edit";
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  category: string;
  notes: string;
}

export function SuppliersManager({
  state,
  setState,
  onToast
}: {
  state: AppState;
  setState: (s: AppState) => void;
  onToast: (msg: string) => void;
}) {
  const suppliers = state.suppliers ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contactName ?? "").toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q)
    );
  }, [suppliers, query]);

  const persist = (next: Supplier[]) => setState({ ...state, suppliers: next });

  const startCreate = () =>
    setDraft({ mode: "create", id: uid("sup"), name: "", contactName: "", phone: "", email: "", category: "", notes: "" });

  const startEdit = (s: Supplier) =>
    setDraft({
      mode: "edit",
      id: s.id,
      name: s.name,
      contactName: s.contactName ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      category: s.category ?? "",
      notes: s.notes ?? ""
    });

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim()) return onToast("El nombre es obligatorio");
    const item: Supplier = {
      id: draft.id,
      name: draft.name.trim(),
      contactName: draft.contactName.trim() || undefined,
      phone: draft.phone || undefined,
      email: draft.email.trim() || undefined,
      category: draft.category.trim() || undefined,
      notes: draft.notes.trim() || undefined
    };
    if (draft.mode === "create") persist([item, ...suppliers]);
    else persist(suppliers.map((s) => (s.id === draft.id ? item : s)));
    onToast(draft.mode === "create" ? "Proveedor agregado" : "Cambios guardados");
    setDraft(null);
  };

  // P4: eliminar y WhatsApp viven dentro de la ventana de detalle.
  const removeFromDraft = () => {
    if (!draft || draft.mode !== "edit") return;
    if (!confirm(`¿Eliminar al proveedor "${draft.name}"?`)) return;
    persist(suppliers.filter((x) => x.id !== draft.id));
    setDraft(null);
    onToast("Proveedor eliminado");
  };

  const openWhatsAppFromDraft = () => {
    if (!draft) return;
    if (!draft.phone || !whatsappService.open(draft.phone, `Hola ${draft.contactName || draft.name}.`)) {
      onToast("El proveedor no tiene teléfono");
    }
  };

  return (
    <section>
      <div className="j-stat-strip">
        <div className="j-stat">
          <div className="j-stat-l">Proveedores</div>
          <div className="j-stat-v">{suppliers.length}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button className="j-btn j-btn-primary" onClick={startCreate}>
            <Plus size={13} strokeWidth={2.25} /> Nuevo proveedor
          </button>
        </div>
      </div>

      <div className="j-card" style={{ padding: 14, marginBottom: 14 }}>
        <input
          className="j-input"
          style={{ width: "100%" }}
          placeholder="Buscar por nombre, contacto o categoría…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="j-card">
        {suppliers.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty
              compact
              title="Sin proveedores"
              description="Registra a quienes te surten productos o insumos para tenerlos a la mano."
              action={<button className="j-btn j-btn-primary" onClick={startCreate}><Plus size={13} strokeWidth={2.25} /> Agregar proveedor</button>}
            />
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty compact title="Sin resultados" description="Ajusta la búsqueda." />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="j-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Contacto</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>Categoría</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {/* P4: filas de solo lectura; clic abre la ventana de detalle. */}
                {visible.map((s) => (
                  <tr key={s.id} className="click" onClick={() => startEdit(s)} style={{ cursor: "pointer" }}>
                    <td style={{ fontWeight: 500, color: "var(--fg)" }}>
                      {s.name}
                      {s.notes ? <div style={{ color: "var(--fg-subtle)", fontSize: 11.5, fontWeight: 400 }}>{s.notes}</div> : null}
                    </td>
                    <td style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{s.contactName ?? "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.phone ? formatPhoneDisplay(s.phone) : "—"}</td>
                    <td style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{s.email ?? "—"}</td>
                    <td style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{s.category ?? "—"}</td>
                    <td className="num"><ChevronRight size={15} style={{ color: "var(--fg-muted)" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft && (
        <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="j-modal">
            <div className="j-modal-head">
              <h2>{draft.mode === "create" ? "Nuevo proveedor" : "Editar proveedor"}</h2>
              <button className="j-btn-ghost" onClick={() => setDraft(null)} style={{ padding: 6 }}><X size={16} /></button>
            </div>
            <div className="j-modal-body">
              <div className="j-field" style={{ marginBottom: 14 }}>
                <div className="j-field-label">Nombre del proveedor</div>
                <input className="j-input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. Distribuidora del Norte" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div className="j-field">
                  <div className="j-field-label">Persona de contacto</div>
                  <input className="j-input" value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} placeholder="Nombre del contacto" />
                </div>
                <div className="j-field">
                  <div className="j-field-label">Categoría</div>
                  <input className="j-input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Ej. Insumos, Limpieza" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div className="j-field">
                  <div className="j-field-label">Teléfono</div>
                  <PhoneInput value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} />
                </div>
                <div className="j-field">
                  <div className="j-field-label">Correo</div>
                  <input className="j-input" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="correo@proveedor.com" />
                </div>
              </div>
              <div className="j-field">
                <div className="j-field-label">Notas (opcional)</div>
                <textarea className="j-input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Condiciones, días de entrega…" />
              </div>
            </div>
            <div className="j-modal-foot" style={{ gap: 8 }}>
              {draft.mode === "edit" && (
                <button className="j-btn" onClick={removeFromDraft} style={{ color: "var(--neg)" }}>
                  <Trash2 size={13} /> Eliminar
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {draft.phone && (
                  <button className="j-btn" onClick={openWhatsAppFromDraft}>
                    <MessageCircle size={13} /> WhatsApp
                  </button>
                )}
                <button className="j-btn" onClick={() => setDraft(null)}>Cancelar</button>
                <button className="j-btn j-btn-primary" onClick={saveDraft}>
                  <Check size={13} strokeWidth={2.25} /> Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
