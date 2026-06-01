// ════════════════════════════════════════════════════════════════════════════
// Jack — Estadísticas (Análisis, P6)
// ════════════════════════════════════════════════════════════════════════════
// Filtros por periodo (Semana / Mes / Año) con comparativa contra el periodo
// anterior, tendencia de ingresos, ranking de empleados y top de servicios con
// margen estimado.
//
// Ingresos = SOLO citas con paymentStatus === "paid" (regla del negocio). El
// margen se estima cruzando el nombre del servicio de la cita con el costo del
// catálogo (config.services[].cost). Los productos no se venden por la app aún,
// así que el margen del catálogo de productos se muestra aparte como referencia.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { RevenueChart } from "../../components/Charts";
import { JEmpty } from "../../components/Editorial";
import { formatCurrency } from "../../lib/format";
import type { AppState, Appointment } from "../../types";

type Period = "week" | "month" | "year";

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
    const start = new Date(today); start.setDate(today.getDate() - 6);
    const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - 6);
    return { startISO: isoOf(start), endISO: isoOf(today), prevStartISO: isoOf(prevStart), prevEndISO: isoOf(prevEnd) };
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

export function StatsManager({ state, today }: { state: AppState; today: string }) {
  const currency = state.config.currency;
  const [period, setPeriod] = useState<Period>("month");
  const bounds = useMemo(() => periodBounds(period, today), [period, today]);

  // Mapa nombre de servicio → costo del catálogo (para estimar margen).
  const serviceCost = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of state.config.services ?? []) map.set(s.name, s.cost ?? 0);
    return map;
  }, [state.config.services]);

  const inRange = (a: Appointment) => a.date >= bounds.startISO && a.date <= bounds.endISO;
  const inPrev = (a: Appointment) => a.date >= bounds.prevStartISO && a.date <= bounds.prevEndISO;

  const current = useMemo(() => state.appointments.filter(inRange), [state.appointments, bounds]);
  const previous = useMemo(() => state.appointments.filter(inPrev), [state.appointments, bounds]);

  const paidNow = current.filter((a) => a.paymentStatus === "paid");
  const revenue = paidRevenue(current);
  const prevRevenue = paidRevenue(previous);
  const delta = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : revenue > 0 ? 100 : 0;

  const costTotal = paidNow.reduce((sum, a) => sum + (serviceCost.get(a.service) ?? 0), 0);
  const margin = revenue - costTotal;
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

  const ticket = paidNow.length > 0 ? Math.round(revenue / paidNow.length) : 0;
  const totalAppts = current.length;
  const completed = current.filter((a) => a.status === "completed").length;
  const completionRate = totalAppts > 0 ? Math.round((completed / totalAppts) * 100) : 0;

  // ── Serie de tendencia según el periodo ─────────────────────────────────────
  const series = useMemo(() => {
    const start = new Date(`${bounds.startISO}T12:00:00`);
    if (period === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const dStr = isoOf(d);
        return { name: `${DAY_ABBR[d.getDay()]} ${d.getDate()}`, ingresos: paidRevenue(state.appointments.filter((a) => a.date === dStr)) };
      });
    }
    if (period === "month") {
      const y = start.getFullYear();
      const m = start.getMonth();
      const days = new Date(y, m + 1, 0).getDate();
      return Array.from({ length: days }, (_, i) => {
        const dStr = isoOf(new Date(y, m, i + 1));
        return { name: String(i + 1), ingresos: paidRevenue(state.appointments.filter((a) => a.date === dStr)) };
      });
    }
    const y = start.getFullYear();
    return Array.from({ length: 12 }, (_, i) => ({
      name: MONTHS[i],
      ingresos: paidRevenue(
        state.appointments.filter((a) => {
          const d = new Date(`${a.date}T12:00:00`);
          return d.getFullYear() === y && d.getMonth() === i;
        })
      )
    }));
  }, [period, bounds, state.appointments]);

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

  // ── Ranking de empleados por ingresos del periodo ───────────────────────────
  const employeeRanking = useMemo(() => {
    const acc = new Map<string, number>();
    for (const a of paidNow) acc.set(a.employeeId, (acc.get(a.employeeId) ?? 0) + (a.paidAmount || a.price));
    return state.employees
      .map((e) => ({ id: e.id, name: e.name, revenue: acc.get(e.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidNow, state.employees]);
  const maxEmpRevenue = Math.max(...employeeRanking.map((e) => e.revenue), 1);

  return (
    <div className="space-y-5">
      <div className="j-seg" style={{ width: "fit-content" }}>
        {(["week", "month", "year"] as Period[]).map((p) => (
          <button key={p} type="button" className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="j-kpis">
        <div className="j-kpi">
          <div className="j-kpi-label">Ingresos del periodo</div>
          <div className="j-kpi-value">{formatCurrency(revenue, currency)}</div>
          <div className={"j-kpi-delta " + (delta >= 0 ? "up" : "down")}>
            <span>{delta >= 0 ? "+" : ""}{delta}% vs {PREV_LABEL[period]}</span>
          </div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Margen estimado</div>
          <div className="j-kpi-value">{formatCurrency(margin, currency)}</div>
          <div className="j-kpi-delta"><span>{marginPct}% sobre ingresos</span></div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Ticket promedio</div>
          <div className="j-kpi-value">{formatCurrency(ticket, currency)}</div>
          <div className="j-kpi-delta"><span>{paidNow.length} citas pagadas</span></div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Citas del periodo</div>
          <div className="j-kpi-value mono">{totalAppts}</div>
          <div className="j-kpi-delta"><span>{completionRate}% completadas</span></div>
        </div>
      </div>

      <section className="j-card">
        <div className="j-card-head">
          <h3>Tendencia de ingresos</h3>
          <span className="sub">— {PERIOD_LABEL[period].toLowerCase()} actual</span>
        </div>
        <div className="j-card-body">
          <RevenueChart data={series} type="bar" />
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
            <h3>Ingresos por empleado</h3>
            <span className="sub">— ranking del periodo</span>
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
    </div>
  );
}
