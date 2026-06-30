// ════════════════════════════════════════════════════════════════════════════
// Jack — Ventas directas de productos (pestaña dentro de Agenda)
// ════════════════════════════════════════════════════════════════════════════
// POS ligero: selecciona productos del catálogo, ajusta cantidades, elige
// método de pago y registra la venta. El historial vive en AppState.sales.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { JEmpty } from "../../components/Editorial";
import { formatCurrency, formatDate, todayISO, uid } from "../../lib/format";
import type { AppState, Employee, ProductItem, Sale, SaleItem, SalePaymentMethod } from "../../types";

const METHOD_LABELS: Record<SalePaymentMethod, string> = {
  cash: "Efectivo",
  card_credit: "Tarjeta crédito",
  card_debit: "Tarjeta débito",
  transfer: "Transferencia",
};

interface CartLine {
  product: ProductItem;
  qty: number;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ProductSalesView({
  state,
  onRegisterSale,
  currency,
  employeeId,
  employees,
  onToast,
}: {
  state: AppState;
  // #1: la venta persiste POR FILA (business_sales + stock por producto), no
  // reescribiendo app_state completo — así los empleados también pueden vender.
  onRegisterSale: (next: AppState, sale: Sale, stockChanges: { id: string; stock: number }[]) => void;
  currency: string;
  employeeId?: string;
  employees: Employee[];
  onToast: (msg: string) => void;
}) {
  const products = (state.config.products ?? []).filter((p) => p.salePrice > 0);
  const sales = state.sales ?? [];

  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<SalePaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(employeeId ?? "");

  const totalCart = useMemo(
    () => cart.reduce((acc, l) => acc + l.qty * l.product.salePrice, 0),
    [cart],
  );

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  function addToCart(product: ProductItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === productId ? { ...l, qty: l.qty + delta } : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  // Fija la cantidad escribiéndola directamente. Respeta el stock disponible si
  // el producto lo tiene definido. Un valor inválido o vacío se trata como 0
  // (se elimina la línea al perder el foco / registrar).
  function setQty(productId: string, raw: string) {
    const parsed = Math.floor(Number(raw));
    setCart((prev) =>
      prev.map((l) => {
        if (l.product.id !== productId) return l;
        let qty = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        if (l.product.stock !== undefined && qty > l.product.stock) {
          qty = l.product.stock;
        }
        return { ...l, qty };
      }),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function registerSale() {
    const validLines = cart.filter((l) => l.qty > 0);
    if (validLines.length === 0) {
      onToast("Agrega al menos un producto");
      return;
    }
    const items: SaleItem[] = validLines.map((l) => ({
      productId: l.product.id,
      productName: l.product.name,
      qty: l.qty,
      unitPrice: l.product.salePrice,
    }));

    const sale: Sale = {
      id: uid("sale"),
      date: todayISO(),
      time: nowTime(),
      items,
      total: totalCart,
      paymentMethod: method,
      employeeId: selectedEmployee || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    // Decrementar stock si el producto lo tiene definido; los cambios puntuales
    // se mandan aparte para persistirlos por fila en business_products.
    const stockChanges: { id: string; stock: number }[] = [];
    const updatedProducts = (state.config.products ?? []).map((p) => {
      const item = items.find((i) => i.productId === p.id);
      if (item && p.stock !== undefined) {
        const stock = Math.max(0, p.stock - item.qty);
        stockChanges.push({ id: p.id, stock });
        return { ...p, stock };
      }
      return p;
    });

    const next: AppState = {
      ...state,
      sales: [sale, ...sales],
      config: { ...state.config, products: updatedProducts },
    };
    onRegisterSale(next, sale, stockChanges);

    setCart([]);
    setNotes("");
    onToast(`Venta registrada — ${formatCurrency(totalCart, currency)}`);
  }

  const activeEmployees = employees.filter((e) => e.status === "active");

  return (
    <div className="space-y-6">
      {/* Layout: productos + carrito */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        {/* ── Productos disponibles ── */}
        <div className="j-card">
          <div className="j-card-head" style={{ paddingBottom: 12 }}>
            <div>
              <h3>Productos</h3>
              <p className="sub">Haz clic en un producto para agregarlo al carrito</p>
            </div>
            <input
              className="j-input"
              placeholder="Buscar producto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </div>
          <div className="j-card-body tight">
            {visibleProducts.length === 0 ? (
              <div style={{ padding: 24 }}>
                <JEmpty
                  icon="📦"
                  title="Sin productos"
                  description={
                    query
                      ? "No hay productos que coincidan con la búsqueda."
                      : "Agrega productos en Catálogo para poder venderlos aquí."
                  }
                />
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 12,
                  padding: 16,
                }}
              >
                {visibleProducts.map((p) => {
                  const inCart = cart.find((l) => l.product.id === p.id);
                  const lowStock =
                    p.stock !== undefined &&
                    p.lowStock !== undefined &&
                    p.stock <= p.lowStock;
                  const outOfStock = p.stock !== undefined && p.stock === 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(p)}
                      style={{
                        border: inCart
                          ? "2px solid var(--accent)"
                          : "1px solid var(--border)",
                        borderRadius: "var(--r-md)",
                        padding: "14px 12px",
                        background: outOfStock ? "var(--bg-sunken)" : "var(--bg-elev)",
                        cursor: outOfStock ? "not-allowed" : "pointer",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        transition: "border-color 0.15s, box-shadow 0.15s",
                        boxShadow: inCart ? "var(--shadow-sm)" : "none",
                        opacity: outOfStock ? 0.5 : 1,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--fg)",
                          lineHeight: 1.3,
                        }}
                      >
                        {p.name}
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--fg)",
                        }}
                      >
                        {formatCurrency(p.salePrice, currency)}
                      </span>
                      {p.stock !== undefined && (
                        <span
                          style={{
                            fontSize: 11,
                            color: outOfStock
                              ? "var(--neg)"
                              : lowStock
                                ? "var(--warn)"
                                : "var(--fg-subtle)",
                          }}
                        >
                          {outOfStock
                            ? "Sin stock"
                            : lowStock
                              ? `Stock bajo: ${p.stock}`
                              : `Stock: ${p.stock}`}
                        </span>
                      )}
                      {inCart && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--accent)",
                            fontWeight: 600,
                          }}
                        >
                          En carrito: {inCart.qty}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Carrito ── */}
        <div className="j-card" style={{ position: "sticky", top: 16 }}>
          <div className="j-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShoppingCart size={16} />
              <h3>Carrito</h3>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                className="j-btn j-btn-sm"
                onClick={() => setCart([])}
                title="Vaciar carrito"
              >
                <X size={13} /> Limpiar
              </button>
            )}
          </div>
          <div className="j-card-body tight">
            {cart.length === 0 ? (
              <div style={{ padding: "20px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
                  Sin productos. Haz clic en un producto para agregar.
                </p>
              </div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {cart.map((line) => (
                  <div
                    key={line.product.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 16px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {line.product.name}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                        {formatCurrency(line.product.salePrice, currency)} c/u
                      </p>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <button
                        type="button"
                        className="j-btn j-btn-sm"
                        style={{ padding: "4px 8px" }}
                        onClick={() => updateQty(line.product.id, -1)}
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={line.product.stock}
                        value={line.qty === 0 ? "" : line.qty}
                        onChange={(e) => setQty(line.product.id, e.target.value)}
                        onBlur={(e) => {
                          if (!e.target.value || Number(e.target.value) < 1) {
                            removeFromCart(line.product.id);
                          }
                        }}
                        aria-label={`Cantidad de ${line.product.name}`}
                        style={{
                          width: 44,
                          textAlign: "center",
                          fontSize: 13,
                          fontWeight: 600,
                          padding: "4px 2px",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--r-sm)",
                          background: "var(--bg-elev)",
                          color: "var(--fg)",
                          MozAppearance: "textfield",
                        }}
                      />
                      <button
                        type="button"
                        className="j-btn j-btn-sm"
                        style={{ padding: "4px 8px" }}
                        onClick={() => updateQty(line.product.id, 1)}
                        disabled={
                          line.product.stock !== undefined &&
                          line.qty >= line.product.stock
                        }
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        minWidth: 64,
                        textAlign: "right",
                      }}
                    >
                      {formatCurrency(line.qty * line.product.salePrice, currency)}
                    </span>
                    <button
                      type="button"
                      className="j-btn-ghost j-btn-sm"
                      style={{ padding: "4px 6px", color: "var(--neg)" }}
                      onClick={() => removeFromCart(line.product.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Total + opciones de pago */}
            <div style={{ padding: 16, borderTop: cart.length > 0 ? "1px solid var(--border)" : "none" }}>
              {cart.length > 0 && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>
                      {formatCurrency(totalCart, currency)}
                    </span>
                  </div>

                  {/* Método de pago */}
                  <div style={{ marginBottom: 12 }}>
                    <label
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Método de pago
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {(Object.keys(METHOD_LABELS) as SalePaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMethod(m)}
                          style={{
                            padding: "7px 8px",
                            borderRadius: "var(--r-sm)",
                            border:
                              method === m
                                ? "2px solid var(--accent)"
                                : "1px solid var(--border)",
                            background:
                              method === m ? "var(--accent)" : "var(--bg-elev)",
                            color: method === m ? "#fff" : "var(--fg)",
                            fontSize: 12,
                            fontWeight: method === m ? 600 : 400,
                            cursor: "pointer",
                            transition: "all 0.12s",
                          }}
                        >
                          {METHOD_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Empleado (opcional) */}
                  {activeEmployees.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <label
                        style={{
                          fontSize: 12,
                          color: "var(--fg-muted)",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        Empleado (opcional)
                      </label>
                      <select
                        className="j-input"
                        value={selectedEmployee}
                        onChange={(e) => setSelectedEmployee(e.target.value)}
                        style={{ fontSize: 13 }}
                      >
                        <option value="">— Sin asignar —</option>
                        {activeEmployees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Notas */}
                  <div style={{ marginBottom: 14 }}>
                    <label
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Notas (opcional)
                    </label>
                    <input
                      className="j-input"
                      placeholder="Cliente, referencia…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                </>
              )}

              <button
                type="button"
                className="j-btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={cart.length === 0}
                onClick={registerSale}
              >
                {cart.length === 0
                  ? "Agrega productos"
                  : `Registrar venta — ${formatCurrency(totalCart, currency)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Historial de ventas del día ── */}
      <SalesHistory sales={sales} currency={currency} employees={employees} />
    </div>
  );
}

// ─── Historial ────────────────────────────────────────────────────────────────

function SalesHistory({
  sales,
  currency,
  employees,
}: {
  sales: Sale[];
  currency: string;
  employees: Employee[];
}) {
  const today = todayISO();
  const todaySales = sales.filter((s) => s.date === today);
  const pastSales = sales.filter((s) => s.date !== today);

  const employeeById = new Map(employees.map((e) => [e.id, e]));

  if (sales.length === 0) {
    return (
      <div className="j-card">
        <div className="j-card-head">
          <h3>Historial de ventas</h3>
        </div>
        <div className="j-card-body">
          <JEmpty
            icon="🧾"
            title="Sin ventas registradas"
            description="Las ventas que registres aparecerán aquí."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {todaySales.length > 0 && (
        <SalesTable
          title="Ventas de hoy"
          sales={todaySales}
          currency={currency}
          employeeById={employeeById}
        />
      )}
      {pastSales.length > 0 && (
        <SalesTable
          title="Ventas anteriores"
          sales={pastSales}
          currency={currency}
          employeeById={employeeById}
        />
      )}
    </div>
  );
}

function SalesTable({
  title,
  sales,
  currency,
  employeeById,
}: {
  title: string;
  sales: Sale[];
  currency: string;
  employeeById: Map<string, { name: string }>;
}) {
  const total = sales.reduce((a, s) => a + s.total, 0);
  return (
    <div className="j-card">
      <div className="j-card-head">
        <h3>{title}</h3>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {formatCurrency(total, currency)} total
        </span>
      </div>
      <div className="j-card-body tight">
        <table className="j-table">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Fecha</th>
              <th>Productos</th>
              <th>Método</th>
              <th>Empleado</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td style={{ fontSize: 13 }}>{s.time}</td>
                <td style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                  {formatDate(s.date)}
                </td>
                <td style={{ fontSize: 13 }}>
                  {s.items
                    .map((i) => `${i.productName} ×${i.qty}`)
                    .join(", ")}
                </td>
                <td style={{ fontSize: 13 }}>
                  {METHOD_LABELS[s.paymentMethod]}
                </td>
                <td style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                  {s.employeeId
                    ? (employeeById.get(s.employeeId)?.name ?? "—")
                    : "—"}
                </td>
                <td
                  className="num"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {formatCurrency(s.total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
