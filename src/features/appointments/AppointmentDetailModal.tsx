// P4/P6: ventana de detalle CENTRADA (mismo patrón j-modal que Proveedores/Catálogo).
// Todas las acciones de la cita (estado, pago, WhatsApp, editar, eliminar) viven aquí
// como botones grandes; ya no hay edición rápida desde la tabla.
// Vivía en App.tsx; se extrajo al dividirlo (#10) y carga lazy al abrir una cita.

import { useState } from "react";
import { CreditCard, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { PaymentBadge, StatusBadge } from "../../components/Badge";
import { formatPhoneDisplay } from "../../components/PhoneInput";
import { appointmentStatusChoices, PAY_METHOD_LABELS } from "../../lib/appointmentUi";
import { formatCurrency, formatDate } from "../../lib/format";
import type {
  AppState,
  Appointment,
  AppointmentStatus,
  Client,
  PaymentStatus,
  Role,
  SalePaymentMethod
} from "../../types";

export function AppointmentDetailModal({
  appointment,
  client,
  employee,
  currency,
  role,
  onClose,
  onEdit,
  onStatus,
  onPayment,
  onWhatsApp,
  onDelete
}: {
  appointment: Appointment;
  client?: Client;
  employee?: AppState["employees"][number];
  currency: string;
  role: Role;
  onClose: () => void;
  onEdit: (appointment: Appointment) => void;
  onStatus: (status: AppointmentStatus) => void;
  onPayment: (status: PaymentStatus, method?: SalePaymentMethod) => void;
  onWhatsApp: () => void;
  onDelete: (id: string) => void;
}) {
  const isPendingWeb = appointment.source === "public_site" && appointment.status === "pending";
  const statusChoices = appointmentStatusChoices(appointment);
  const isPaid = appointment.paymentStatus === "paid";
  // Corte v2: al tocar "Pagado" primero se elige el método; nada se marca hasta
  // elegirlo (así el corte de caja puede cuadrar por método sin segunda captura).
  const [pickingMethod, setPickingMethod] = useState(false);
  const showMethods = pickingMethod || isPaid;
  return (
    <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="j-modal">
        <div className="j-modal-head">
          <div>
            <p className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--fg-muted)", margin: 0 }}>
              {isPendingWeb ? "Reservación web · " : ""}{formatDate(appointment.date)} · {appointment.time}
            </p>
            <h2 style={{ margin: "2px 0 0" }}>{client?.name ?? "Cliente eliminado"}</h2>
          </div>
          <button className="j-btn-ghost" onClick={onClose} aria-label="Cerrar" style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div className="j-modal-body">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <StatusBadge status={appointment.status} />
            <PaymentBadge status={appointment.paymentStatus} />
            {isPaid && appointment.paymentMethod && (
              <span className="j-tag">{PAY_METHOD_LABELS[appointment.paymentMethod]}</span>
            )}
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", display: "grid", marginBottom: 16 }}>
            <Metric label="Servicio" value={appointment.service} />
            <Metric label="Empleado" value={employee?.name ?? "—"} />
            <Metric label="Teléfono" value={client?.phone ? formatPhoneDisplay(client.phone) : "Sin teléfono"} />
            <Metric label="Duración" value={`${appointment.duration} min`} />
            <Metric label="Precio" value={formatCurrency(appointment.price, currency)} />
            <Metric label="Pagado" value={formatCurrency(appointment.paidAmount, currency)} />
          </div>

          {appointment.notes && (
            <div className="j-field" style={{ marginBottom: 16 }}>
              <span className="j-field-label">Notas</span>
              <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)" }}>{appointment.notes}</p>
            </div>
          )}

          {/* P6: estado con botones grandes (sin dropdowns) */}
          <div className="j-field" style={{ marginBottom: 16 }}>
            <span className="j-field-label">Estado de la cita</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {statusChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  className={"j-btn" + (appointment.status === choice.value ? " j-btn-primary" : "")}
                  style={{ flex: 1, minWidth: 110, justifyContent: "center" }}
                  onClick={() => appointment.status !== choice.value && onStatus(choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          {/* P6: pago con botones grandes (solo desde el detalle).
              Corte v2: marcar "Pagado" pide el método de pago (un tap extra); el
              corte de caja usa ese método para calcular el esperado por método. */}
          <div className="j-field">
            <span className="j-field-label">Estado de pago</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={"j-btn" + (appointment.paymentStatus === "none" && !pickingMethod ? " j-btn-primary" : "")}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => { setPickingMethod(false); if (appointment.paymentStatus !== "none") onPayment("none"); }}
              >
                Sin pago
              </button>
              <button
                type="button"
                className={"j-btn" + (isPaid || pickingMethod ? " j-btn-primary" : "")}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => !isPaid && setPickingMethod(true)}
              >
                <CreditCard size={14} /> Pagado
              </button>
            </div>
            {showMethods && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 6 }}>
                  {!isPaid
                    ? "¿Cómo pagó el cliente? Elige el método para registrar el cobro."
                    : appointment.paymentMethod
                      ? "Método de pago registrado:"
                      : "Pagada sin método registrado — elígelo para que el corte de caja cuadre."}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(Object.keys(PAY_METHOD_LABELS) as SalePaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={"j-btn j-btn-sm" + (isPaid && appointment.paymentMethod === m ? " j-btn-primary" : "")}
                      style={{ flex: 1, minWidth: 104, justifyContent: "center" }}
                      onClick={() => { setPickingMethod(false); if (!(isPaid && appointment.paymentMethod === m)) onPayment("paid", m); }}
                    >
                      {PAY_METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="j-modal-foot" style={{ flexWrap: "wrap", gap: 8 }}>
          {role === "admin" && (
            <button className="j-btn" onClick={() => onDelete(appointment.id)} style={{ color: "var(--neg)" }}>
              <Trash2 size={15} /> Eliminar
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="j-btn" onClick={() => onEdit(appointment)}><Pencil size={15} /> Editar</button>
            {/* El botón de WhatsApp SOLO contacta (abre wa.me); NO confirma la cita.
                La confirmación es manual con los botones de "Estado de la cita" de
                arriba, para no confirmar por error al solo contactar al cliente. */}
            <button className={"j-btn" + (isPendingWeb ? " j-btn-primary" : "")} onClick={onWhatsApp}>
              <MessageCircle size={15} /> Contactar por WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
