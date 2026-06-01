import type { AppointmentStatus, EmployeeStatus, PaymentStatus } from "../types";

const labels: Record<AppointmentStatus | EmployeeStatus | PaymentStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
  active: "Activo",
  inactive: "Inactivo",
  none: "Sin pago",
  paid: "Pagado"
};

// Editorial B&W — semantic colors only for positive (pos) / warn / neg
const appointmentTone: Record<AppointmentStatus, "" | "pos" | "warn" | "neg"> = {
  pending: "warn",
  confirmed: "pos",
  completed: "",
  cancelled: "neg",
  no_show: "neg"
};

export function StatusBadge({ status }: { status: AppointmentStatus | EmployeeStatus }) {
  let tone: "" | "pos" | "warn" | "neg" = "";
  if (status === "active") tone = "pos";
  else if (status === "inactive") tone = "";
  else tone = appointmentTone[status];

  return (
    <span className={"j-tag dot " + tone}>
      {labels[status]}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const toneMap: Record<PaymentStatus, "" | "pos" | "warn" | "neg"> = {
    none: "",
    paid: "pos"
  };
  return (
    <span className={"j-tag dot " + toneMap[status]}>
      {labels[status]}
    </span>
  );
}
