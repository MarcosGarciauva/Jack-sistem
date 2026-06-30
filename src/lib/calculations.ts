import type { Appointment, Client, Employee, Sale } from "../types";

const toDate = (value: string) => new Date(`${value}T12:00:00`);

export const completedRevenue = (appointments: Appointment[]) =>
  appointments
    .filter((a) => a.paymentStatus === "paid")
    .reduce((sum, a) => sum + (a.paidAmount || a.price), 0);

// ── Ventas de productos ───────────────────────────────────────────────────────
// Mismas ventanas de tiempo que los ingresos de citas, para que dashboard/
// estadísticas sumen ambos sin duplicar lógica de fechas.

export const salesRevenue = (sales: Sale[]) => sales.reduce((sum, s) => sum + s.total, 0);

export const salesForDay = (sales: Sale[], date: string) =>
  salesRevenue(sales.filter((s) => s.date === date));

export const salesForMonth = (sales: Sale[], year: number, monthIndex: number) =>
  salesRevenue(
    sales.filter((s) => {
      const d = toDate(s.date);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    }),
  );

export const salesForCurrentWeek = (sales: Sale[], today: string) => {
  const current = toDate(today);
  const day = current.getDay() || 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return salesRevenue(
    sales.filter((s) => {
      const d = toDate(s.date);
      return d >= monday && d <= sunday;
    }),
  );
};

export const revenueForDay = (appointments: Appointment[], date: string) =>
  completedRevenue(appointments.filter((a) => a.date === date));

export const revenueForMonth = (appointments: Appointment[], year: number, monthIndex: number) =>
  completedRevenue(
    appointments.filter((a) => {
      const d = toDate(a.date);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    }),
  );

export const revenueForCurrentWeek = (appointments: Appointment[], today: string) => {
  const current = toDate(today);
  const day = current.getDay() || 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return completedRevenue(
    appointments.filter((a) => {
      const d = toDate(a.date);
      return d >= monday && d <= sunday;
    }),
  );
};

export const upcomingAppointments = (appointments: Appointment[], today: string) =>
  [...appointments]
    .filter((a) => ["pending", "confirmed"].includes(a.status) && a.date >= today)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 6);

export const dailyRevenueSeries = (appointments: Appointment[], sales: Sale[] = []) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T12:00:00`);
  const DAY_ABBR = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 6 + i);
    const dateStr = d.toISOString().slice(0, 10);
    return {
      name: `${DAY_ABBR[d.getDay()]} ${d.getDate()}`,
      ingresos: revenueForDay(appointments, dateStr) + salesForDay(sales, dateStr)
    };
  });
};

export const monthlyRevenueSeries = (appointments: Appointment[]) => {
  const today = new Date();
  const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return [-2, -1, 0].map((offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return {
      name: MONTHS[d.getMonth()],
      ingresos: revenueForMonth(appointments, d.getFullYear(), d.getMonth())
    };
  });
};

export const employeePerformance = (
  employees: Employee[],
  appointments: Appointment[],
  clients: Client[],
) =>
  employees.map((employee) => {
    const assigned = appointments.filter((a) => a.employeeId === employee.id);
    return {
      ...employee,
      assignedCount: assigned.length,
      completedCount: assigned.filter((a) => a.status === "completed").length,
      revenue: completedRevenue(assigned),
      nextClients: assigned
        .filter((a) => a.status === "pending")
        .map((a) => clients.find((c) => c.id === a.clientId)?.name)
        .filter(Boolean)
        .slice(0, 3) as string[]
    };
  });
