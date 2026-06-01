// ════════════════════════════════════════════════════════════════════════════
// Jack — Reservaciones web (P2/P3/P4)
// ════════════════════════════════════════════════════════════════════════════
// Subsección (pestaña) dentro de Citas. Muestra SOLO las reservas que entran
// desde el sitio público y siguen por confirmar (source === "public_site" &&
// status === "pending"). Cada tarjeta es de SOLO LECTURA y abre la ventana
// centrada de detalle (onOpen); desde ahí se confirma, cancela o avisa por
// WhatsApp. No hay edición rápida ni botones de acción en la lista (P4).
//
// Al confirmar, la reserva pasa a status "confirmed", deja de aparecer aquí y se
// integra al listado normal de Citas (P3). No se duplica en ambas vistas.
// ════════════════════════════════════════════════════════════════════════════

import { Clock, ChevronRight } from "lucide-react";
import { JEmpty } from "../../components/Editorial";
import { formatCurrency, formatDate } from "../../lib/format";
import { formatPhoneDisplay } from "../../components/PhoneInput";
import type { Appointment, Client } from "../../types";

export function WebReservationsView({
  reservations,
  clientById,
  employeeById,
  currency,
  onOpen
}: {
  reservations: Appointment[];
  clientById: Map<string, Client>;
  employeeById: Map<string, { id: string; name: string }>;
  currency: string;
  onOpen: (apt: Appointment) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="j-stat-strip">
        <div className="j-stat">
          <div className="j-stat-l">Por confirmar</div>
          <div className="j-stat-v">{reservations.length}</div>
        </div>
      </div>

      <section className="j-card">
        <div className="j-card-head">
          <h3>Reservas por confirmar</h3>
          <span className="sub">— llegan desde tu sitio público</span>
        </div>
        {reservations.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty compact title="Todo al día" description="No tienes reservas web por confirmar." />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
            {reservations.map((apt) => {
              const client = clientById.get(apt.clientId);
              const employee = employeeById.get(apt.employeeId);
              return (
                <div
                  key={apt.id}
                  className="click"
                  onClick={() => onOpen(apt)}
                  style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--bg-elev)", cursor: "pointer", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}
                >
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14.5, color: "var(--fg)" }}>{client?.name ?? "Cliente"}</span>
                      <span className="j-tag dot warn">Por confirmar</span>
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                      {client?.phone ? formatPhoneDisplay(client.phone) : "Sin teléfono"}
                      {client?.email ? ` · ${client.email}` : ""}
                    </div>
                    {apt.notes ? (
                      <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--fg-muted)" }}>{apt.notes}</div>
                    ) : null}
                  </div>
                  <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                    <div style={{ fontWeight: 500, color: "var(--fg)" }}>{apt.service}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}>
                      <Clock size={13} /> {formatDate(apt.date)} · {apt.time} · {apt.duration} min
                    </div>
                    <div style={{ color: "var(--fg-muted)" }}>
                      {employee?.name ?? "Sin asignar"} · <span className="mono">{formatCurrency(apt.price, currency)}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: "var(--fg-muted)", flex: "0 0 auto" }} />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
