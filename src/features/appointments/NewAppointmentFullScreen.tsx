// ─── Editorial: Full-screen Nueva cita ────────────────────────────────────────
// Alta/edición de cita en pantalla completa, en 2 pasos (cliente → servicio).
// Valida disponibilidad con lib/availability (no duplicar lógica de solapamiento).
// Vivía en App.tsx; se extrajo al dividirlo (#10) y carga lazy al abrir el alta.

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Plus, Search, Sparkles, X } from "lucide-react";
import { PhoneInput, parsePhone } from "../../components/PhoneInput";
import { getAvailableSlots } from "../../lib/availability";
import { formatCurrency, formatLongDate, todayISO } from "../../lib/format";
import type { AppState, Appointment, Client, ServiceItem } from "../../types";

function initialsFor(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

export function NewAppointmentFullScreen({
  draft,
  isNew,
  state,
  appointments,
  onChange,
  onSave,
  onClose,
  onCreateClient
}: {
  draft: Appointment;
  isNew: boolean;
  state: AppState;
  appointments: Appointment[];
  onChange: (next: Appointment) => void;
  onSave: () => void;
  onClose: () => void;
  onCreateClient: (name: string, phone: string) => Client;
}) {
  const [step, setStep] = useState<0 | 1>(() => (draft.clientId ? 1 : 0));
  const [query, setQuery] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const services = state.config.services;
  const employees = state.employees.filter((employee) => employee.status !== "inactive");
  const clients = state.clients;
  const currency = state.config.currency;

  const selectedClient = clients.find((c) => c.id === draft.clientId);
  const selectedService = services.find((s) => s.name === draft.service) ?? services[0];
  const selectedEmployee = employees.find((e) => e.id === draft.employeeId);

  const matches = query
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          (c.phone || "").includes(query)
      )
    : clients.slice(0, 8);

  const availableSlots = selectedService && draft.employeeId
    ? getAvailableSlots(state.config, appointments.filter((a) => a.id !== draft.id), selectedService, draft.date, draft.employeeId)
    : [];
  const isCurrentTimeAvailable = !!draft.time && availableSlots.includes(draft.time);
  const newClientPhoneParts = parsePhone(newClientPhone);
  const newClientPhoneIncomplete = newClientPhoneParts.national.length > 0 && newClientPhoneParts.national.length < 10;
  const canCreateNewClient = !!newClientName.trim() && !newClientPhoneIncomplete;
  const quickDates = useMemo(() => {
    const base = new Date(`${todayISO()}T12:00:00`);
    const items = [
      { offset: 0, label: "Hoy" },
      { offset: 1, label: "Mañana" },
      { offset: 2, label: "En 2 días" },
      { offset: 3, label: "En 3 días" },
      { offset: 7, label: "Próxima semana" }
    ];
    return items.map((item) => {
      const date = new Date(base);
      date.setDate(base.getDate() + item.offset);
      return {
        ...item,
        value: date.toISOString().slice(0, 10)
      };
    });
  }, []);

  useEffect(() => {
    if (draft.time && draft.employeeId && availableSlots.length > 0 && !availableSlots.includes(draft.time)) {
      onChange({ ...draft, time: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSlots.join("|"), draft.employeeId, draft.time]);

  const selectClient = (client: Client) => {
    onChange({ ...draft, clientId: client.id });
    setStep(1);
  };

  const selectNewClient = () => {
    if (!canCreateNewClient) return;
    const created = onCreateClient(newClientName.trim(), newClientPhone.trim());
    onChange({ ...draft, clientId: created.id });
    setNewClientName("");
    setNewClientPhone("");
    setStep(1);
  };

  const setService = (s: ServiceItem) => {
    onChange({
      ...draft,
      service: s.name,
      price: s.basePrice,
      duration: s.duration,
      depositAmount: s.depositAmount
    });
  };

  return (
    <div className="j-fm" role="dialog" aria-modal="true">
      <div className="j-fm-head">
        <button className="j-btn-ghost" onClick={onClose} aria-label="Cerrar" style={{ padding: 8 }}>
          <X size={18} />
        </button>
        <h1>
          {isNew ? "Nueva" : "Editar"} <span className="accent">cita</span>
        </h1>
        <div className="j-fm-steps">
          <span className={"s " + (step >= 0 ? "on" : "")}>Cliente</span>
          <span className="sep" />
          <span className={"s " + (step >= 1 ? "on" : "")}>Servicio</span>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
            {state.config.businessName}
          </span>
        </div>
      </div>

      <div className="j-fm-body">
        <div className="j-fm-form">
          {step === 0 && (
            <>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--fg)" }}>
                  ¿Para qué cliente?
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: "var(--fg-muted)" }}>
                  Busca por nombre o teléfono, o crea uno nuevo.
                </div>
              </div>

              <div className="j-field">
                <div className="j-input" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                  <Search size={15} />
                  <input
                    style={{ border: "none", outline: "none", flex: 1, background: "transparent", color: "var(--fg)", fontSize: 14 }}
                    placeholder="Buscar clientes…"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="j-search-list">
                {matches.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--fg-subtle)", fontSize: 13 }}>
                    Sin coincidencias. Crea un cliente nuevo abajo.
                  </div>
                )}
                {matches.map((c) => (
                  <div key={c.id} className="j-search-row" onClick={() => selectClient(c)}>
                    <div className="j-avatar">{initialsFor(c.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{c.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, marginTop: 2, color: "var(--fg-muted)" }}>
                        {c.phone || "—"} {c.email ? `· ${c.email}` : ""}
                      </div>
                    </div>
                    <ChevronRight size={14} />
                  </div>
                ))}

                <div className="j-search-row new" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="j-avatar" style={{ borderStyle: "dashed" }}>
                      <Plus size={14} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>Crear nuevo cliente</div>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      className="j-input"
                      placeholder="Nombre completo"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") selectNewClient(); }}
                    />
                    <div className="j-phone-create-row">
                      <div className="j-phone-create-field">
                        <div className="j-field-label">Teléfono / WhatsApp (opcional)</div>
                        <PhoneInput value={newClientPhone} onChange={setNewClientPhone} />
                        <div className={"j-field-help " + (newClientPhoneIncomplete ? "error" : "")}>
                          {newClientPhoneIncomplete
                            ? "Completa 10 dígitos o deja el campo vacío."
                            : "Si no escribes número, el cliente se guarda sin teléfono."}
                        </div>
                      </div>
                      <button className="j-btn j-btn-primary" onClick={selectNewClient} disabled={!canCreateNewClient}>
                        Crear
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step >= 1 && selectedClient && (
            <>
              <div style={{ display: "flex", gap: 14, padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elev)", alignItems: "center" }}>
                <div className="j-avatar" style={{ width: 42, height: 42, fontSize: 14 }}>
                  {initialsFor(selectedClient.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14.5, color: "var(--fg)" }}>{selectedClient.name}</div>
                  <div className="mono" style={{ fontSize: 12, marginTop: 2, color: "var(--fg-muted)" }}>
                    {selectedClient.phone || "—"} {selectedClient.email ? `· ${selectedClient.email}` : ""}
                  </div>
                </div>
                <button className="j-btn j-btn-sm" onClick={() => setStep(0)}>Cambiar</button>
              </div>

              <div className="j-recommend">
                <div className="rh">
                  <Sparkles size={14} />
                  <span className="serif">Sugerencia de Jack</span>
                </div>
                <span style={{ color: "var(--fg-muted)" }}>
                  Servicio habitual: <b style={{ color: "var(--fg)" }}>{selectedClient.requestedService || services[0]?.name || "—"}</b>.
                </span>
              </div>

              <div className="j-field">
                <div className="j-field-label">Servicio</div>
                <div className="j-chips">
                  {services.map((s) => (
                    <span
                      key={s.id}
                      className={"j-chip " + (draft.service === s.name ? "on" : "")}
                      onClick={() => setService(s)}
                    >
                      {s.name}
                      <span className="j-chip-meta">
                        {s.duration}min · {formatCurrency(s.basePrice, currency)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="j-field">
                <div className="j-field-label">Empleado</div>
                <div className="j-chips">
                  {employees.map((e) => (
                    <span
                      key={e.id}
                      className={"j-chip " + (draft.employeeId === e.id ? "on" : "")}
                      onClick={() => onChange({ ...draft, employeeId: e.id, time: "" })}
                    >
                      {e.name}
                    </span>
                  ))}
                </div>
                {employees.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    Agrega al menos un empleado activo para poder confirmar citas.
                  </div>
                )}
              </div>

              <div className="j-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div className="j-field-label" style={{ margin: 0 }}>Fecha y hora</div>
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
                    {draft.duration} min
                  </span>
                </div>
                <div className="j-date-picker">
                  <div className="j-date-main">
                    <div className="j-field-label">Día de la cita</div>
                    <input
                      type="date"
                      className="j-input j-date-input"
                      value={draft.date}
                      onChange={(e) => onChange({ ...draft, date: e.target.value, time: "" })}
                    />
                  </div>
                  <div className="j-date-preview">
                    <span className="serif">{formatLongDate(draft.date)}</span>
                    <small>Después elige un horario disponible.</small>
                  </div>
                </div>
                <div className="j-date-shortcuts">
                  {quickDates.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={"j-date-shortcut " + (draft.date === item.value ? "on" : "")}
                      onClick={() => onChange({ ...draft, date: item.value, time: "" })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {availableSlots.length === 0 ? (
                  <div className="j-empty compact" style={{ alignItems: "flex-start", textAlign: "left", padding: 18 }}>
                    <div className="j-empty-title">Sin horarios disponibles</div>
                    <div className="j-empty-desc">
                      Revisa el horario del negocio, el empleado seleccionado o las citas ya ocupadas.
                    </div>
                  </div>
                ) : (
                  <div className="j-slots large">
                    {availableSlots.map((t) => (
                      <div
                        key={t}
                        className={"j-slot " + (draft.time === t ? "on" : "")}
                        onClick={() => onChange({ ...draft, time: t })}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="j-field">
                <div className="j-field-label">Notas (opcional)</div>
                <textarea
                  className="j-input"
                  rows={3}
                  value={draft.notes ?? ""}
                  onChange={(e) => onChange({ ...draft, notes: e.target.value })}
                  placeholder="Alguna preferencia, alergia o nota para el empleado…"
                />
              </div>
            </>
          )}
        </div>

        <aside className="j-fm-aside">
          <div className="j-fm-summary">
            <h3>Resumen</h3>
            {!selectedClient ? (
              <div style={{ padding: "16px 0", textAlign: "center", color: "var(--fg-subtle)" }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--fg-muted)" }}>
                  Sin datos aún
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                  Elige un cliente para empezar
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)", marginBottom: 4 }}>
                    Cliente
                  </div>
                  <div className="big">{selectedClient.name}</div>
                  {selectedClient.phone && (
                    <div className="mono" style={{ fontSize: 11.5, marginTop: 4, color: "var(--fg-muted)" }}>
                      {selectedClient.phone}
                    </div>
                  )}
                </div>
                <div className="j-fm-summary-row"><span className="l">Servicio</span><span className="v">{selectedService?.name ?? "—"}</span></div>
                <div className="j-fm-summary-row"><span className="l">Duración</span><span className="v mono">{draft.duration} min</span></div>
                <div className="j-fm-summary-row"><span className="l">Empleado</span><span className="v">{selectedEmployee?.name ?? "—"}</span></div>
                <div className="j-fm-summary-row"><span className="l">Fecha</span><span className="v mono">{draft.date}</span></div>
                <div className="j-fm-summary-row"><span className="l">Hora</span><span className="v mono">{draft.time}</span></div>
                {(draft.depositAmount ?? 0) > 0 && (
                  <div className="j-fm-summary-row"><span className="l">Anticipo</span><span className="v mono">{formatCurrency(draft.depositAmount, currency)}</span></div>
                )}
                <div className="j-fm-summary-row total">
                  <span>Total</span>
                  <span className="mono">{formatCurrency(draft.price, currency)}</span>
                </div>
              </>
            )}
          </div>

          {selectedClient && (
            <div style={{ marginTop: 18, padding: "14px 16px", border: "1px dashed var(--border-strong)", borderRadius: 8, background: "var(--bg-elev)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, color: "var(--fg)" }}>
                <Sparkles size={13} />
                <b>Jack sugiere</b>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--fg-muted)" }}>
                Confirma la asistencia manualmente con el cliente usando el botón de WhatsApp en el detalle de la cita.
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="j-fm-foot">
        <div className="left">Pulsa Esc para cerrar</div>
        <button className="j-btn" onClick={onClose}>Cancelar</button>
        {step === 0 ? (
          <button className="j-btn j-btn-primary" disabled style={{ opacity: 0.4, cursor: "not-allowed" }}>
            Continuar
          </button>
        ) : (
          <button className="j-btn j-btn-primary" onClick={onSave} disabled={!selectedClient || !draft.service || !draft.date || !draft.time || !isCurrentTimeAvailable}>
            <Check size={13} strokeWidth={2.25} /> {isNew ? "Confirmar cita" : "Guardar cambios"}
          </button>
        )}
      </div>
    </div>
  );
}
