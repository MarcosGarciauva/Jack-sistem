// ─── Dashboard ────────────────────────────────────────────────────────────────
// KPIs del negocio, gráfica de los últimos 7 días, próximas citas y vista rápida
// de la semana. Vivía en App.tsx; se extrajo al dividirlo (#10) y carga lazy.

import { lazy, Suspense } from "react";
import { Check, Download } from "lucide-react";
import { StatusBadge } from "../../components/Badge";
import { JEmpty } from "../../components/Editorial";
import {
  dailyRevenueSeries,
  revenueForCurrentWeek,
  revenueForDay,
  revenueForMonth,
  salesForCurrentWeek,
  salesForDay,
  salesForMonth,
  upcomingAppointments
} from "../../lib/calculations";
import { formatCurrency, formatDate } from "../../lib/format";
import type { AppState, Appointment, Client, Role } from "../../types";

// recharts vive en su propio chunk; solo se descarga al pintar la gráfica.
const RevenueChart = lazy(() => import("../../components/Charts").then((m) => ({ default: m.RevenueChart })));

export function Dashboard({
  state,
  role,
  activeEmployeeId,
  today,
  monthlyChange,
  onComplete,
  clientById,
  employeeById,
  onOpenAppointment,
  onExportExcel
}: {
  state: AppState;
  role: Role;
  activeEmployeeId: string;
  today: string;
  monthlyChange: number;
  onComplete: (id: string, status: Appointment["status"]) => void;
  clientById: Map<string, Client>;
  employeeById: Map<string, AppState["employees"][number]>;
  onOpenAppointment: (appointment: Appointment) => void;
  onExportExcel: () => void;
}) {
  const appointments = role === "employee"
    ? state.appointments.filter((a) => a.employeeId === activeEmployeeId)
    : state.appointments;
  // Ventas de productos: entran a los ingresos del dashboard (mismas ventanas).
  // El empleado solo ve las ventas que él registró.
  const sales = role === "employee"
    ? (state.sales ?? []).filter((s) => s.employeeId === activeEmployeeId)
    : (state.sales ?? []);
  const currency = state.config.currency;
  const currentDate = new Date(`${today}T12:00:00`);
  const monthRevenue = revenueForMonth(appointments, currentDate.getFullYear(), currentDate.getMonth())
    + salesForMonth(sales, currentDate.getFullYear(), currentDate.getMonth());
  const weekRevenue = revenueForCurrentWeek(appointments, today) + salesForCurrentWeek(sales, today);
  const dayRevenue = revenueForDay(appointments, today) + salesForDay(sales, today);
  const daySales = salesForDay(sales, today);
  const todayCount = appointments.filter((a) => a.date === today).length;
  const upcoming = upcomingAppointments(appointments, today);
  const completedThisMonth = appointments.filter((a) =>
    a.status === "completed" && a.date.startsWith(today.slice(0, 7))
  ).length;
  const cancelledThisMonth = appointments.filter((a) =>
    a.status === "cancelled" && a.date.startsWith(today.slice(0, 7))
  ).length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="j-btn j-btn-sm" onClick={onExportExcel}>
          <Download size={12} /> Exportar
        </button>
      </div>

      {/* KPIs editorial */}
      <div className="j-kpis">
        <div className="j-kpi">
          <div className="j-kpi-label">Ingresos de hoy</div>
          <div className="j-kpi-value mono">{formatCurrency(dayRevenue, currency)}</div>
          <div className="j-kpi-delta">
            <span>
              {todayCount} cita{todayCount !== 1 ? "s" : ""} hoy
              {daySales > 0 ? ` · ${formatCurrency(daySales, currency)} en productos` : ""}
            </span>
          </div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Ingresos semana</div>
          <div className="j-kpi-value mono">{formatCurrency(weekRevenue, currency)}</div>
          <div className="j-kpi-delta"><span>Citas + ventas · semana actual</span></div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Ingresos del mes</div>
          <div className="j-kpi-value mono">{formatCurrency(monthRevenue, currency)}</div>
          <div className={"j-kpi-delta " + (monthlyChange >= 0 ? "up" : "down")}>
            <span>{monthlyChange >= 0 ? "+" : ""}{monthlyChange}%</span>
            <span className="vs">vs mes anterior</span>
          </div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Total de citas</div>
          <div className="j-kpi-value mono">{appointments.length}</div>
          <div className="j-kpi-delta">
            <span>{state.clients.length} clientes registrados</span>
          </div>
        </div>
      </div>

      {/* Gráfica + próximas citas */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr", gap: 20, marginBottom: 20 }} className="j-dash-row">
        <section className="j-card">
          <div className="j-card-head">
            <h3>Ingresos por día</h3>
            <span className="sub">— últimos 7 días</span>
          </div>
          <div className="j-card-body">
            <Suspense fallback={<div style={{ height: 220 }} />}>
              <RevenueChart data={dailyRevenueSeries(appointments, sales)} currency={currency} />
            </Suspense>
          </div>
        </section>

        <section className="j-card">
          <div className="j-card-head">
            <h3>Próximas citas</h3>
            {upcoming.length > 0 && <span className="sub">— {upcoming.length}</span>}
          </div>
          <div className="j-card-body tight">
            {upcoming.length === 0 ? (
              <div style={{ padding: 28 }}>
                <JEmpty
                  compact
                  title="Día libre"
                  description="Sin citas próximas programadas."
                />
              </div>
            ) : (
              upcoming.map((apt) => (
                <div key={apt.id} className="j-search-row" onClick={() => onOpenAppointment(apt)}>
                  <div className="mono" style={{ fontSize: 12, color: "var(--fg-muted)", width: 50 }}>{apt.time}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {clientById.get(apt.clientId)?.name ?? "Cliente eliminado"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2 }}>
                      {apt.service} · {formatDate(apt.date)} · {employeeById.get(apt.employeeId)?.name ?? "—"}
                    </div>
                  </div>
                  <StatusBadge status={apt.status} />
                  {role === "employee" && apt.status !== "completed" && (
                    <button className="j-btn j-btn-sm" onClick={(event) => { event.stopPropagation(); onComplete(apt.id, "completed"); }}>
                      <Check size={12} strokeWidth={2.25} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Semana actual + completadas vs canceladas */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr", gap: 20, marginBottom: 20 }} className="j-dash-row">
        <WeeklyView appointments={appointments} clientById={clientById} today={today} onOpen={onOpenAppointment} />

        <section className="j-card">
          <div className="j-card-head">
            <h3>Citas del mes</h3>
            <span className="sub">— completadas vs canceladas</span>
          </div>
          <div className="j-card-body">
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em", color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                  {completedThisMonth + cancelledThisMonth > 0
                    ? Math.round((completedThisMonth / (completedThisMonth + cancelledThisMonth)) * 100)
                    : 0}%
                </div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)", marginTop: 6 }}>
                  Tasa completada
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 9, height: 9, background: "var(--fg)", borderRadius: 2 }} />
                    Completadas
                  </span>
                  <span className="mono" style={{ fontWeight: 500 }}>{completedThisMonth}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 9, height: 9, background: "var(--fg-subtle)", borderRadius: 2 }} />
                    Canceladas
                  </span>
                  <span className="mono" style={{ fontWeight: 500 }}>{cancelledThisMonth}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function WeeklyView({
  appointments,
  clientById,
  today,
  onOpen
}: {
  appointments: Appointment[];
  clientById: Map<string, Client>;
  today: string;
  onOpen?: (a: Appointment) => void;
}) {
  const currentDate = new Date(`${today}T12:00:00`);
  const dayOfWeek = currentDate.getDay();
  const startOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentDate);
    d.setDate(currentDate.getDate() + startOffset + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <section className="j-card">
      <div className="j-card-head">
        <h3>Semana actual</h3>
        <span className="sub">— vista rápida</span>
      </div>
      <div className="j-card-body">
        <div className="j-week-grid">
          {days.map((day) => {
            const isToday = day === today;
            const dayApts = appointments.filter((a) => a.date === day).sort((a, b) => a.time.localeCompare(b.time));
            return (
              <div key={day} className={"j-week-day" + (isToday ? " today" : "")}>
                <div className="j-week-day-head">{formatDate(day)}</div>
                <div className="j-week-day-body">
                  {dayApts.length === 0 ? (
                    <div className="j-week-day-empty">Libre</div>
                  ) : (
                    dayApts.slice(0, 3).map((apt) => (
                      <div key={apt.id}
                           className={"j-week-apt status-" + apt.status}
                           onClick={() => onOpen?.(apt)}>
                        <div className="mono" style={{ fontSize: 11, fontWeight: 500 }}>{apt.time}</div>
                        <div style={{ fontSize: 11, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {clientById.get(apt.clientId)?.name ?? "Cliente"}
                        </div>
                      </div>
                    ))
                  )}
                  {dayApts.length > 3 && (
                    <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 4 }}>
                      +{dayApts.length - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
