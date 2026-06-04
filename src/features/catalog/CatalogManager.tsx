// ════════════════════════════════════════════════════════════════════════════
// Jack — Productos y Servicios (Operación, P4)
// ════════════════════════════════════════════════════════════════════════════
// Catálogo unificado: cada ítem es un producto o un servicio, con categoría,
// costo (neto/bruto), precio de venta y margen. Los servicios conservan su
// duración para no romper disponibilidad ni el sitio público; por eso el modal
// pide duración solo cuando el tipo es "servicio".
//
// Persistencia: app_state.config.services / .products / .categories (capa de
// compatibilidad). El espejo normalizado es preparación futura (ver
// supabase/catalog_products.sql).
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronRight, Download, Plus, Trash2, Upload, X } from "lucide-react";
import { JEmpty } from "../../components/Editorial";
import { databaseService } from "../../services/databaseService";
import { monitoringService } from "../../services/monitoringService";
import { formatCurrency, uid } from "../../lib/format";
import type {
  AppState,
  CatalogCategory,
  CatalogItemType,
  CostType,
  ProductItem,
  ServiceItem
} from "../../types";

type SortKey = "name" | "salePrice" | "margin";

interface Row {
  id: string;
  itemType: CatalogItemType;
  name: string;
  categoryId?: string;
  cost: number;
  costType: CostType;
  salePrice: number;
  duration?: number;
}

interface Draft {
  mode: "create" | "edit";
  itemType: CatalogItemType;
  id: string;
  name: string;
  categoryId: string;
  cost: string;
  costType: CostType;
  salePrice: string;
  duration: string;
}

const COST_LABEL: Record<CostType, string> = { net: "Neto", gross: "Bruto" };

export function CatalogManager({
  businessId,
  state,
  setState,
  onToast
}: {
  businessId: string;
  state: AppState;
  setState: (s: AppState) => void;
  onToast: (msg: string) => void;
}) {
  const currency = state.config.currency;
  const services = state.config.services ?? [];
  const products = state.config.products ?? [];
  const categories = state.config.categories ?? [];

  const [draft, setDraft] = useState<Draft | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | CatalogItemType>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? "Sin categoría";

  const rows = useMemo<Row[]>(() => {
    const serviceRows: Row[] = services.map((s) => ({
      id: s.id,
      itemType: "service",
      name: s.name,
      categoryId: s.categoryId,
      cost: s.cost ?? 0,
      costType: s.costType ?? "net",
      salePrice: s.basePrice,
      duration: s.duration
    }));
    const productRows: Row[] = products.map((p) => ({
      id: p.id,
      itemType: "product",
      name: p.name,
      categoryId: p.categoryId,
      cost: p.cost,
      costType: p.costType,
      salePrice: p.salePrice
    }));
    return [...serviceRows, ...productRows];
  }, [services, products]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (typeFilter !== "all" && r.itemType !== typeFilter) return false;
      if (catFilter !== "all" && (r.categoryId ?? "") !== catFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "salePrice") cmp = a.salePrice - b.salePrice;
      else cmp = (a.salePrice - a.cost) - (b.salePrice - b.cost);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [rows, query, typeFilter, catFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  // ── Crear / editar ────────────────────────────────────────────────────────
  const startCreate = () =>
    setDraft({ mode: "create", itemType: "service", id: uid("cat"), name: "", categoryId: "", cost: "", costType: "net", salePrice: "", duration: "60" });

  const startEdit = (row: Row) =>
    setDraft({
      mode: "edit",
      itemType: row.itemType,
      id: row.id,
      name: row.name,
      categoryId: row.categoryId ?? "",
      cost: String(row.cost || ""),
      costType: row.costType,
      salePrice: String(row.salePrice || ""),
      duration: String(row.duration ?? 60)
    });

  const persist = (next: Partial<AppState["config"]>) =>
    setState({ ...state, config: { ...state.config, ...next } });

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim()) return onToast("El nombre es obligatorio");
    const cost = Number(draft.cost) || 0;
    const salePrice = Number(draft.salePrice) || 0;
    const categoryId = draft.categoryId || undefined;

    if (draft.itemType === "service") {
      const duration = Math.max(5, Number(draft.duration) || 60);
      if (draft.mode === "create") {
        const item: ServiceItem = {
          id: draft.id, name: draft.name.trim(), basePrice: salePrice, duration,
          depositRequired: false, depositAmount: 0, categoryId, cost, costType: draft.costType
        };
        persist({ services: [...services, item] });
      } else {
        persist({
          services: services.map((s) => s.id === draft.id
            ? { ...s, name: draft.name.trim(), basePrice: salePrice, duration, categoryId, cost, costType: draft.costType }
            : s)
        });
      }
    } else {
      if (draft.mode === "create") {
        const item: ProductItem = { id: draft.id, name: draft.name.trim(), categoryId, cost, costType: draft.costType, salePrice };
        persist({ products: [...products, item] });
      } else {
        persist({
          products: products.map((p) => p.id === draft.id
            ? { ...p, name: draft.name.trim(), categoryId, cost, costType: draft.costType, salePrice }
            : p)
        });
      }
    }
    onToast(draft.mode === "create" ? "Agregado al catálogo" : "Cambios guardados");
    setDraft(null);
  };

  // P4: eliminar vive dentro de la ventana de detalle (no como acción de tabla).
  const removeFromDraft = () => {
    if (!draft || draft.mode !== "edit") return;
    if (!confirm(`¿Eliminar "${draft.name}" del catálogo?`)) return;
    if (draft.itemType === "service") {
      persist({ services: services.filter((s) => s.id !== draft.id) });
      // #B: desactivar en la tabla normalizada (active=false) para que no reaparezca
      // al recargar. La fila se conserva (citas viejas la referencian por nombre).
      if (businessId) {
        const serviceId = draft.id;
        void databaseService
          .deactivateService(businessId, serviceId)
          .catch((error) => monitoringService.captureError(error, "service.deactivate", { businessId, serviceId }));
      }
    } else {
      persist({ products: products.filter((p) => p.id !== draft.id) });
      // #C: desactivar el producto en la tabla normalizada para que no reaparezca.
      if (businessId) {
        const productId = draft.id;
        void databaseService
          .deactivateProduct(businessId, productId)
          .catch((error) => monitoringService.captureError(error, "product.deactivate", { businessId, productId }));
      }
    }
    setDraft(null);
    onToast("Eliminado del catálogo");
  };

  // ── Categorías ──────────────────────────────────────────────────────────────
  const saveCategory = () => {
    const name = newCatName.trim();
    if (!name) return onToast("Nombre de categoría obligatorio");
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return onToast("Esa categoría ya existe");
    }
    const cat: CatalogCategory = { id: uid("cat-grp"), name };
    persist({ categories: [...categories, cat] });
    if (draft) setDraft({ ...draft, categoryId: cat.id });
    setNewCatName("");
    setCatModalOpen(false);
    onToast("Categoría creada");
  };

  // ── Importar / exportar CSV ──────────────────────────────────────────────────
  const exportCsv = () => {
    const header = ["tipo", "nombre", "categoria", "costo", "tipo_costo", "precio_venta", "duracion_min"];
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) => [
      r.itemType === "service" ? "servicio" : "producto",
      r.name,
      categoryName(r.categoryId),
      r.cost,
      COST_LABEL[r.costType],
      r.salePrice,
      r.duration ?? ""
    ].map(esc).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast("Catálogo exportado");
  };

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };

  const handleImport = async (file: File) => {
    try {
      const text = (await file.text()).replace(/^﻿/, "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) return onToast("El archivo está vacío");
      const start = /tipo|nombre/i.test(lines[0]) ? 1 : 0;

      const nextCategories = [...categories];
      const findOrCreateCat = (name: string): string | undefined => {
        const clean = name.trim();
        if (!clean || /sin categor/i.test(clean)) return undefined;
        const found = nextCategories.find((c) => c.name.toLowerCase() === clean.toLowerCase());
        if (found) return found.id;
        const cat: CatalogCategory = { id: uid("cat-grp"), name: clean };
        nextCategories.push(cat);
        return cat.id;
      };

      const newServices: ServiceItem[] = [];
      const newProducts: ProductItem[] = [];
      for (let i = start; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const name = (cols[1] ?? "").trim();
        if (!name) continue;
        const isService = /serv/i.test(cols[0] ?? "");
        const categoryId = findOrCreateCat(cols[2] ?? "");
        const cost = Number(cols[3]) || 0;
        const costType: CostType = /brut|gross/i.test(cols[4] ?? "") ? "gross" : "net";
        const salePrice = Number(cols[5]) || 0;
        if (isService) {
          newServices.push({
            id: uid("cat"), name, basePrice: salePrice, duration: Math.max(5, Number(cols[6]) || 60),
            depositRequired: false, depositAmount: 0, categoryId, cost, costType
          });
        } else {
          newProducts.push({ id: uid("cat"), name, categoryId, cost, costType, salePrice });
        }
      }
      if (!newServices.length && !newProducts.length) return onToast("No se encontraron filas válidas");
      persist({
        categories: nextCategories,
        services: [...services, ...newServices],
        products: [...products, ...newProducts]
      });
      onToast(`Importados ${newServices.length + newProducts.length} ítems`);
    } catch {
      onToast("No se pudo leer el archivo CSV");
    }
  };

  const draftCost = draft ? Number(draft.cost) || 0 : 0;
  const draftPrice = draft ? Number(draft.salePrice) || 0 : 0;
  const draftMargin = draftPrice - draftCost;

  return (
    <section>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = ""; }}
      />

      <div className="j-stat-strip">
        <div className="j-stat">
          <div className="j-stat-l">Servicios</div>
          <div className="j-stat-v">{services.length}</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-l">Productos</div>
          <div className="j-stat-v">{products.length}</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-l">Categorías</div>
          <div className="j-stat-v">{categories.length}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button className="j-btn" onClick={() => fileRef.current?.click()}>
            <Upload size={13} strokeWidth={2.25} /> Importar
          </button>
          <button className="j-btn" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={13} strokeWidth={2.25} /> Exportar
          </button>
          <button className="j-btn j-btn-primary" onClick={startCreate}>
            <Plus size={13} strokeWidth={2.25} /> Nuevo
          </button>
        </div>
      </div>

      <div className="j-card" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="j-input"
          style={{ flex: "1 1 220px", minWidth: 180 }}
          placeholder="Buscar por nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="j-input" style={{ width: 150 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">Todos los tipos</option>
          <option value="service">Servicios</option>
          <option value="product">Productos</option>
        </select>
        <select className="j-input" style={{ width: 180 }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">Todas las categorías</option>
          <option value="">Sin categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="j-card">
        {rows.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty
              compact
              title="Catálogo vacío"
              description="Agrega tus productos y servicios. Los servicios aparecerán al agendar citas."
              action={<button className="j-btn j-btn-primary" onClick={startCreate}><Plus size={13} strokeWidth={2.25} /> Agregar ítem</button>}
            />
          </div>
        ) : visibleRows.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty compact title="Sin resultados" description="Ajusta la búsqueda o los filtros." />
          </div>
        ) : (
          <table className="j-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>
                  <button className="j-th-sort" onClick={() => toggleSort("name")}>Nombre <ArrowUpDown size={11} /></button>
                </th>
                <th>Categoría</th>
                <th className="num">Costo</th>
                <th className="num">
                  <button className="j-th-sort" onClick={() => toggleSort("salePrice")}>Precio <ArrowUpDown size={11} /></button>
                </th>
                <th className="num">
                  <button className="j-th-sort" onClick={() => toggleSort("margin")}>Margen <ArrowUpDown size={11} /></button>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {/* P4: filas de solo lectura; clic abre la ventana de detalle. */}
              {visibleRows.map((r) => {
                const margin = r.salePrice - r.cost;
                return (
                  <tr key={r.id} className="click" onClick={() => startEdit(r)} style={{ cursor: "pointer" }}>
                    <td>
                      <span className={"j-tag " + (r.itemType === "service" ? "dot pos" : "dot")}>
                        {r.itemType === "service" ? "Servicio" : "Producto"}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500, color: "var(--fg)" }}>
                      {r.name}
                      {r.itemType === "service" && r.duration ? (
                        <span style={{ color: "var(--fg-muted)", fontSize: 11.5, marginLeft: 6 }}>{r.duration} min</span>
                      ) : null}
                    </td>
                    <td style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{categoryName(r.categoryId)}</td>
                    <td className="num mono" style={{ color: "var(--fg-muted)" }}>
                      {r.cost ? `${formatCurrency(r.cost, currency)} ${COST_LABEL[r.costType]}` : "—"}
                    </td>
                    <td className="num mono">{formatCurrency(r.salePrice, currency)}</td>
                    <td className="num mono" style={{ color: margin >= 0 ? "var(--fg)" : "var(--neg)" }}>
                      {formatCurrency(margin, currency)}
                    </td>
                    <td className="num"><ChevronRight size={15} style={{ color: "var(--fg-muted)" }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal crear / editar */}
      {draft && (
        <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="j-modal">
            <div className="j-modal-head">
              <h2>{draft.mode === "create" ? "Nuevo ítem" : "Editar ítem"}</h2>
              <button className="j-btn-ghost" onClick={() => setDraft(null)} style={{ padding: 6 }}><X size={16} /></button>
            </div>
            <div className="j-modal-body">
              <div className="j-field" style={{ marginBottom: 14 }}>
                <div className="j-field-label">Tipo</div>
                <div className="j-seg">
                  <button
                    type="button"
                    className={draft.itemType === "service" ? "active" : ""}
                    disabled={draft.mode === "edit"}
                    onClick={() => setDraft({ ...draft, itemType: "service" })}
                  >Servicio</button>
                  <button
                    type="button"
                    className={draft.itemType === "product" ? "active" : ""}
                    disabled={draft.mode === "edit"}
                    onClick={() => setDraft({ ...draft, itemType: "product" })}
                  >Producto</button>
                </div>
                {draft.mode === "edit" && (
                  <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 6 }}>El tipo no se puede cambiar después de crear.</div>
                )}
              </div>

              <div className="j-field" style={{ marginBottom: 14 }}>
                <div className="j-field-label">Nombre</div>
                <input className="j-input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={draft.itemType === "service" ? "Ej. Corte de cabello" : "Ej. Shampoo 500ml"} />
              </div>

              <div className="j-field" style={{ marginBottom: 14 }}>
                <div className="j-field-label">Categoría</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="j-input" style={{ flex: 1 }} value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                    <option value="">Sin categoría</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button className="j-btn" onClick={() => { setNewCatName(""); setCatModalOpen(true); }}>
                    <Plus size={13} strokeWidth={2.25} /> Nueva
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: draft.itemType === "service" ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12 }}>
                <div className="j-field">
                  <div className="j-field-label">Costo</div>
                  <input className="j-input mono" type="number" min="0" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} placeholder="0" />
                  <div className="j-seg" style={{ marginTop: 8 }}>
                    <button type="button" className={draft.costType === "net" ? "active" : ""} onClick={() => setDraft({ ...draft, costType: "net" })}>Neto</button>
                    <button type="button" className={draft.costType === "gross" ? "active" : ""} onClick={() => setDraft({ ...draft, costType: "gross" })}>Bruto</button>
                  </div>
                </div>
                <div className="j-field">
                  <div className="j-field-label">Precio de venta</div>
                  <input className="j-input mono" type="number" min="0" value={draft.salePrice} onChange={(e) => setDraft({ ...draft, salePrice: e.target.value })} placeholder="0" />
                </div>
                {draft.itemType === "service" && (
                  <div className="j-field">
                    <div className="j-field-label">Duración (min)</div>
                    <input className="j-input mono" type="number" min="5" step="5" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} placeholder="60" />
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--fg-muted)" }}>
                Margen estimado: <span className="mono" style={{ color: draftMargin >= 0 ? "var(--fg)" : "var(--neg)", fontWeight: 600 }}>{formatCurrency(draftMargin, currency)}</span>
              </div>
            </div>
            <div className="j-modal-foot" style={{ gap: 8 }}>
              {draft.mode === "edit" && (
                <button className="j-btn" onClick={removeFromDraft} style={{ color: "var(--neg)" }}>
                  <Trash2 size={13} /> Eliminar
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button className="j-btn" onClick={() => setDraft(null)}>Cancelar</button>
                <button className="j-btn j-btn-primary" onClick={saveDraft}>
                  <Check size={13} strokeWidth={2.25} /> Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal secundario: nueva categoría */}
      {catModalOpen && (
        <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setCatModalOpen(false); }}>
          <div className="j-modal sm">
            <div className="j-modal-head">
              <h2>Nueva categoría</h2>
              <button className="j-btn-ghost" onClick={() => setCatModalOpen(false)} style={{ padding: 6 }}><X size={16} /></button>
            </div>
            <div className="j-modal-body">
              <div className="j-field">
                <div className="j-field-label">Nombre de categoría</div>
                <input
                  className="j-input"
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCategory(); }}
                  placeholder="Ej. Cuidado capilar"
                />
              </div>
            </div>
            <div className="j-modal-foot">
              <button className="j-btn" onClick={() => setCatModalOpen(false)}>Cancelar</button>
              <button className="j-btn j-btn-primary" onClick={saveCategory}>
                <Check size={13} strokeWidth={2.25} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
