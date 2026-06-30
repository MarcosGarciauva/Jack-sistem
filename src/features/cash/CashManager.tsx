// ════════════════════════════════════════════════════════════════════════════
// Jack — Corte de caja v2 (Análisis, P5/P7)
// ════════════════════════════════════════════════════════════════════════════
// El corte dejó de ser una CAPTURA a ciegas y ahora es un CONTEO verificado:
// el sistema ya sabe cuánto debió entrar por método (citas pagadas con método
// registrado + ventas de productos del día) y el usuario solo teclea lo que
// contó físicamente. Flujo en 3 pasos:
//   1) Resumen del día — citas pagadas, ventas de productos, total esperado y
//      saldo por cobrar.
//   2) Cuenta el dinero — una fila por método: Esperado | Contado | Diferencia.
//      Los cobros pagados SIN método registrado se muestran como fila aparte
//      (citas viejas o sin asignar); se corrigen desde el detalle de la cita.
//   3) Cierre — retiro de efectivo y notas. El retiro y el efectivo restante se
//      basan SOLO en el efectivo del cajón (tarjeta/transferencia no entran).
//
// El historial es clickeable: cada corte abre una ventana con la foto completa
// (desglose por método, ventas, retiro, notas) y desde ahí se elimina con
// confirmación en dos pasos (sin diálogo nativo del navegador).
//
// Persistencia: app_state.cashCuts (nivel raíz, fuera de config para no exponer
// datos financieros al sitio público). El "Total esperado" se calcula con citas
// paymentStatus === "paid" (regla del negocio) MÁS las ventas de productos.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { Check, Download, Lock, Trash2, X } from "lucide-react";
import { PaymentBadge, StatusBadge } from "../../components/Badge";
import { JEmpty } from "../../components/Editorial";
import { downloadExcel } from "../../lib/excelExport";
import { databaseService } from "../../services/databaseService";
import { monitoringService } from "../../services/monitoringService";
import { formatCurrency, formatLongDate, uid } from "../../lib/format";
import type { AppState, CashCut, Sale, SalePaymentMethod } from "../../types";

type Tab = "today" | "history";

const num = (s: string) => Number(s) || 0;

const METHOD_LABELS: Record<SalePaymentMethod, string> = {
  cash: "Efectivo",
  card_credit: "Tarjeta de crédito",
  card_debit: "Tarjeta de débito",
  transfer: "Transferencia"
};
const saleItemsSummary = (sale: Sale) =>
  sale.items.map((i) => `${i.qty}× ${i.productName}`).join(", ");

const diffColor = (d: number) => (d < 0 ? "var(--neg)" : d > 0 ? "var(--pos)" : "var(--fg-muted)");
const signed = (d: number, currency: string) => `${d > 0 ? "+" : ""}${formatCurrency(d, currency)}`;

export function CashManager({
  businessId,
  state,
  setState,
  today,
  closedBy,
  onToast
}: {
  businessId: string;
  state: AppState;
  setState: (s: AppState) => void;
  today: string;
  closedBy: string;
  onToast: (msg: string) => void;
}) {
  const currency = state.config.currency;
  const cuts = state.cashCuts ?? [];

  const [tab, setTab] = useState<Tab>("today");
  const [day, setDay] = useState(today);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Historial: corte abierto en la ventana de detalle + confirmación de borrado en 2 pasos.
  const [detailCut, setDetailCut] = useState<CashCut | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  // Paso 2 · conteo por método de pago
  const [cash, setCash] = useState("");
  const [credit, setCredit] = useState("");
  const [debit, setDebit] = useState("");
  const [transfer, setTransfer] = useState("");
  // Paso 3 · cierre
  const [withdrawal, setWithdrawal] = useState("");
  const [notes, setNotes] = useState("");

  const clientName = useMemo(() => {
    const map = new Map(state.clients.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? "Sin cliente";
  }, [state.clients]);
  const employeeName = useMemo(() => {
    const map = new Map(state.employees.map((e) => [e.id, e.name]));
    return (id: string) => map.get(id) ?? "";
  }, [state.employees]);

  // ── Día seleccionado: citas + ventas de productos ───────────────────────────
  const dayRows = useMemo(
    () => state.appointments.filter((a) => a.date === day).sort((a, b) => a.time.localeCompare(b.time)),
    [state.appointments, day]
  );
  const daySales = useMemo(
    () => (state.sales ?? []).filter((s) => s.date === day).sort((a, b) => a.time.localeCompare(b.time)),
    [state.sales, day]
  );

  const paidRows = dayRows.filter((a) => a.paymentStatus === "paid");
  const apptExpected = paidRows.reduce((sum, a) => sum + (a.paidAmount || a.price), 0);
  const paidCount = paidRows.length;
  const salesTotal = daySales.reduce((sum, s) => sum + s.total, 0);
  const expectedTotal = apptExpected + salesTotal;
  const pendingBalance = dayRows
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + Math.max(a.price - a.paidAmount, 0), 0);
  const movements = dayRows.length + daySales.length;

  // Esperado POR MÉTODO: citas pagadas con método registrado + ventas del día.
  // Lo pagado sin método (citas previas a v2) va a una fila aparte.
  const { expectedBy, expectedUnassigned } = useMemo(() => {
    const by: Record<SalePaymentMethod, number> = { cash: 0, card_credit: 0, card_debit: 0, transfer: 0 };
    let unassigned = 0;
    for (const a of paidRows) {
      const amount = a.paidAmount || a.price;
      if (a.paymentMethod) by[a.paymentMethod] += amount;
      else unassigned += amount;
    }
    for (const s of daySales) by[s.paymentMethod] += s.total;
    return { expectedBy: by, expectedUnassigned: unassigned };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.appointments, state.sales, day]);

  const existingCut = cuts.find((c) => c.date === day);

  // Al cambiar de día, precargar el conteo desde el corte guardado (si existe).
  useEffect(() => {
    const cut = cuts.find((c) => c.date === day);
    setCash(cut?.cashAmount != null ? String(cut.cashAmount) : "");
    setCredit(cut?.cardCredit != null ? String(cut.cardCredit) : "");
    setDebit(cut?.cardDebit != null ? String(cut.cardDebit) : "");
    setTransfer(cut?.transfer != null ? String(cut.transfer) : "");
    setWithdrawal(cut?.withdrawal != null ? String(cut.withdrawal) : "");
    setNotes(cut?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // ── Cálculos del conteo ──────────────────────────────────────────────────────
  const cashN = num(cash);
  const creditN = num(credit);
  const debitN = num(debit);
  const transferN = num(transfer);
  const totalReceived = cashN + creditN + debitN + transferN;
  const difference = totalReceived - expectedTotal; // negativo = faltante
  const shortfall = Math.max(-difference, 0);
  const surplus = Math.max(difference, 0);

  const withdrawalN = num(withdrawal);
  // Corrección de auditoría (#7): el retiro y el efectivo restante se basan SOLO en
  // el efectivo físico del cajón. Tarjeta y transferencia no entran a la caja, así
  // que no deben inflar el monto disponible para retirar.
  const cashRemaining = Math.max(cashN - withdrawalN, 0);

  const persist = (next: CashCut[]) => setState({ ...state, cashCuts: next });

  const confirmCut = () => {
    const cut: CashCut = {
      id: existingCut?.id ?? uid("cut"),
      date: day,
      closedAt: new Date().toISOString(),
      closedBy,
      openingFloat: 0,
      total: expectedTotal,
      paidCount,
      pendingBalance,
      movements,
      notes: notes.trim() || undefined,
      cashAmount: cashN,
      cardCredit: creditN,
      cardDebit: debitN,
      transfer: transferN,
      totalReceived,
      expectedTotal,
      difference,
      withdrawal: withdrawalN,
      cashRemaining,
      // v2 · foto del esperado por método (citas con método + ventas de productos)
      expectedCash: expectedBy.cash,
      expectedCardCredit: expectedBy.card_credit,
      expectedCardDebit: expectedBy.card_debit,
      expectedTransfer: expectedBy.transfer,
      expectedUnassigned,
      salesTotal,
      salesCount: daySales.length
    };
    const next = existingCut ? cuts.map((c) => (c.date === day ? cut : c)) : [...cuts, cut];
    persist(next);
    // #2: el corte persiste por fila (fuente de verdad); app_state queda como espejo.
    if (businessId) {
      void databaseService
        .upsertCashCut(businessId, cut)
        .catch((error) => monitoringService.captureError(error, "cashCut.upsert", { businessId, cutId: cut.id }));
    }
    setConfirmOpen(false);
    onToast(existingCut ? "Corte actualizado" : "Corte cerrado");
    setTab("history");
  };

  const removeCut = (cut: CashCut) => {
    persist(cuts.filter((c) => c.id !== cut.id));
    // #E: soft-delete por id en la tabla normalizada para que no reaparezca.
    if (businessId) {
      const cutId = cut.id;
      void databaseService
        .softDeleteCashCut(businessId, cutId)
        .catch((error) => monitoringService.captureError(error, "cashCut.softDelete", { businessId, cutId }));
    }
    setDetailCut(null);
    setDeleteArmed(false);
    onToast("Corte eliminado");
  };

  const exportDayDetail = () => {
    downloadExcel(`corte-${day}`, "Detalle de corte", [
      ...dayRows.map((a) => ({
        Hora: a.time,
        Concepto: clientName(a.clientId),
        Detalle: a.service,
        Precio: a.price,
        Pagado: a.paidAmount,
        Saldo: Math.max(a.price - a.paidAmount, 0),
        Método: a.paymentStatus === "paid" ? (a.paymentMethod ? METHOD_LABELS[a.paymentMethod] : "Sin método") : "",
        Pago: a.paymentStatus === "paid" ? "Pagado" : "Sin pagar",
        Estado: a.status,
        Empleado: employeeName(a.employeeId)
      })),
      ...daySales.map((s) => ({
        Hora: s.time,
        Concepto: "Venta de productos",
        Detalle: saleItemsSummary(s),
        Precio: s.total,
        Pagado: s.total,
        Saldo: 0,
        Método: METHOD_LABELS[s.paymentMethod],
        Pago: "Pagado",
        Estado: "venta",
        Empleado: s.employeeId ? employeeName(s.employeeId) : ""
      }))
    ]);
    onToast("Exportación descargada");
  };

  const exportHistory = () => {
    const rows = [...cuts]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((c) => ({
        Fecha: c.date,
        "Cerrado en": c.closedAt,
        Cerró: c.closedBy,
        Esperado: c.expectedTotal ?? c.total,
        Recibido: c.totalReceived ?? c.total,
        Efectivo: c.cashAmount ?? 0,
        Crédito: c.cardCredit ?? 0,
        Débito: c.cardDebit ?? 0,
        Transferencia: c.transfer ?? 0,
        Diferencia: c.difference ?? 0,
        Retiro: c.withdrawal ?? 0,
        "Efectivo restante": c.cashRemaining ?? 0,
        "Citas pagadas": c.paidCount,
        Ventas: c.salesCount ?? 0,
        "Total ventas": c.salesTotal ?? 0,
        "Saldo pendiente": c.pendingBalance,
        Movimientos: c.movements,
        Notas: c.notes ?? ""
      }));
    downloadExcel(`historial-cortes-${today}`, "Historial de cortes", rows);
    onToast("Exportación descargada");
  };

  const sortedCuts = useMemo(() => [...cuts].sort((a, b) => b.date.localeCompare(a.date)), [cuts]);

  const methodRows: { key: SalePaymentMethod; label: string; value: string; set: (v: string) => void }[] = [
    { key: "cash", label: METHOD_LABELS.cash, value: cash, set: setCash },
    { key: "card_credit", label: METHOD_LABELS.card_credit, value: credit, set: setCredit },
    { key: "card_debit", label: METHOD_LABELS.card_debit, value: debit, set: setDebit },
    { key: "transfer", label: METHOD_LABELS.transfer, value: transfer, set: setTransfer }
  ];

  // Desglose por método de un corte guardado (para la ventana de detalle del
  // historial). Cortes viejos no tienen esperado por método → se muestra "—".
  const detailMethodRows = (c: CashCut) => [
    { label: METHOD_LABELS.cash, expected: c.expectedCash, counted: c.cashAmount ?? 0 },
    { label: METHOD_LABELS.card_credit, expected: c.expectedCardCredit, counted: c.cardCredit ?? 0 },
    { label: METHOD_LABELS.card_debit, expected: c.expectedCardDebit, counted: c.cardDebit ?? 0 },
    { label: METHOD_LABELS.transfer, expected: c.expectedTransfer, counted: c.transfer ?? 0 }
  ];

  return (
    <div className="space-y-5">
      <div className="j-seg" style={{ width: "fit-content" }}>
        <button type="button" className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>
          Corte del día
        </button>
        <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          Historial {cuts.length > 0 ? `(${cuts.length})` : ""}
        </button>
      </div>

      {tab === "today" ? (
        <>
          <div className="j-card" style={{ padding: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div className="j-field" style={{ margin: 0 }}>
              <div className="j-field-label">Día del corte</div>
              <input
                className="j-input mono"
                type="date"
                value={day}
                max={today}
                onChange={(e) => setDay(e.target.value)}
                style={{ width: 180 }}
              />
            </div>
            {existingCut && (
              <span className="j-tag dot pos" style={{ alignSelf: "flex-end" }}>
                Cerrado el {formatLongDate(existingCut.date)}
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignSelf: "flex-end" }}>
              <button className="j-btn" onClick={exportDayDetail} disabled={dayRows.length === 0 && daySales.length === 0}>
                <Download size={13} strokeWidth={2.25} /> Exportar
              </button>
              <button className="j-btn j-btn-primary" onClick={() => setConfirmOpen(true)}>
                <Lock size={13} strokeWidth={2.25} /> {existingCut ? "Actualizar corte" : "Cerrar corte"}
              </button>
            </div>
          </div>

          {/* Paso 1 · Resumen del día */}
          <div className="j-kpis">
            <div className="j-kpi">
              <div className="j-kpi-label">Citas pagadas</div>
              <div className="j-kpi-value">{formatCurrency(apptExpected, currency)}</div>
              <div className="j-kpi-delta">{paidCount} cita(s) cobrada(s)</div>
            </div>
            <div className="j-kpi">
              <div className="j-kpi-label">Ventas de productos</div>
              <div className="j-kpi-value">{formatCurrency(salesTotal, currency)}</div>
              <div className="j-kpi-delta">{daySales.length} venta(s) del día</div>
            </div>
            <div className="j-kpi">
              <div className="j-kpi-label">Total esperado</div>
              <div className="j-kpi-value">{formatCurrency(expectedTotal, currency)}</div>
              <div className="j-kpi-delta">Citas + ventas del día</div>
            </div>
            <div className="j-kpi">
              <div className="j-kpi-label">Saldo por cobrar (citas)</div>
              <div className="j-kpi-value">{formatCurrency(pendingBalance, currency)}</div>
              <div className="j-kpi-delta">Citas sin pagar del día</div>
            </div>
          </div>

          {/* Paso 2 · Conteo verificado por método */}
          <section className="j-card">
            <div className="j-card-head">
              <h3>Cuenta el dinero</h3>
              <span className="sub">— teclea lo contado por método; el esperado ya lo sabe el sistema</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="j-table">
                <thead>
                  <tr>
                    <th>Método</th>
                    <th className="num">Esperado</th>
                    <th className="num">Contado</th>
                    <th className="num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {methodRows.map((row) => {
                    const expected = expectedBy[row.key];
                    const counted = num(row.value);
                    const diff = counted - expected;
                    return (
                      <tr key={row.key}>
                        <td style={{ fontWeight: 500 }}>{row.label}</td>
                        <td className="num mono" style={{ color: "var(--fg-muted)" }}>{formatCurrency(expected, currency)}</td>
                        <td className="num">
                          <input
                            className="j-input mono"
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.value}
                            onChange={(e) => row.set(e.target.value)}
                            placeholder="0"
                            aria-label={`Contado en ${row.label}`}
                            style={{ width: 130, marginLeft: "auto", textAlign: "right" }}
                          />
                        </td>
                        <td className="num mono" style={{ color: diffColor(diff), fontWeight: diff !== 0 ? 600 : 400 }}>
                          {signed(diff, currency)}
                        </td>
                      </tr>
                    );
                  })}
                  {expectedUnassigned > 0 && (
                    <tr>
                      <td style={{ color: "var(--fg-muted)" }}>Sin método registrado</td>
                      <td className="num mono" style={{ color: "var(--fg-muted)" }}>{formatCurrency(expectedUnassigned, currency)}</td>
                      <td className="num" style={{ color: "var(--fg-subtle)", fontSize: 12 }}>—</td>
                      <td className="num" style={{ color: "var(--fg-subtle)", fontSize: 12 }}>—</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--fg)" }}>
                    <td style={{ fontWeight: 600 }}>Total recibido</td>
                    <td className="num mono" style={{ fontWeight: 600 }}>{formatCurrency(expectedTotal, currency)}</td>
                    <td className="num mono" style={{ fontWeight: 600 }}>{formatCurrency(totalReceived, currency)}</td>
                    <td className="num mono" style={{ color: diffColor(difference), fontWeight: 700 }}>
                      {signed(difference, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {expectedUnassigned > 0 && (
              <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--fg-muted)" }}>
                Hay <strong style={{ color: "var(--fg)" }}>{formatCurrency(expectedUnassigned, currency)}</strong> cobrados sin
                método registrado (citas pagadas antes de elegir método). Cuenta ese dinero donde corresponda y, si puedes,
                asigna el método desde el detalle de cada cita para que el corte cuadre por método.
              </div>
            )}
          </section>

          {shortfall > 0 && (
            <div className="j-card" style={{ padding: "12px 16px", borderLeft: "3px solid var(--neg)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--fg)" }}>
                <strong>Falta dinero:</strong> lo contado es menor a lo esperado del día.
              </span>
              <span className="mono" style={{ fontWeight: 700, color: "var(--neg)" }}>{formatCurrency(shortfall, currency)}</span>
            </div>
          )}
          {surplus > 0 && (
            <div className="j-card" style={{ padding: "12px 16px", borderLeft: "3px solid var(--pos)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--fg)" }}>
                <strong>Sobra dinero:</strong> contaste más de lo esperado del día.
              </span>
              <span className="mono" style={{ fontWeight: 700, color: "var(--pos)" }}>+{formatCurrency(surplus, currency)}</span>
            </div>
          )}

          {/* Detalle del día: citas + ventas de productos */}
          <section className="j-card">
            <div className="j-card-head">
              <h3>Detalle del día</h3>
              <span className="sub">— {formatLongDate(day)}</span>
            </div>
            {dayRows.length === 0 && daySales.length === 0 ? (
              <div style={{ padding: 28 }}>
                <JEmpty compact title="Sin movimientos" description="No hay citas ni ventas para este día. Los cobros aparecerán aquí." />
              </div>
            ) : (
              <>
                {dayRows.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="j-table">
                      <thead>
                        <tr>
                          <th>Hora</th>
                          <th>Cliente</th>
                          <th>Servicio</th>
                          <th className="num">Precio</th>
                          <th className="num">Pagado</th>
                          <th className="num">Saldo</th>
                          <th>Método</th>
                          <th>Pago</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayRows.map((a) => (
                          <tr key={a.id}>
                            <td className="mono">{a.time}</td>
                            <td>{clientName(a.clientId)}</td>
                            <td style={{ fontWeight: 500 }}>{a.service}</td>
                            <td className="num mono">{formatCurrency(a.price, currency)}</td>
                            <td className="num mono">{formatCurrency(a.paidAmount, currency)}</td>
                            <td className="num mono">{formatCurrency(Math.max(a.price - a.paidAmount, 0), currency)}</td>
                            <td style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                              {a.paymentStatus === "paid" ? (a.paymentMethod ? METHOD_LABELS[a.paymentMethod] : "Sin método") : "—"}
                            </td>
                            <td><PaymentBadge status={a.paymentStatus} /></td>
                            <td><StatusBadge status={a.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {daySales.length > 0 && (
                  <>
                    <div className="j-card-head" style={{ borderTop: dayRows.length > 0 ? "1px solid var(--border)" : "none" }}>
                      <h3 style={{ fontSize: 13.5 }}>Ventas de productos</h3>
                      <span className="sub">— {daySales.length} venta(s) · {formatCurrency(salesTotal, currency)}</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="j-table">
                        <thead>
                          <tr>
                            <th>Hora</th>
                            <th>Productos</th>
                            <th>Método</th>
                            <th>Empleado</th>
                            <th className="num">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {daySales.map((s) => (
                            <tr key={s.id}>
                              <td className="mono">{s.time}</td>
                              <td style={{ fontWeight: 500, maxWidth: 320 }}>{saleItemsSummary(s)}</td>
                              <td style={{ fontSize: 12, color: "var(--fg-muted)" }}>{METHOD_LABELS[s.paymentMethod]}</td>
                              <td style={{ fontSize: 12, color: "var(--fg-muted)" }}>{s.employeeId ? employeeName(s.employeeId) : "—"}</td>
                              <td className="num mono">{formatCurrency(s.total, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <section className="j-card">
          <div className="j-card-head">
            <h3>Historial de cortes</h3>
            <span className="sub">— {cuts.length} cierres · toca un corte para ver el detalle</span>
            <div style={{ marginLeft: "auto" }}>
              <button className="j-btn" onClick={exportHistory} disabled={cuts.length === 0}>
                <Download size={13} strokeWidth={2.25} /> Exportar historial
              </button>
            </div>
          </div>
          {cuts.length === 0 ? (
            <div style={{ padding: 28 }}>
              <JEmpty compact title="Sin cortes guardados" description="Cierra un corte del día para empezar a llevar el historial." />
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="j-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cerró</th>
                    <th className="num">Esperado</th>
                    <th className="num">Recibido</th>
                    <th className="num">Diferencia</th>
                    <th className="num">Retiro</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCuts.map((c) => {
                    const received = c.totalReceived ?? c.total;
                    const expected = c.expectedTotal ?? c.total;
                    const diff = c.difference ?? received - expected;
                    return (
                      <tr
                        key={c.id}
                        className="click"
                        onClick={() => { setDetailCut(c); setDeleteArmed(false); }}
                      >
                        <td style={{ fontWeight: 500 }}>{formatLongDate(c.date)}</td>
                        <td style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{c.closedBy}</td>
                        <td className="num mono">{formatCurrency(expected, currency)}</td>
                        <td className="num mono">{formatCurrency(received, currency)}</td>
                        <td className="num mono" style={{ color: diffColor(diff) }}>{signed(diff, currency)}</td>
                        <td className="num mono" style={{ color: "var(--fg-muted)" }}>{formatCurrency(c.withdrawal ?? 0, currency)}</td>
                        <td style={{ color: "var(--fg-muted)", fontSize: 12.5, maxWidth: 220 }}>{c.notes ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Historial · detalle de un corte cerrado */}
      {detailCut && (
        <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailCut(null); }}>
          <div className="j-modal">
            <div className="j-modal-head">
              <div>
                <p className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--fg-muted)", margin: 0 }}>
                  Corte de caja · cerró {detailCut.closedBy}
                </p>
                <h2 style={{ margin: "2px 0 0", textTransform: "capitalize" }}>{formatLongDate(detailCut.date)}</h2>
              </div>
              <button className="j-btn-ghost" onClick={() => setDetailCut(null)} aria-label="Cerrar" style={{ padding: 6 }}><X size={16} /></button>
            </div>
            <div className="j-modal-body">
              {(() => {
                const received = detailCut.totalReceived ?? detailCut.total;
                const expected = detailCut.expectedTotal ?? detailCut.total;
                const diff = detailCut.difference ?? received - expected;
                return (
                  <div className="j-stat-strip" style={{ marginBottom: 16 }}>
                    <div className="j-stat">
                      <div className="j-stat-l">Esperado</div>
                      <div className="j-stat-v mono">{formatCurrency(expected, currency)}</div>
                    </div>
                    <div className="j-stat">
                      <div className="j-stat-l">Recibido</div>
                      <div className="j-stat-v mono">{formatCurrency(received, currency)}</div>
                    </div>
                    <div className="j-stat">
                      <div className="j-stat-l">Diferencia</div>
                      <div className="j-stat-v mono" style={{ color: diffColor(diff) }}>{signed(diff, currency)}</div>
                    </div>
                  </div>
                );
              })()}

              <table className="j-table" style={{ marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th>Método</th>
                    <th className="num">Esperado</th>
                    <th className="num">Contado</th>
                    <th className="num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {detailMethodRows(detailCut).map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="num mono" style={{ color: "var(--fg-muted)" }}>
                        {row.expected != null ? formatCurrency(row.expected, currency) : "—"}
                      </td>
                      <td className="num mono">{formatCurrency(row.counted, currency)}</td>
                      <td className="num mono" style={{ color: row.expected != null ? diffColor(row.counted - row.expected) : "var(--fg-subtle)" }}>
                        {row.expected != null ? signed(row.counted - row.expected, currency) : "—"}
                      </td>
                    </tr>
                  ))}
                  {(detailCut.expectedUnassigned ?? 0) > 0 && (
                    <tr>
                      <td style={{ color: "var(--fg-muted)" }}>Sin método registrado</td>
                      <td className="num mono" style={{ color: "var(--fg-muted)" }}>{formatCurrency(detailCut.expectedUnassigned ?? 0, currency)}</td>
                      <td className="num" style={{ color: "var(--fg-subtle)" }}>—</td>
                      <td className="num" style={{ color: "var(--fg-subtle)" }}>—</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="j-stat-strip" style={{ marginBottom: 16 }}>
                <div className="j-stat">
                  <div className="j-stat-l">Retiro</div>
                  <div className="j-stat-v mono">{formatCurrency(detailCut.withdrawal ?? 0, currency)}</div>
                </div>
                <div className="j-stat">
                  <div className="j-stat-l">Efectivo restante</div>
                  <div className="j-stat-v mono">{formatCurrency(detailCut.cashRemaining ?? 0, currency)}</div>
                </div>
                <div className="j-stat">
                  <div className="j-stat-l">Saldo por cobrar</div>
                  <div className="j-stat-v mono">{formatCurrency(detailCut.pendingBalance, currency)}</div>
                </div>
              </div>

              <div style={{ fontSize: 12.5, color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                <span>
                  {detailCut.paidCount} cita(s) pagada(s)
                  {detailCut.salesCount != null && <> · {detailCut.salesCount} venta(s) de productos ({formatCurrency(detailCut.salesTotal ?? 0, currency)})</>}
                  {" · "}{detailCut.movements} movimiento(s)
                </span>
                {detailCut.notes && (
                  <span><strong style={{ color: "var(--fg)" }}>Notas:</strong> {detailCut.notes}</span>
                )}
              </div>
            </div>
            <div className="j-modal-foot" style={{ flexWrap: "wrap", gap: 8 }}>
              <button
                className="j-btn"
                style={{ color: "var(--neg)" }}
                onClick={() => (deleteArmed ? removeCut(detailCut) : setDeleteArmed(true))}
              >
                <Trash2 size={14} /> {deleteArmed ? "¿Seguro? Eliminar definitivamente" : "Eliminar corte"}
              </button>
              <div style={{ marginLeft: "auto" }}>
                <button className="j-btn" onClick={() => setDetailCut(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paso 3 · Cierre con retiro de caja */}
      {confirmOpen && (
        <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
          <div className="j-modal">
            <div className="j-modal-head">
              <h2>{existingCut ? "Actualizar corte" : "Cerrar corte"}</h2>
              <button className="j-btn-ghost" onClick={() => setConfirmOpen(false)} style={{ padding: 6 }}><X size={16} /></button>
            </div>
            <div className="j-modal-body">
              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 14 }}>
                Cierre de <strong style={{ color: "var(--fg)" }}>{formatLongDate(day)}</strong>. Indica cuánto efectivo retiras del cajón; el resto queda como efectivo restante. (Tarjeta y transferencia no entran a la caja.)
              </p>

              <div className="j-stat-strip" style={{ marginBottom: 16 }}>
                <div className="j-stat">
                  <div className="j-stat-l">Total recibido</div>
                  <div className="j-stat-v mono">{formatCurrency(totalReceived, currency)}</div>
                </div>
                <div className="j-stat">
                  <div className="j-stat-l">Efectivo en caja</div>
                  <div className="j-stat-v mono">{formatCurrency(cashN, currency)}</div>
                </div>
                <div className="j-stat">
                  <div className="j-stat-l">Monto a retirar</div>
                  <div className="j-stat-v mono">{formatCurrency(withdrawalN, currency)}</div>
                </div>
                <div className="j-stat">
                  <div className="j-stat-l">Efectivo restante</div>
                  <div className="j-stat-v mono">{formatCurrency(cashRemaining, currency)}</div>
                </div>
              </div>

              {difference !== 0 && (
                <div style={{ fontSize: 12.5, marginBottom: 14, color: difference < 0 ? "var(--neg)" : "var(--pos)" }}>
                  {difference < 0
                    ? `Atención: faltan ${formatCurrency(shortfall, currency)} respecto a lo esperado.`
                    : `Hay un excedente de ${formatCurrency(surplus, currency)} respecto a lo esperado.`}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                <div className="j-field">
                  <div className="j-field-label">Monto a retirar en efectivo (0 si no retiras)</div>
                  <input
                    className="j-input mono"
                    type="number"
                    min="0"
                    max={cashN}
                    step="0.01"
                    value={withdrawal}
                    onChange={(e) => setWithdrawal(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="j-field">
                  <div className="j-field-label">Notas (opcional)</div>
                  <textarea className="j-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diferencias, observaciones del día…" />
                </div>
              </div>
            </div>
            <div className="j-modal-foot">
              <button className="j-btn" onClick={() => setConfirmOpen(false)}>Cancelar</button>
              <button className="j-btn j-btn-primary" onClick={confirmCut}>
                <Check size={13} strokeWidth={2.25} /> {existingCut ? "Actualizar" : "Confirmar corte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
