// ════════════════════════════════════════════════════════════════════════════
// Jack — Corte de caja (Análisis, P5/P7)
// ════════════════════════════════════════════════════════════════════════════
// Dos vistas: "Corte del día" e "Historial". El corte del día se hace en 2 pasos:
//   1) Captura por método de pago (efectivo, crédito, débito, transferencia).
//      Se calcula automáticamente Total recibido, Total esperado (según citas
//      pagadas) y la Diferencia. Si falta dinero se muestra el monto pendiente
//      por cobrar; si sobra, el excedente. (P7: ya NO se captura fondo inicial.)
//   2) Pantalla de cierre: Efectivo en caja, Monto a retirar y Efectivo restante.
//      El retiro y el efectivo restante se basan SOLO en el efectivo del cajón
//      (tarjeta/transferencia no entran a la caja). Confirmar guarda una foto
//      completa del corte en el historial.
//
// Persistencia: app_state.cashCuts (nivel raíz, fuera de config para no exponer
// datos financieros al sitio público). El espejo normalizado es preparación
// futura (ver supabase/cash_cuts.sql). El "Total esperado" se calcula SOLO con
// citas marcadas como paymentStatus === "paid", según la regla del negocio.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { Check, Download, Lock, Trash2, X } from "lucide-react";
import { PaymentBadge, StatusBadge } from "../../components/Badge";
import { JEmpty } from "../../components/Editorial";
import { formatCurrency, formatLongDate, uid } from "../../lib/format";
import type { AppState, CashCut } from "../../types";

type Tab = "today" | "history";

function downloadCsv(filename: string, header: string[], lines: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.join(","), ...lines.map((row) => row.map(esc).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const num = (s: string) => Number(s) || 0;

export function CashManager({
  state,
  setState,
  today,
  closedBy,
  onToast
}: {
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

  // Paso 1 · captura por método de pago
  const [cash, setCash] = useState("");
  const [credit, setCredit] = useState("");
  const [debit, setDebit] = useState("");
  const [transfer, setTransfer] = useState("");
  // Paso 2 · cierre
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

  // ── Resumen del día seleccionado ────────────────────────────────────────────
  const dayRows = useMemo(
    () => state.appointments.filter((a) => a.date === day).sort((a, b) => a.time.localeCompare(b.time)),
    [state.appointments, day]
  );
  const paidRows = dayRows.filter((a) => a.paymentStatus === "paid");
  const expectedTotal = paidRows.reduce((sum, a) => sum + (a.paidAmount || a.price), 0);
  const paidCount = paidRows.length;
  const pendingBalance = dayRows
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + Math.max(a.price - a.paidAmount, 0), 0);
  const movements = dayRows.length;

  const existingCut = cuts.find((c) => c.date === day);

  // Al cambiar de día, precargar la captura desde el corte guardado (si existe).
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

  // ── Cálculos de la captura ───────────────────────────────────────────────────
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
      cashRemaining
    };
    const next = existingCut ? cuts.map((c) => (c.date === day ? cut : c)) : [...cuts, cut];
    persist(next);
    setConfirmOpen(false);
    onToast(existingCut ? "Corte actualizado" : "Corte cerrado");
    setTab("history");
  };

  const removeCut = (cut: CashCut) => {
    if (!confirm(`¿Eliminar el corte de ${formatLongDate(cut.date)}?`)) return;
    persist(cuts.filter((c) => c.id !== cut.id));
    onToast("Corte eliminado");
  };

  const exportDayDetail = () => {
    const lines = dayRows.map((a) => [
      a.time,
      clientName(a.clientId),
      a.service,
      a.price,
      a.paidAmount,
      Math.max(a.price - a.paidAmount, 0),
      a.paymentStatus === "paid" ? "pagado" : "sin pagar",
      a.status,
      employeeName(a.employeeId)
    ]);
    downloadCsv(
      `corte-${day}.csv`,
      ["hora", "cliente", "servicio", "precio", "pagado", "saldo", "pago", "estado", "empleado"],
      lines
    );
    onToast("Detalle exportado");
  };

  const exportHistory = () => {
    const lines = [...cuts]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((c) => [
        c.date,
        c.closedAt,
        c.closedBy,
        c.expectedTotal ?? c.total,
        c.totalReceived ?? c.total,
        c.cashAmount ?? 0,
        c.cardCredit ?? 0,
        c.cardDebit ?? 0,
        c.transfer ?? 0,
        c.difference ?? 0,
        c.withdrawal ?? 0,
        c.cashRemaining ?? 0,
        c.paidCount,
        c.pendingBalance,
        c.movements,
        c.notes ?? ""
      ]);
    downloadCsv(
      `historial-cortes-${today}.csv`,
      [
        "fecha", "cerrado_en", "cerro", "esperado", "recibido", "efectivo", "credito",
        "debito", "transferencia", "diferencia", "retiro", "efectivo_restante",
        "citas_pagadas", "saldo_pendiente", "movimientos", "notas"
      ],
      lines
    );
    onToast("Historial exportado");
  };

  const sortedCuts = useMemo(() => [...cuts].sort((a, b) => b.date.localeCompare(a.date)), [cuts]);

  const methodFields: { label: string; value: string; set: (v: string) => void }[] = [
    { label: "Efectivo", value: cash, set: setCash },
    { label: "Tarjeta de crédito", value: credit, set: setCredit },
    { label: "Tarjeta de débito", value: debit, set: setDebit },
    { label: "Transferencia", value: transfer, set: setTransfer }
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
              <button className="j-btn" onClick={exportDayDetail} disabled={dayRows.length === 0}>
                <Download size={13} strokeWidth={2.25} /> Exportar
              </button>
              <button className="j-btn j-btn-primary" onClick={() => setConfirmOpen(true)}>
                <Lock size={13} strokeWidth={2.25} /> {existingCut ? "Actualizar corte" : "Cerrar corte"}
              </button>
            </div>
          </div>

          {/* P7 · Captura por método de pago */}
          <section className="j-card">
            <div className="j-card-head">
              <h3>Dinero recibido</h3>
              <span className="sub">— captura lo cobrado por cada método</span>
            </div>
            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {methodFields.map((f) => (
                <div className="j-field" key={f.label}>
                  <div className="j-field-label">{f.label}</div>
                  <input
                    className="j-input mono"
                    type="number"
                    min="0"
                    step="0.01"
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* P7 · Reconciliación automática */}
          <div className="j-kpis">
            <div className="j-kpi">
              <div className="j-kpi-label">Total esperado</div>
              <div className="j-kpi-value">{formatCurrency(expectedTotal, currency)}</div>
              <div className="j-kpi-delta">{paidCount} cita(s) pagada(s)</div>
            </div>
            <div className="j-kpi">
              <div className="j-kpi-label">Total recibido</div>
              <div className="j-kpi-value">{formatCurrency(totalReceived, currency)}</div>
              <div className="j-kpi-delta">Suma de métodos</div>
            </div>
            <div className="j-kpi">
              <div className="j-kpi-label">Diferencia</div>
              <div className="j-kpi-value" style={{ color: difference < 0 ? "var(--neg)" : difference > 0 ? "var(--pos)" : "var(--fg)" }}>
                {difference > 0 ? "+" : ""}{formatCurrency(difference, currency)}
              </div>
              <div className={"j-kpi-delta " + (difference < 0 ? "down" : difference > 0 ? "up" : "")}>
                {difference < 0 ? "Falta dinero" : difference > 0 ? "Sobra dinero" : "La caja cuadra"}
              </div>
            </div>
            <div className="j-kpi">
              <div className="j-kpi-label">Saldo por cobrar (citas)</div>
              <div className="j-kpi-value">{formatCurrency(pendingBalance, currency)}</div>
              <div className="j-kpi-delta">Citas sin pagar del día</div>
            </div>
          </div>

          {shortfall > 0 && (
            <div className="j-card" style={{ padding: "12px 16px", borderLeft: "3px solid var(--neg)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--fg)" }}>
                <strong>Monto pendiente por cobrar:</strong> lo recibido es menor a lo esperado.
              </span>
              <span className="mono" style={{ fontWeight: 700, color: "var(--neg)" }}>{formatCurrency(shortfall, currency)}</span>
            </div>
          )}
          {surplus > 0 && (
            <div className="j-card" style={{ padding: "12px 16px", borderLeft: "3px solid var(--pos)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--fg)" }}>
                <strong>Excedente en caja:</strong> recibiste más de lo esperado.
              </span>
              <span className="mono" style={{ fontWeight: 700, color: "var(--pos)" }}>+{formatCurrency(surplus, currency)}</span>
            </div>
          )}

          <section className="j-card">
            <div className="j-card-head">
              <h3>Detalle del corte</h3>
              <span className="sub">— {formatLongDate(day)}</span>
            </div>
            {dayRows.length === 0 ? (
              <div style={{ padding: 28 }}>
                <JEmpty compact title="Sin movimientos" description="No hay citas agendadas para este día. Los cobros aparecerán aquí." />
              </div>
            ) : (
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
                        <td><PaymentBadge status={a.paymentStatus} /></td>
                        <td><StatusBadge status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="j-card">
          <div className="j-card-head">
            <h3>Historial de cortes</h3>
            <span className="sub">— {cuts.length} cierres</span>
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedCuts.map((c) => {
                    const received = c.totalReceived ?? c.total;
                    const expected = c.expectedTotal ?? c.total;
                    const diff = c.difference ?? received - expected;
                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{formatLongDate(c.date)}</td>
                        <td style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{c.closedBy}</td>
                        <td className="num mono">{formatCurrency(expected, currency)}</td>
                        <td className="num mono">{formatCurrency(received, currency)}</td>
                        <td className="num mono" style={{ color: diff < 0 ? "var(--neg)" : diff > 0 ? "var(--pos)" : "var(--fg-muted)" }}>
                          {diff > 0 ? "+" : ""}{formatCurrency(diff, currency)}
                        </td>
                        <td className="num mono" style={{ color: "var(--fg-muted)" }}>{formatCurrency(c.withdrawal ?? 0, currency)}</td>
                        <td style={{ color: "var(--fg-muted)", fontSize: 12.5, maxWidth: 220 }}>{c.notes ?? "—"}</td>
                        <td className="num">
                          <button className="j-btn-ghost" onClick={() => removeCut(c)} title="Eliminar" style={{ padding: 6, color: "var(--neg)" }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* P7 · Paso 2: pantalla de cierre con retiro de caja */}
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
