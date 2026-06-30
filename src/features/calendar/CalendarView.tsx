// ─── Calendar View ─────────────────────────────────────────────────────────────
// Mes visual con mini-preview de citas por celda (escritorio), panel de detalle
// del día seleccionado y alta de cita con la fecha precargada.
// Vivía en App.tsx; se extrajo al dividirlo (#10) y carga lazy por sección.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { StatusBadge } from "../../components/Badge";
import { JEmpty } from "../../components/Editorial";
import { formatCurrency, formatLongDate, initialsFromName } from "../../lib/format";
import type { AppState, Appointment, Client } from "../../types";

export function CalendarView({
  appointments,
  clientById,
  employeeById,
  today,
  onOpenAppointment,
  onNewAppointment,
  onExportExcel
}: {
  appointments: Appointment[];
  clientById: Map<string, Client>;
  employeeById: Map<string, AppState["employees"][number]>;
  today: string;
  onOpenAppointment: (appointment: Appointment) => void;
  onNewAppointment: (date: string) => void;
  onExportExcel: (appointments: Appointment[]) => void;
}) {
  const todayDate = new Date(`${today}T12:00:00`);
  const [viewMonth, setViewMonth] = useState(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string>(today);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const DAY_HEADERS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((a) => {
      if (!map.has(a.date)) map.set(a.date, []);
      map.get(a.date)!.push(a);
    });
    return map;
  }, [appointments]);

  const cells: (string | null)[] = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    })
  ];

  const selectedAppointments = (byDate.get(selectedDay) ?? []).sort((a, b) => a.time.localeCompare(b.time));

  const monthApts = appointments.filter((a) => {
    const d = new Date(`${a.date}T12:00:00`);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  return (
    <>
      <div className="j-cal-toolbar">
        <div className="j-cal-nav">
          <button onClick={() => setViewMonth(new Date(year, month - 1, 1))} aria-label="Mes anterior">
            <ChevronLeft size={14} />
          </button>
          <span className="j-cal-nav-label">{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => setViewMonth(new Date(year, month + 1, 1))} aria-label="Mes siguiente">
            <ChevronRight size={14} />
          </button>
        </div>
        <button className="j-btn j-btn-sm" onClick={() => { setViewMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)); setSelectedDay(today); }}>
          Hoy
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            <b style={{ color: "var(--fg)" }} className="mono">{monthApts.length}</b> citas en el periodo
          </span>
          <span className="j-tag dot pos">Confirmada</span>
          <span className="j-tag dot warn">Pendiente</span>
          <span className="j-tag dot neg">Cancelada</span>
          <button className="j-btn j-btn-sm" onClick={() => onExportExcel(monthApts)} disabled={monthApts.length === 0}>
            <Download size={12} /> Exportar
          </button>
        </div>
      </div>

      <div className="j-cal-month">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="j-cal-mhead">{d}</div>
        ))}
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`empty-${i}`} className="j-cal-mcell out" />;
          const dayApts = byDate.get(dateStr) ?? [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDay;
          const dayNum = new Date(`${dateStr}T12:00:00`).getDate();
          const hasPending = dayApts.some((a) => a.status === "pending");
          const hasCancel = dayApts.some((a) => a.status === "cancelled");
          const markClass = hasCancel ? "mk cancel" : hasPending ? "mk pending" : "mk";
          const preview = [...dayApts].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 2);
          return (
            <div
              key={dateStr}
              className={"j-cal-mcell" + (isToday ? " today" : "") + (isSelected ? " selected" : "")}
              onClick={() => setSelectedDay(dateStr)}
            >
              <div className="j-cal-mday">{dayNum}</div>
              {dayApts.length > 0 && (
                <>
                  {/* Escritorio: hasta 2 citas con hora y nombre (CSS oculta en móvil) */}
                  <div className="j-cal-mpre">
                    {preview.map((a) => (
                      <span key={a.id} className="row">
                        <span className={"dot" + (a.status === "cancelled" ? " cancel" : a.status === "pending" ? " pending" : "")} />
                        <span className="t mono">{a.time}</span>
                        <span className="n">{clientById.get(a.clientId)?.name.split(/\s+/)[0] ?? "—"}</span>
                      </span>
                    ))}
                    {dayApts.length > 2 && <span className="more">+{dayApts.length - 2} más</span>}
                  </div>
                  {/* Móvil: conteo compacto (CSS lo oculta en escritorio) */}
                  <div className="j-cal-mapts">
                    <span className={markClass} />
                    <span className="n">{dayApts.length}</span>
                    <span className="lbl">{dayApts.length === 1 ? "cita" : "citas"}</span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Day detail panel — appears below the month */}
      <div className="j-cal-day-panel">
        <div className="j-card-head">
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>
              {selectedDay === today ? "Hoy" : ""}
            </div>
            <h3 style={{ fontSize: 20, lineHeight: 1.2, marginTop: 2, textTransform: "capitalize", fontWeight: 600, color: "var(--fg)" }}>
              {formatLongDate(selectedDay)}
            </h3>
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Citas</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{selectedAppointments.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Pendientes</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
                {selectedAppointments.filter((a) => a.status === "pending").length}
              </div>
            </div>
            {/* Crear cita directo en el día seleccionado (fecha precargada) */}
            <button className="j-btn" onClick={() => onNewAppointment(selectedDay)}>
              <Plus size={14} strokeWidth={2.25} /> Nueva cita
            </button>
          </div>
        </div>
        <div className="j-card-body tight">
          {selectedAppointments.length === 0 ? (
            <div style={{ padding: 28 }}>
              <JEmpty
                compact
                title="Día libre"
                description="No hay citas agendadas este día."
              />
            </div>
          ) : (
            selectedAppointments.map((apt) => {
              const client = clientById.get(apt.clientId);
              const employee = employeeById.get(apt.employeeId);
              return (
                <div key={apt.id} className="j-search-row" onClick={() => onOpenAppointment(apt)}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", width: 60 }}>
                    {apt.time}
                    <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontWeight: 400, marginTop: 2 }}>{apt.duration}m</div>
                  </div>
                  <div className="j-avatar">{initialsFromName(client?.name ?? "?")}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13.5, color: "var(--fg)" }}>
                      {client?.name ?? "Cliente eliminado"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                      {apt.service} · {employee?.name ?? "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <StatusBadge status={apt.status} />
                    <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                      {formatCurrency(apt.price, "MXN")}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
