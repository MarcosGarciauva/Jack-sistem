// ─── Helpers de UI de citas compartidos ───────────────────────────────────────
// Usados por App.tsx (exports a Excel) y por los módulos de features (detalle de
// cita, tablas). Vivían en App.tsx; se extrajeron al dividirlo (#10).

import type { Appointment, AppointmentStatus, SalePaymentMethod } from "../types";

// Corte v2: etiquetas de método de pago (mismas que Ventas y Corte de caja).
export const PAY_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  cash: "Efectivo",
  card_credit: "T. crédito",
  card_debit: "T. débito",
  transfer: "Transferencia"
};

// ─── Estados de cita (P3/P6) ──────────────────────────────────────────────────
// El `source` distingue solicitud web (public_site) de cita formal (dashboard).
// Aceptar una solicitud web la convierte en cita formal pendiente.

export function appointmentStatusLabel(apt: Appointment): string {
  if (apt.source === "public_site" && apt.status === "pending") return "Por confirmar";
  switch (apt.status) {
    case "pending": return "Pendiente";
    case "confirmed": return "Confirmada";
    case "completed": return "Completada";
    case "cancelled": return "Cancelada";
    default: return "No asistió";
  }
}

// 3 estados visibles según el ciclo de vida (P6: botones grandes, sin dropdowns):
//   · reserva web por confirmar → Por confirmar / Aceptar como cita / Cancelada
//   · cita normal               → Pendiente / Completada / Cancelada
export function appointmentStatusChoices(apt: Appointment): { value: AppointmentStatus; label: string }[] {
  if (apt.source === "public_site" && apt.status === "pending") {
    return [
      { value: "pending", label: "Por confirmar" },
      { value: "confirmed", label: "Aceptar como cita" },
      { value: "cancelled", label: "Cancelada" }
    ];
  }
  if (apt.status === "confirmed") {
    return [
      { value: "confirmed", label: "Confirmada" },
      { value: "completed", label: "Completada" },
      { value: "cancelled", label: "Cancelada" }
    ];
  }
  return [
    { value: "pending", label: "Pendiente" },
    { value: "completed", label: "Completada" },
    { value: "cancelled", label: "Cancelada" }
  ];
}
