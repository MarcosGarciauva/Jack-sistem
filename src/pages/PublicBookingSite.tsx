// ════════════════════════════════════════════════════════════════════════════
// Jack — Sitio público de reservas /p/:slug
// ════════════════════════════════════════════════════════════════════════════
// Renderizado cuando la URL es /p/<slug>. NO requiere login.
// El negocio tiene que tener public_site_enabled = true.
// Las citas creadas aquí llegan al dashboard con source='public_site'.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Check, Sparkles } from "lucide-react";
import { databaseService, type PublicBusinessSummary } from "../services/databaseService";
import { formatCurrency, formatLongDate, initialsFromName, todayISO, uid } from "../lib/format";
import { getAvailableSlots } from "../lib/availability";
import { JSkeleton } from "../components/Editorial";
import { PhoneInput } from "../components/PhoneInput";
import type { AppState } from "../types";

export function PublicBookingSite({ slug }: { slug: string }) {
  const [biz, setBiz] = useState<PublicBusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const b = await databaseService.loadPublicBusinessBySlug(slug);
        if (cancelled) return;
        if (!b) setNotFound(true);
        else setBiz(b);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <PublicSkeleton />;
  if (notFound || !biz) return <PublicNotFound slug={slug} />;

  return <PublicLanding biz={biz} />;
}

// ─── Estados auxiliares ───────────────────────────────────────────────────────

function PublicSkeleton() {
  return (
    <div className="j-pub">
      <div className="j-pub-hero">
        <JSkeleton w={120} h={12} />
        <div style={{ marginTop: 16 }}><JSkeleton w={320} h={42} /></div>
        <div style={{ marginTop: 12 }}><JSkeleton w={440} h={16} /></div>
      </div>
      <div className="j-pub-body">
        <JSkeleton h={400} radius={10} />
      </div>
    </div>
  );
}

function PublicNotFound({ slug }: { slug: string }) {
  return (
    <div className="j-pub" style={{ background: "#0a0a0a", color: "#fafafa" }}>
      <div className="j-pub-hero" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.55, marginBottom: 14 }}>
          {slug} · sitio no disponible
        </div>
        <h1 className="serif" style={{ fontSize: 48, lineHeight: 1.1, margin: 0, color: "#fff" }}>
          Este sitio público <i>no está activo</i>.
        </h1>
        <p style={{ marginTop: 14, fontSize: 14, color: "rgba(255,255,255,0.7)", maxWidth: 520, lineHeight: 1.55 }}>
          El negocio que buscas no tiene su paquete de sitio público activo, o el enlace no es correcto. Si crees que es un error, contacta directamente al negocio.
        </p>
        <p style={{ marginTop: 28, fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'Geist Mono', monospace" }}>
          Powered by Jack
        </p>
      </div>
    </div>
  );
}

// ─── Landing pública + form de reserva ────────────────────────────────────────

function PublicLanding({ biz }: { biz: PublicBusinessSummary }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const config = biz.config;
  const services = config.services ?? [];

  // Form state
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [date, setDate] = useState<string>(todayISO());
  const [time, setTime] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ date: string; time: string; service: string } | null>(null);
  const [error, setError] = useState("");

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? services[0],
    [serviceId, services]
  );

  const activeEmployees = useMemo(
    () => biz.employees.filter((employee) => employee.status !== "inactive"),
    [biz.employees]
  );

  const availableSlotsByEmployee = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!selectedService) return map;
    activeEmployees.forEach((employee) => {
      map.set(
        employee.id,
        getAvailableSlots(config, biz.appointments, selectedService, date, employee.id)
      );
    });
    return map;
  }, [activeEmployees, biz.appointments, config, date, selectedService]);

  const availableSlots = useMemo(() => {
    if (employeeId) return availableSlotsByEmployee.get(employeeId) ?? [];
    return Array.from(new Set(Array.from(availableSlotsByEmployee.values()).flat())).sort();
  }, [availableSlotsByEmployee, employeeId]);

  useEffect(() => {
    if (time && !availableSlots.includes(time)) setTime("");
  }, [availableSlots, time]);

  const employeeForTime = (slot: string) => {
    if (employeeId && (availableSlotsByEmployee.get(employeeId) ?? []).includes(slot)) return employeeId;
    return activeEmployees.find((employee) =>
      (availableSlotsByEmployee.get(employee.id) ?? []).includes(slot)
    )?.id ?? "";
  };

  const submit = async () => {
    if (!selectedService || !time || !name.trim() || !phone.trim()) {
      setError("Completa todos los campos requeridos");
      return;
    }
    const assignedEmployeeId = employeeForTime(time);
    if (!assignedEmployeeId) {
      setError("Ese horario ya no está disponible. Elige otro.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const clientId = uid("cli");
      const appointmentId = uid("apt");
      const newClient: AppState["clients"][number] = {
        id: clientId,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        requestedService: selectedService.name,
        amount: selectedService.basePrice,
        appointmentDate: date,
        appointmentTime: time,
        status: "pending",
        assignedEmployeeId,
        notes: notes.trim() || undefined
      };
      const appointment: AppState["appointments"][number] = {
        id: appointmentId,
        clientId,
        service: selectedService.name,
        date,
        time,
        duration: selectedService.duration,
        price: selectedService.basePrice,
        employeeId: assignedEmployeeId,
        status: "pending",
        paymentStatus: "none",
        depositAmount: selectedService.depositAmount,
        paidAmount: 0,
        source: "public_site",
        createdAt: new Date().toISOString(),
        notes: notes.trim() || undefined
      };

      await databaseService.publicCreateAppointment(biz.id, appointment, newClient);
      setConfirmed({ date, time, service: selectedService.name });
      setStep(2);
    } catch (err) {
      setError((err as Error).message || "No se pudo crear la reserva");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) {
    return (
      <div className="j-pub">
        <div className="j-pub-hero">
          <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.55, marginBottom: 14 }}>
            {biz.name}
          </div>
          <h1 className="serif" style={{ fontSize: 48, lineHeight: 1.1, margin: 0, color: "#fff" }}>
            Reserva <i>confirmada</i>
          </h1>
        </div>
        <div className="j-pub-body">
          <div className="j-card" style={{ padding: 32, maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, margin: "0 auto 18px", background: "var(--fg)", color: "var(--bg)", borderRadius: "50%", display: "grid", placeItems: "center" }}>
              <Check size={28} />
            </div>
            <div className="serif" style={{ fontSize: 24, lineHeight: 1.2, marginBottom: 10 }}>
              Te esperamos el <i>{formatLongDate(confirmed.date)}</i> a las {confirmed.time}
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, marginBottom: 18 }}>
              Reservaste <b style={{ color: "var(--fg)" }}>{confirmed.service}</b> en {biz.name}. El negocio te confirmará la cita por teléfono.
            </p>
            <p className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
              Guarda este enlace por si necesitas volver a reservar.
            </p>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="j-pub">
      <div className="j-pub-hero">
        <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.55, marginBottom: 14 }}>
          {biz.name}
        </div>
        <h1 className="serif" style={{ fontSize: 48, lineHeight: 1.1, margin: 0, color: "#fff" }}>
          {config.websiteHeadline || "Reserva tu cita"}
        </h1>
        {config.websiteDescription && (
          <p style={{ marginTop: 14, fontSize: 14, color: "rgba(255,255,255,0.7)", maxWidth: 520, lineHeight: 1.55 }}>
            {config.websiteDescription}
          </p>
        )}
      </div>

      <div className="j-pub-body">
        <div className="j-card" style={{ maxWidth: 980, margin: "0 auto", padding: 0 }}>
          <div className="j-card-head">
            <h3>
              {step === 0 && "Elige tu servicio"}
              {step === 1 && "Tus datos de contacto"}
            </h3>
            <span className="sub">paso {step + 1} de 2</span>
          </div>

          <div className="j-card-body">
            {step === 0 && (
              <>
                <div className="j-field" style={{ marginBottom: 18 }}>
                  <div className="j-field-label">Servicio</div>
                  <div className="j-chips">
                    {services.map((s) => (
                      <span
                        key={s.id}
                        className={"j-chip " + (serviceId === s.id ? "on" : "")}
                        onClick={() => setServiceId(s.id)}
                        role="button"
                      >
                        {s.name}
                        <span className="j-chip-meta">
                          {s.duration}min · {formatCurrency(s.basePrice, config.currency)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="j-field" style={{ marginBottom: 18 }}>
                  <div className="j-field-label">Especialista</div>
                  <div className="j-pub-options">
                    <button
                      type="button"
                      className={"j-pub-option " + (!employeeId ? "on" : "")}
                      onClick={() => setEmployeeId("")}
                    >
                      <span className="j-avatar">J</span>
                      <span>
                        <b>Cualquier disponible</b>
                        <small>Jack asigna automáticamente el primer espacio libre.</small>
                      </span>
                    </button>
                    {activeEmployees.map((employee) => (
                      <button
                        key={employee.id}
                        type="button"
                        className={"j-pub-option " + (employeeId === employee.id ? "on" : "")}
                        onClick={() => setEmployeeId(employee.id)}
                      >
                        <span className="j-avatar">{initialsFromName(employee.name)}</span>
                        <span>
                          <b>{employee.name}</b>
                          <small>{employee.position}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="j-field" style={{ marginBottom: 18 }}>
                  <div className="j-field-label">Fecha</div>
                  <input
                    type="date"
                    className="j-input"
                    value={date}
                    min={todayISO()}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="j-field">
                  <div className="j-field-label">Hora</div>
                  {availableSlots.length === 0 ? (
                    <div className="j-empty compact" style={{ alignItems: "flex-start", textAlign: "left", padding: 20 }}>
                      <div className="j-empty-title">Sin horarios disponibles</div>
                      <div className="j-empty-desc">
                        El negocio no atiende ese día, no tiene empleados activos o los espacios ya están ocupados.
                      </div>
                    </div>
                  ) : (
                    <div className="j-slots large">
                      {availableSlots.map((t) => (
                      <div
                        key={t}
                        className={"j-slot " + (time === t ? "on" : "")}
                        onClick={() => setTime(t)}
                      >
                        {t}
                      </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="j-recommend" style={{ marginBottom: 18 }}>
                  <div className="rh">
                    <Sparkles size={14} />
                    <span className="serif">Tu reserva</span>
                  </div>
                  <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>
                    {selectedService?.name} · {formatLongDate(date)} · {time}
                  </span>
                </div>

                <div className="j-field" style={{ marginBottom: 14 }}>
                  <div className="j-field-label">Nombre completo *</div>
                  <input
                    className="j-input"
                    placeholder="Tu nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div className="j-field">
                    <div className="j-field-label">Teléfono *</div>
                    <PhoneInput value={phone} onChange={setPhone} />
                  </div>
                  <div className="j-field">
                    <div className="j-field-label">Email (opcional)</div>
                    <input
                      className="j-input"
                      type="email"
                      placeholder="tu@correo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="j-field">
                  <div className="j-field-label">Notas para el negocio (opcional)</div>
                  <textarea
                    className="j-input"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Alguna preferencia o nota…"
                  />
                </div>

                {error && (
                  <div className="j-lm-alert err" style={{ marginTop: 14 }}>
                    <AlertCircle size={15} />
                    <span>{error}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", padding: 14, display: "flex", gap: 8, justifyContent: "flex-end", background: "var(--bg)" }}>
            {step === 1 && (
              <button className="j-btn" onClick={() => setStep(0)}>
                Atrás
              </button>
            )}
            {step === 0 ? (
              <button
                className="j-btn j-btn-primary"
                onClick={() => setStep(1)}
                disabled={!serviceId || !time}
              >
                Continuar <ChevronRight size={14} />
              </button>
            ) : (
              <button
                className="j-btn j-btn-primary"
                onClick={submit}
                disabled={submitting || !name.trim() || !phone.trim()}
              >
                {submitting ? "Reservando…" : "Confirmar reserva"} <Check size={14} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}

function PublicFooter() {
  return (
    <footer className="j-pub-footer">
      <span className="mono">Powered by Jack</span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-subtle)" }}>
        © {new Date().getFullYear()}
      </span>
    </footer>
  );
}
