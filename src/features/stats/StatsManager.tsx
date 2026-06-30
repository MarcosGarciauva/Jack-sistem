// ════════════════════════════════════════════════════════════════════════════
// Jack — Estadísticas (Análisis, P6 · v2)
// ════════════════════════════════════════════════════════════════════════════
// Filtros por periodo (Semana / Mes / Año) con comparativa contra el periodo
// anterior (KPI + línea punteada en la gráfica), toggle Línea/Barras, tendencia
// de ingresos, ranking de empleados, top de servicios y top de productos.
//
// Ingresos = citas con paymentStatus === "paid" (regla del negocio) MÁS las
// ventas de productos del módulo Ventas (state.sales). El margen se estima
// cruzando el servicio con config.services[].cost y cada producto vendido con
// config.products[].cost.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { RevenueChart } from "../../components/Charts";
import { JEmpty } from "../../components/Editorial";
import { downloadExcel } from "../../lib/excelExport";
import { formatCurrency } from "../../lib/format";
import type { AppState, Appointment, Sale } from "../../types";

type Period = "week" | "month" | "year";
type ChartType = "area" | "bar";

const PERIOD_LABEL: Record<Period, string> = { week: "Semana", month: "Mes", year: "Año" };
const PREV_LABEL: Record<Period, string> = { week: "semana anterior", month: "mes anterior", year: "año anterior" };
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAY_ABBR = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

const isoOf = (d: Date) => {
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

interface Bounds {
  startISO: string;
  endISO: string;
  prevStartISO: string;
  prevEndISO: string;
}

function periodBounds(period: Period, todayStr: string): Bounds {
  const today = new Date(`${todayStr}T12:00:00`);
  const y = today.getFullYear();
  const m = today.getMonth();
  if (period === "week") {
    // Semana CALENDARIO lunes–domingo (igual que el dashboard `revenueForCurrentWeek`),
    // para que "Ingresos semana" cuadre entre Dashboard y Estadísticas. (Antes eran
    // los últimos 7 días, una ventana móvil que daba una cifra distinta.)
    const dow = today.getDay() || 7; // lunes=1 … domingo=7
    const monday = new Date(today); monday.setDate(today.getDate() - dow + 1);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const prevMonday = new Date(monday); prevMonday.setDate(monday.getDate() - 7);
    const prevSunday = new Date(prevMonday); prevSunday.setDate(prevMonday.getDate() + 6);
    return { startISO: isoOf(monday), endISO: isoOf(sunday), prevStartISO: isoOf(prevMonday), prevEndISO: isoOf(prevSunday) };
  }
  if (period === "month") {
    return {
      startISO: isoOf(new Date(y, m, 1)),
      endISO: isoOf(new Date(y, m + 1, 0)),
      prevStartISO: isoOf(new Date(y, m - 1, 1)),
      prevEndISO: isoOf(new Date(y, m, 0))
    };
  }
  return {
    startISO: isoOf(new Date(y, 0, 1)),
    endISO: isoOf(new Date(y, 11, 31)),
    prevStartISO: isoOf(new Date(y - 1, 0, 1)),
    prevEndISO: isoOf(new Date(y - 1, 11, 31))
  };
}

const paidRevenue = (appts: Appointment[]) =>
  appts.filter((a) => a.paymentStatus === "paid").reduce((sum, a) => sum + (a.paidAmount || a.price), 0);

const salesRevenueOf = (sales: Sale[]) => sales.reduce((sum, s) => sum + s.total, 0);

export function StatsManager({ state, today }: { state: AppState; today: string }) {
  const currency = state.config.currency;
  const [period, setPeriod] = useState<Period>("month");
  const [chartType, setChartType] = useState<ChartType>("area");
  const bounds = useMemo(() => periodBounds(period, today), [period, today]);

  // Mapas de costo del catálogo (para estimar margen).
  const serviceCost = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of state.config.services ?? []) map.set(s.name, s.cost ?? 0);
    return map;
  }, [state.config.services]);
  const productCost = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of state.config.products ?? []) map.set(p.id, p.cost ?? 0);
    return map;
  }, [state.config.products]);

  const inRange = (date: string) => date >= bounds.startISO && date <= bounds.endISO;
  const inPrev = (date: string) => date >= bounds.prevStartISO && date <= bounds.prevEndISO;

  const allSales = state.sales ?? [];
  const current = useMemo(() => state.appointments.filter((a) => inRange(a.date)), [state.appointments, bounds]);
  const previous = useMemo(() => state.appointments.filter((a) => inPrev(a.date)), [state.appointments, bounds]);
  const salesNow = useMemo(() => allSales.filter((s) => inRange(s.date)), [allSales, bounds]);
  const salesPrev = useMemo(() => allSales.filter((s) => inPrev(s.date)), [allSales, bounds]);

  const paidNow = current.filter((a) => a.paymentStatus === "paid");
  const apptRevenue = paidRevenue(current);
  const salesRevenue = salesRevenueOf(salesNow);
  const revenue = apptRevenue + salesRevenue;
  const prevRevenue = paidRevenue(previous) + salesRevenueOf(salesPrev);
  // Sin periodo anterior la comparación no significa nada: se dice "nuevo" en vez
  // de un "+100%" engañoso.
  const isNewPeriod = prevRevenue === 0;
  const delta = isNewPeriod ? 0 : Math.round(((revenue - prevRevenue) / prevRevenue) * 100);

  const salesCost = salesNow.reduce(
    (sum, s) => sum + s.items.reduce((c, i) => c + (productCost.get(i.productId) ?? 0) * i.qty, 0),
    0
  );
  const costTotal = paidNow.reduce((sum, a) => sum + (serviceCost.get(a.service) ?? 0), 0) + salesCost;
  const margin = revenue - costTotal;
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

  const ticket = paidNow.length > 0 ? Math.round(apptRevenue / paidNow.length) : 0;
  const totalAppts = current.length;
  const completed = current.filter((a) => a.status === "completed").length;
  const completionRate = totalAppts > 0 ? Math.round((completed / totalAppts) * 100) : 0;

  // ── Serie de tendencia según el periodo (citas pagadas + ventas) ─────────────
  // Cada punto trae también `anterior`: el mismo punto del periodo anterior, que
  // la gráfica pinta como línea punteada para comparar de un vistazo.
  const series = useMemo(() => {
    const revenueOnDay = (dStr: string) =>
      paidRevenue(state.appointments.filter((a) => a.date === dStr)) +
      salesRevenueOf(allSales.filter((s) => s.date === dStr));
    const revenueOnMonth = (y: number, m: number) =>
      paidRevenue(
        state.appointments.filter((a) => {
          const d = new Date(`${a.date}T12:00:00`);
          return d.getFullYear() === y && d.getMonth() === m;
        })
      ) +
      salesRevenueOf(
        allSales.filter((s) => {
          const d = new Date(`${s.date}T12:00:00`);
          return d.getFullYear() === y && d.getMonth() === m;
        })
      );

    const start = new Date(`${bounds.startISO}T12:00:00`);
    if (period === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const prev = new Date(d); prev.setDate(d.getDate() - 7);
        return {
          name: `${DAY_ABBR[d.getDay()]} ${d.getDate()}`,
          ingresos: revenueOnDay(isoOf(d)),
          anterior: revenueOnDay(isoOf(prev))
        };
      });
    }
    if (period === "month") {
      const y = start.getFullYear();
      const m = start.getMonth();
      const days = new Date(y, m + 1, 0).getDate();
      const prevDays = new Date(y, m, 0).getDate();
      return Array.from({ length: days }, (_, i) => ({
        name: String(i + 1),
        ingresos: revenueOnDay(isoOf(new Date(y, m, i + 1))),
        // El día equivalente del mes anterior puede no existir (p. ej. 31).
        anterior: i < prevDays ? revenueOnDay(isoOf(new Date(y, m - 1, i + 1))) : undefined
      }));
    }
    const y = start.getFullYear();
    return Array.from({ length: 12 }, (_, i) => ({
      name: MONTHS[i],
      ingresos: revenueOnMonth(y, i),
      anterior: revenueOnMonth(y - 1, i)
    }));
  }, [period, bounds, state.appointments, allSales]);

  // ── Top de servicios por ingresos (con margen estimado) ─────────────────────
  const topServices = useMemo(() => {
    const acc = new Map<string, { name: string; count: number; revenue: number; cost: number }>();
    for (const a of paidNow) {
      const cur = acc.get(a.service) ?? { name: a.service, count: 0, revenue: 0, cost: 0 };
      cur.count += 1;
      cur.revenue += a.paidAmount || a.price;
      cur.cost += serviceCost.get(a.service) ?? 0;
      acc.set(a.service, cur);
    }
    return [...acc.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [paidNow, serviceCost]);
  const maxServiceRevenue = Math.max(...topServices.map((s) => s.revenue), 1);

  // ── Top de productos vendidos (módulo Ventas) ───────────────────────────────
  const topProducts = useMemo(() => {
    const acc = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
    for (const s of salesNow) {
      for (const i of s.items) {
        const cur = acc.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0, cost: 0 };
        cur.qty += i.qty;
        cur.revenue += i.qty * i.unitPrice;
        cur.cost += (productCost.get(i.productId) ?? 0) * i.qty;
        acc.set(i.productId, cur);
      }
    }
    return [...acc.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [salesNow, productCost]);
  const maxProductRevenue = Math.max(...topProducts.map((p) => p.revenue), 1);

  // ── Ranking de empleados por ingresos del periodo (citas + ventas) ──────────
  const employeeRanking = useMemo(() => {
    const acc = new Map<string, number>();
    for (const a of paidNow) acc.set(a.employeeId, (acc.get(a.employeeId) ?? 0) + (a.paidAmount || a.price));
    for (const s of salesNow) {
      if (s.employeeId) acc.set(s.employeeId, (acc.get(s.employeeId) ?? 0) + s.total);
    }
    return state.employees
      .map((e) => ({ id: e.id, name: e.name, revenue: acc.get(e.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidNow, salesNow, state.employees]);
  const maxEmpRevenue = Math.max(...employeeRanking.map((e) => e.revenue), 1);

  const exportExcel = () => {
    downloadExcel(`estadisticas-${period}`, `Estadísticas ${PERIOD_LABEL[period]}`, [
      { Sección: "Resumen", Métrica: "Ingresos del periodo", Valor: revenue },
      { Sección: "Resumen", Métrica: "Ingresos por servicios (citas)", Valor: apptRevenue },
      { Sección: "Resumen", Métrica: "Ingresos por productos (ventas)", Valor: salesRevenue },
      { Sección: "Resumen", Métrica: `Cambio vs ${PREV_LABEL[period]}`, Valor: isNewPeriod ? "Sin periodo anterior" : `${delta}%` },
      { Sección: "Resumen", Métrica: "Margen estimado", Valor: margin },
      { Sección: "Resumen", Métrica: "Margen %", Valor: `${marginPct}%` },
      { Sección: "Resumen", Métrica: "Ticket promedio (citas)", Valor: ticket },
      { Sección: "Resumen", Métrica: "Citas del periodo", Valor: totalAppts },
      { Sección: "Resumen", Métrica: "Completadas %", Valor: `${completionRate}%` },
      { Sección: "Resumen", Métrica: "Ventas de productos", Valor: salesNow.length },
      ...series.map((row) => ({ Sección: "Tendencia", Métrica: row.name, Valor: row.ingresos, Anterior: row.anterior ?? "" })),
      ...topServices.map((service) => ({
        Sección: "Top servicios",
        Métrica: service.name,
        Valor: service.revenue,
        Citas: service.count,
        Costo: service.cost,
        Margen: service.revenue - service.cost
      })),
      ...topProducts.map((product) => ({
        Sección: "Top productos",
        Métrica: product.name,
        Valor: product.revenue,
        Piezas: product.qty,
        Costo: product.cost,
        Margen: product.revenue - product.cost
      })),
      ...employeeRanking.map((employee) => ({
        Sección: "Empleados",
        Métrica: employee.name,
        Valor: employee.revenue
      }))
    ]);
  };

  return (
    <div className="space-y-5">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="j-seg" style={{ width: "fit-content" }}>
          {(["week", "month", "year"] as Period[]).map((p) => (
            <button key={p} type="button" className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <button className="j-btn j-btn-sm" onClick={exportExcel}>
          <Download size={12} /> Exportar
        </button>
      </div>

      <div className="j-kpis">
        <div className="j-kpi">
          <div className="j-kpi-label">Ingresos del periodo</div>
          <div className="j-kpi-value">{formatCurrency(revenue, currency)}</div>
          <div className={"j-kpi-delta " + (isNewPeriod ? "" : delta >= 0 ? "up" : "down")}>
            <span>
              {isNewPeriod
                ? revenue > 0 ? `Nuevo — sin ${PREV_LABEL[period]}` : "Sin movimientos"
                : `${delta >= 0 ? "+" : ""}${delta}% vs ${PREV_LABEL[period]}`}
            </span>
          </div>
          <div className="j-kpi-delta">
            <span>Servicios {formatCurrency(apptRevenue, currency)} · Productos {formatCurrency(salesRevenue, currency)}</span>
          </div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Margen estimado</div>
          <div className="j-kpi-value">{formatCurrency(margin, currency)}</div>
          <div className="j-kpi-delta"><span>{marginPct}% sobre ingresos</span></div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Ticket promedio (citas)</div>
          <div className="j-kpi-value">{formatCurrency(ticket, currency)}</div>
          <div className="j-kpi-delta"><span>{paidNow.length} citas pagadas</span></div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Citas del periodo</div>
          <div className="j-kpi-value mono">{totalAppts}</div>
          <div className="j-kpi-delta"><span>{completionRate}% completadas · {salesNow.length} venta(s)</span></div>
        </div>
      </div>

      <section className="j-card">
        <div className="j-card-head">
          <h3>Tendencia de ingresos</h3>
          <span className="sub">— {PERIOD_LABEL[period].toLowerCase()} actual vs {PREV_LABEL[period]} (punteada)</span>
          <div className="j-seg" style={{ marginLeft: "auto", width: "fit-content" }}>
            <button type="button" className={chartType === "area" ? "active" : ""} onClick={() => setChartType("area")}>
              Línea
            </button>
            <button type="button" className={chartType === "bar" ? "active" : ""} onClick={() => setChartType("bar")}>
              Barras
            </button>
          </div>
        </div>
        <div className="j-card-body">
          <RevenueChart data={series} type={chartType} currency={currency} />
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="j-dash-row">
        <section className="j-card">
          <div className="j-card-head">
            <h3>Top de servicios</h3>
            <span className="sub">— por ingresos</span>
          </div>
          <div className="j-card-body">
            {topServices.length === 0 ? (
              <JEmpty compact title="Sin ventas" description="No hay citas pagadas en este periodo." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {topServices.map((s) => {
                  const m = s.revenue - s.cost;
                  return (
                    <div key={s.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}>
                        <span style={{ fontWeight: 500, color: "var(--fg)" }}>
                          {s.name} <span style={{ color: "var(--fg-subtle)" }}>· {s.count}</span>
                        </span>
                        <span className="mono" style={{ color: "var(--fg-muted)" }}>
                          {formatCurrency(s.revenue, currency)}
                          <span style={{ color: m >= 0 ? "var(--fg-subtle)" : "var(--neg)", marginLeft: 8 }}>
                            margen {formatCurrency(m, currency)}
                          </span>
                        </span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((s.revenue / maxServiceRevenue) * 100)}%`, background: "var(--fg)", transition: "width 0.3s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="j-card">
          <div className="j-card-head">
            <h3>Top de productos</h3>
            <span className="sub">— ventas del periodo</span>
          </div>
          <div className="j-card-body">
            {topProducts.length === 0 ? (
              <JEmpty compact title="Sin ventas de productos" description="Registra ventas en la pestaña Ventas de Agenda." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {topProducts.map((p) => {
                  const m = p.revenue - p.cost;
                  return (
                    <div key={p.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}>
                        <span style={{ fontWeight: 500, color: "var(--fg)" }}>
                          {p.name} <span style={{ color: "var(--fg-subtle)" }}>· {p.qty} pza(s)</span>
                        </span>
                        <span className="mono" style={{ color: "var(--fg-muted)" }}>
                          {formatCurrency(p.revenue, currency)}
                          <span style={{ color: m >= 0 ? "var(--fg-subtle)" : "var(--neg)", marginLeft: 8 }}>
                            margen {formatCurrency(m, currency)}
                          </span>
                        </span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((p.revenue / maxProductRevenue) * 100)}%`, background: "var(--fg)", transition: "width 0.3s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="j-card">
        <div className="j-card-head">
          <h3>Ingresos por empleado</h3>
          <span className="sub">— ranking del periodo (citas + ventas asignadas)</span>
        </div>
        <div className="j-card-body">
          {employeeRanking.length === 0 ? (
            <JEmpty compact title="Sin datos" description="Agrega empleados para ver su rendimiento." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {employeeRanking.map((emp) => (
                <div key={emp.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 500, color: "var(--fg)" }}>{emp.name}</span>
                    <span className="mono" style={{ color: "var(--fg-muted)" }}>{formatCurrency(emp.revenue, currency)}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round((emp.revenue / maxEmpRevenue) * 100)}%`, background: "var(--fg)", transition: "width 0.3s" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
