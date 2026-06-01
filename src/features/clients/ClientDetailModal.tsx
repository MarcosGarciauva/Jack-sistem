// ════════════════════════════════════════════════════════════════════════════
// Jack — Ficha de cliente (P9)
// ════════════════════════════════════════════════════════════════════════════
// Detalle del cliente como modal CENTRADO (no panel lateral): datos de contacto,
// totales e historial de sus citas. Se abre al hacer clic en el cliente desde la
// tabla de citas. El contacto es manual por WhatsApp (wa.me).
// ════════════════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { Mail, MessageCircle, Phone, X } from "lucide-react";
import { PaymentBadge, StatusBadge } from "../../components/Badge";
import { JEmpty } from "../../components/Editorial";
import { formatCurrency, formatDate, initialsFromName } from "../../lib/format";
import { formatPhoneDisplay } from "../../components/PhoneInput";
import type { Appointment, Client } from "../../types";

export function ClientDetailModal({
  client,
  appointments,
  employeeById,
  currency,
  onClose,
  onWhatsAppClient
}: {
  client: Client;
  appointments: Appointment[];
  employeeById: Map<string, { id: string; name: string }>;
  currency: string;
  onClose: () => void;
  onWhatsAppClient: (client: Client) => void;
}) {
  const history = useMemo(
    () =>
      appointments
        .filter((a) => a.clientId === client.id)
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
    [appointments, client.id]
  );

  const totalPaid = history
    .filter((a) => a.paymentStatus === "paid")
    .reduce((sum, a) => sum + (a.paidAmount || a.price), 0);
  const completed = history.filter((a) => a.status === "completed").length;

  return (
    <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="j-modal">
        <div className="j-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="j-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>{initialsFromName(client.name)}</div>
            <div>
              <h2 style={{ margin: 0 }}>{client.name}</h2>
              <div className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                {client.phone ? formatPhoneDisplay(client.phone) : "Sin teléfono"}
              </div>
            </div>
          </div>
          <button className="j-btn-ghost" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
        </div>

        <div className="j-modal-body">
          <div className="j-stat-strip" style={{ marginBottom: 14 }}>
            <div className="j-stat">
              <div className="j-stat-l">Citas</div>
              <div className="j-stat-v">{history.length}</div>
            </div>
            <div className="j-stat">
              <div className="j-stat-l">Completadas</div>
              <div className="j-stat-v">{completed}</div>
            </div>
            <div className="j-stat">
              <div className="j-stat-l">Total pagado</div>
              <div className="j-stat-v mono">{formatCurrency(totalPaid, currency)}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, marginBottom: 16 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}>
              <Phone size={13} /> {client.phone ? formatPhoneDisplay(client.phone) : "—"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}>
              <Mail size={13} /> {client.email || "—"}
            </span>
          </div>
          {client.notes ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 12.5, color: "var(--fg-muted)", marginBottom: 16 }}>
              {client.notes}
            </div>
          ) : null}

          <div className="j-field-label" style={{ marginBottom: 8 }}>Historial de citas</div>
          {history.length === 0 ? (
            <JEmpty compact title="Sin citas" description="Este cliente todavía no tiene citas registradas." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="j-table">
                <thead>
                  <tr>
                    <th>Fecha · Hora</th>
                    <th>Servicio</th>
                    <th>Empleado</th>
                    <th className="num">Precio</th>
                    <th>Pago</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((a) => (
                    <tr key={a.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{formatDate(a.date)} · {a.time}</td>
                      <td style={{ fontWeight: 500 }}>{a.service}</td>
                      <td style={{ color: "var(--fg-muted)" }}>{employeeById.get(a.employeeId)?.name ?? "—"}</td>
                      <td className="num mono">{formatCurrency(a.price, currency)}</td>
                      <td><PaymentBadge status={a.paymentStatus} /></td>
                      <td><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="j-modal-foot">
          <button className="j-btn" onClick={onClose}>Cerrar</button>
          <button className="j-btn j-btn-primary" onClick={() => onWhatsAppClient(client)} disabled={!client.phone}>
            <MessageCircle size={13} strokeWidth={2.25} /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
