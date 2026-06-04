import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  ChevronLeft,
  CircleDollarSign,
  Clock,
  CreditCard,
  Download,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Truck,
  X
} from "lucide-react";
import { PaymentBadge, StatusBadge } from "./components/Badge";
import { JShellSkeleton, JEmpty } from "./components/Editorial";
import { SettingsBusinessesAdmin } from "./features/admin/SettingsBusinessesAdmin";
import { OnboardingScreen } from "./features/onboarding/OnboardingScreen";
import { PhoneInput, formatPhoneDisplay } from "./components/PhoneInput";

// ── Code-splitting (#10) ──────────────────────────────────────────────────────
// Componentes pesados o ligados a una sola sección/ruta se cargan bajo demanda con
// React.lazy para sacarlos del chunk inicial (recharts, sitio público, managers de
// secciones secundarias). Cada uso se envuelve en <Suspense> con un fallback ligero.
const RevenueChart = lazy(() => import("./components/Charts").then((m) => ({ default: m.RevenueChart })));
const PublicBookingSite = lazy(() => import("./pages/PublicBookingSite").then((m) => ({ default: m.PublicBookingSite })));
const EmployeesManager = lazy(() => import("./features/employees/EmployeesManager").then((m) => ({ default: m.EmployeesManager })));
const CatalogManager = lazy(() => import("./features/catalog/CatalogManager").then((m) => ({ default: m.CatalogManager })));
const CashManager = lazy(() => import("./features/cash/CashManager").then((m) => ({ default: m.CashManager })));
const StatsManager = lazy(() => import("./features/stats/StatsManager").then((m) => ({ default: m.StatsManager })));
const WebReservationsView = lazy(() => import("./features/reservations/WebReservationsView").then((m) => ({ default: m.WebReservationsView })));
const SuppliersManager = lazy(() => import("./features/suppliers/SuppliersManager").then((m) => ({ default: m.SuppliersManager })));
const ClientDetailModal = lazy(() => import("./features/clients/ClientDetailModal").then((m) => ({ default: m.ClientDetailModal })));
const SettingsEditorial = lazy(() => import("./features/settings/SettingsEditorial").then((m) => ({ default: m.SettingsEditorial })));
import { Toast } from "./components/Toast";
import {
  dailyRevenueSeries,
  employeePerformance,
  revenueForCurrentWeek,
  revenueForDay,
  revenueForMonth,
  upcomingAppointments
} from "./lib/calculations";
import { getAvailableSlots, hasAvailability } from "./lib/availability";
import { formatCurrency, formatDate, formatLongDate, initialsFromName, todayISO, uid } from "./lib/format";
import { parseRoute, type Route } from "./lib/routing";
import { databaseService } from "./services/databaseService";
import { monitoringService } from "./services/monitoringService";
import { supabase } from "./services/supabaseClient";
import { whatsappService } from "./services/whatsappService";
import type {
  AppSession,
  AppState,
  Appointment,
  AppointmentFilters,
  AppointmentStatus,
  Client,
  PaymentStatus,
  Role,
  ServiceItem
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

// P2: "Reservaciones web" dejó de ser una sección de nivel superior; ahora es una
// subsección (pestaña) dentro de Citas. Por eso ya no aparece en `Section`.
type Section = "dashboard" | "calendar" | "appointments" | "employees" | "catalog" | "suppliers" | "stats" | "cash" | "settings";

const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "appointments", label: "Citas", icon: Clock },
  { id: "employees", label: "Empleados", icon: BriefcaseBusiness },
  { id: "catalog", label: "Productos y servicios", icon: Package },
  { id: "suppliers", label: "Proveedores", icon: Truck },
  { id: "stats", label: "Estadisticas", icon: BarChart3 },
  { id: "cash", label: "Corte de caja", icon: CreditCard },
  { id: "settings", label: "Configuracion", icon: Settings }
];

const defaultFilters: AppointmentFilters = {
  query: "",
  date: "",
  status: "all",
  employeeId: "all",
  service: "all",
  sort: "recent"
};

// ─── Mobile bottom nav ────────────────────────────────────────────────────────

function MobileBottomNav({
  section,
  setSection,
  allowedSections,
  pendingCount
}: {
  section: Section;
  setSection: (s: Section) => void;
  allowedSections: Section[];
  pendingCount: number;
}) {
  const shown = navItems.filter((n) => allowedSections.includes(n.id)).slice(0, 5);
  return (
    <nav className="j-mobile-nav" aria-label="Navegación principal">
      <div className="j-mobile-nav-inner">
        {shown.map((item) => {
          const Icon = item.icon;
          const isActive = section === item.id;
          return (
            <button
              key={item.id}
              className={"j-mobile-nav-item" + (isActive ? " active" : "")}
              onClick={() => setSection(item.id)}
              aria-label={item.label}
            >
              <div className="j-mobile-nav-icon">
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.5} />
                {item.id === "appointments" && pendingCount > 0 && (
                  <span className="j-mobile-nav-badge">{pendingCount}</span>
                )}
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  // Re-parse if user navigates via browser back/forward
  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (route.kind === "public-site") {
    return (
      <Suspense fallback={<JShellSkeleton />}>
        <PublicBookingSite slug={route.slug} />
      </Suspense>
    );
  }

  return <DashboardApp />;
}

function DashboardApp() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [businessState, setBusinessState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupMessage, setSetupMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string) => setToast(msg);

  const loadAuthenticatedUser = async () => {
    if (!supabase) {
      setSetupMessage("Supabase no esta configurado. Revisa .env.local.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setSetupMessage("");

    const { data } = await supabase.auth.getSession();
    const authUser = data.session?.user;
    if (!authUser) {
      setSession(null);
      setBusinessState(null);
      setLoading(false);
      return;
    }

    setCurrentUserId(authUser.id);

    try {
      const profile = await databaseService.loadProfile(authUser.id);
      if (!profile) {
        setSession(null);
        setBusinessState(null);
        setSetupMessage("Tu usuario existe en Auth, pero no tiene perfil en Jack. Usa el SQL de supabase/create_admin_profile.sql con este ID.");
        return;
      }
      if (!profile.active) {
        setSession(null);
        setBusinessState(null);
        setSetupMessage("Esta cuenta esta desactivada.");
        return;
      }
      if (!profile.businessId) {
        setSession(null);
        setBusinessState(null);
        setSetupMessage("Este perfil no tiene negocio asignado.");
        return;
      }

      const loadedBusiness = await databaseService.loadBusinessState(profile.businessId);
      if (!loadedBusiness) {
        setSession(null);
        setBusinessState(null);
        setSetupMessage("El negocio asignado no existe o esta desactivado.");
        return;
      }

      setSession({
        userId: profile.id,
        email: profile.email,
        name: profile.fullName,
        role: profile.role,
        businessId: profile.businessId,
        employeeId: profile.employeeId
      });
      setBusinessState(loadedBusiness);
    } catch (error) {
      void monitoringService.captureError(error, "auth.loadAuthenticatedUser");
      setSetupMessage("No se pudo cargar tu perfil. Verifica que las tablas de Supabase existan y tengan permisos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAuthenticatedUser();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadAuthenticatedUser();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setBusinessState(null);
  };

  if (loading) {
    return <JShellSkeleton />;
  }

  if (!session || !businessState) {
    return (
      <>
        <LoginScreen onLogin={() => void loadAuthenticatedUser()} setupMessage={setupMessage} currentUserId={currentUserId} />
        <Toast message={toast} />
      </>
    );
  }

  if (session.role === "admin" && businessState.config.onboardingCompleted !== true) {
    return (
      <>
        <OnboardingScreen
          session={session}
          businessState={businessState}
          onDone={() => void loadAuthenticatedUser()}
          onToast={showToast}
        />
        <Toast message={toast} />
      </>
    );
  }

  const updateBusiness = async (newState: AppState) => {
    setBusinessState(newState);
    if (!session.businessId) return;
    try {
      await databaseService.saveBusinessState(session.businessId, newState);
    } catch (error) {
      void monitoringService.captureError(error, "business.saveState", { businessId: session.businessId });
      showToast("No se pudo guardar en Supabase");
    }
  };

  return (
    <>
      <BusinessDashboard
        businessState={businessState}
        setBusiness={updateBusiness}
        session={session}
        onLogout={handleLogout}
        onToast={showToast}
      />
      <Toast message={toast} />
    </>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({
  onLogin,
  setupMessage,
  currentUserId
}: {
  onLogin: () => void;
  setupMessage: string;
  currentUserId: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!supabase) {
        setError("Supabase no esta configurado.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (signInError) {
        setError("Correo o contraseña incorrectos.");
        return;
      }
      onLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="j-login">
      {/* LEFT — editorial dark panel */}
      <aside className="j-login-aside">
        <div className="j-la-top">
          <div className="flex items-center gap-3">
            <div className="j-brand-mark" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", boxShadow: "none" }}>J</div>
            <div>
              <div style={{ fontWeight: 600, letterSpacing: "0.06em", fontSize: 13 }}>JACK</div>
              <div style={{ fontSize: 10.5, opacity: 0.55, letterSpacing: "0.02em" }}>
                Sistema de gestión empresarial
              </div>
            </div>
          </div>
        </div>

        <div className="j-la-quote">
          <div className="j-la-eyebrow">— Jack · 2026</div>
          <p className="j-la-q">
            Una plataforma para <i>organizar tu agenda</i>, ver tus citas y entender tu negocio en un solo lugar.
          </p>
        </div>

        <div className="j-la-stats">
          <div>
            <div className="j-la-stat-v">100%</div>
            <div className="j-la-stat-l">Acceso restringido</div>
          </div>
          <div>
            <div className="j-la-stat-v">Tiempo real</div>
            <div className="j-la-stat-l">Sincronización</div>
          </div>
          <div>
            <div className="j-la-stat-v">Supabase</div>
            <div className="j-la-stat-l">Auth + datos</div>
          </div>
        </div>

        <svg className="j-la-grid" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <pattern id="jlg" x="0" y="0" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M64 0 L0 0 0 64" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth=".5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#jlg)" />
        </svg>
      </aside>

      {/* RIGHT — form */}
      <main className="j-login-main">
        <div className="j-lm-top">
          <span>Acceso restringido. Tu administrador crea tu cuenta.</span>
        </div>

        <div className="j-lm-form-wrap">
          <form className="j-lm-form" onSubmit={handleSubmit}>
            <div className="j-lm-restricted">
              <span style={{ width: 6, height: 6, background: "var(--fg)", borderRadius: "50%" }} />
              <span>Acceso restringido</span>
            </div>

            <h1 className="j-lm-h1">
              Bienvenido <span className="serif">de vuelta</span>
            </h1>
            <p className="j-lm-sub">
              Inicia sesión con tu cuenta de Jack para acceder al panel de tu negocio.
            </p>

            <div className="j-lm-field">
              <label htmlFor="login-email">Correo electrónico</label>
              <input
                id="login-email"
                className="j-lm-input"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="j-lm-field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                className="j-lm-input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="j-lm-alert err">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {setupMessage && (
              <div className="j-lm-alert warn">
                <AlertCircle size={15} />
                <div>
                  <p style={{ margin: 0 }}>{setupMessage}</p>
                  {currentUserId && (
                    <p className="mono" style={{ marginTop: 6, fontSize: 11, wordBreak: "break-all" }}>
                      auth user id: {currentUserId}
                    </p>
                  )}
                </div>
              </div>
            )}

            <button type="submit" className="j-lm-submit" disabled={loading}>
              {loading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".25" />
                    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Iniciando sesión…
                </>
              ) : (
                <>
                  Iniciar sesión <ChevronRight size={14} />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="j-lm-foot">
          <span>© {new Date().getFullYear()} Jack</span>
          <span>·</span>
          <span>Powered by Jack</span>
          <span className="mono" style={{ marginLeft: "auto" }}>v 2.4.1</span>
        </div>
      </main>
    </div>
  );
}

// ─── Business Dashboard ───────────────────────────────────────────────────────

function BusinessDashboard({
  businessState,
  setBusiness,
  session,
  onLogout,
  onToast
}: {
  businessState: AppState;
  setBusiness: (state: AppState) => void;
  session: AppSession;
  onLogout: () => void;
  onToast: (msg: string) => void;
}) {
  const role: Role = session.role === "super_admin" ? "admin" : session.role;
  const allowedSections: Section[] = role === "employee"
    ? ["dashboard", "calendar", "appointments", "settings"]
    : ["dashboard", "calendar", "appointments", "employees", "catalog", "suppliers", "cash", "stats", "settings"];
  const sectionStorageKey = `jack:last-section:${session.userId}`;
  const [section, setSectionState] = useState<Section>(() => {
    const saved = window.localStorage.getItem(sectionStorageKey) as Section | null;
    return saved && allowedSections.includes(saved) ? saved : "dashboard";
  });
  const [filters, setFilters] = useState(defaultFilters);
  const [appointmentDraft, setAppointmentDraft] = useState<Appointment | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // P2: pestaña dentro de Citas — "list" (citas) | "web" (reservaciones web por confirmar).
  const [appointmentsTab, setAppointmentsTab] = useState<"list" | "web">("list");

  const today = todayISO();
  const currency = businessState.config.currency;

  const setSection = (next: Section) => {
    const safeNext = allowedSections.includes(next) ? next : "dashboard";
    setSectionState(safeNext);
    window.localStorage.setItem(sectionStorageKey, safeNext);
  };

  const activeEmployee = session.employeeId
    ? (businessState.employees.find((e) => e.id === session.employeeId) ?? businessState.employees[0])
    : businessState.employees[0];

  const clientById = useMemo(
    () => new Map(businessState.clients.map((c) => [c.id, c])),
    [businessState.clients]
  );
  const employeeById = useMemo(
    () => new Map(businessState.employees.map((e) => [e.id, e])),
    [businessState.employees]
  );

  // Una reserva web "por confirmar" = source public_site + status pending. Vive SOLO
  // en la pestaña "Reservaciones web". Al confirmarse (status confirmed) sale de aquí
  // y entra al listado normal de citas. Así no hay duplicados entre ambas listas (P3).
  const isPendingWebReservation = (a: Appointment) => a.source === "public_site" && a.status === "pending";

  const pendingWebReservations = useMemo(() => {
    const base = role === "employee"
      ? businessState.appointments.filter((a) => a.employeeId === activeEmployee?.id)
      : businessState.appointments;
    return base
      .filter(isPendingWebReservation)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [activeEmployee?.id, role, businessState.appointments]);

  const visibleAppointments = useMemo(() => {
    const base = role === "employee"
      ? businessState.appointments.filter((a) => a.employeeId === activeEmployee?.id)
      : businessState.appointments;
    const filtered = base.filter((a) => {
      if (isPendingWebReservation(a)) return false; // las reservas por confirmar viven en su pestaña
      const client = clientById.get(a.clientId);
      const matchesQuery = (client?.name ?? "").toLowerCase().includes(filters.query.toLowerCase());
      const matchesDate = !filters.date || a.date === filters.date;
      const matchesStatus = filters.status === "all" || a.status === filters.status;
      const matchesEmployee = filters.employeeId === "all" || a.employeeId === filters.employeeId;
      const matchesService = filters.service === "all" || a.service === filters.service;
      return matchesQuery && matchesDate && matchesStatus && matchesEmployee && matchesService;
    });
    // P5: ordenamiento por más recientes (fecha y hora desc) o por nombre de cliente.
    return filtered.sort((a, b) => {
      if (filters.sort === "client") {
        const an = (clientById.get(a.clientId)?.name ?? "").toLowerCase();
        const bn = (clientById.get(b.clientId)?.name ?? "").toLowerCase();
        return an.localeCompare(bn) || `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`);
      }
      return `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`);
    });
  }, [activeEmployee?.id, clientById, filters, role, businessState.appointments]);

  const performance = useMemo(
    () => employeePerformance(businessState.employees, businessState.appointments, businessState.clients),
    [businessState.employees, businessState.appointments, businessState.clients]
  );

  const emptyAppointment = (): Appointment => {
    const service = businessState.config.services[0];
    return {
      id: uid("apt"),
      clientId: businessState.clients[0]?.id ?? "",
      service: service?.name ?? "",
      date: today,
      time: "10:00",
      duration: service?.duration ?? 60,
      price: service?.basePrice ?? 0,
      employeeId: role === "employee" ? (activeEmployee?.id ?? "") : (businessState.employees[0]?.id ?? ""),
      status: "pending",
      paymentStatus: "none",
      depositAmount: service?.depositAmount ?? 0,
      paidAmount: 0,
      source: "dashboard",
      createdAt: new Date().toISOString(),
      notes: ""
    };
  };

  const createClientInline = (name: string, phone: string): Client => {
    const service = businessState.config.services[0];
    const newClient: Client = {
      id: uid("cli"),
      name,
      phone,
      email: "",
      requestedService: service?.name ?? "",
      amount: service?.basePrice ?? 0,
      appointmentDate: today,
      appointmentTime: "10:00",
      status: "pending",
      assignedEmployeeId: businessState.employees[0]?.id ?? "",
      notes: ""
    };
    setBusiness({ ...businessState, clients: [newClient, ...businessState.clients] });
    onToast("Cliente creado");
    return newClient;
  };

  const saveAppointment = () => {
    if (!appointmentDraft?.clientId) return onToast("Selecciona un cliente");
    if (!appointmentDraft.service) return onToast("Selecciona un servicio");
    if (!appointmentDraft.employeeId) return onToast("Selecciona un empleado");
    if (!appointmentDraft.date || !appointmentDraft.time) return onToast("Selecciona fecha y hora");
    if (!hasAvailability(
      businessState.appointments,
      appointmentDraft.date,
      appointmentDraft.time,
      appointmentDraft.employeeId,
      appointmentDraft.duration,
      appointmentDraft.id
    )) {
      return onToast("Ese horario ya esta ocupado para el empleado");
    }
    const exists = businessState.appointments.some((a) => a.id === appointmentDraft.id);
    setBusiness({
      ...businessState,
      appointments: exists
        ? businessState.appointments.map((a) => (a.id === appointmentDraft.id ? appointmentDraft : a))
        : [appointmentDraft, ...businessState.appointments]
    });
    setAppointmentDraft(null);
    onToast(exists ? "Cita actualizada" : "Cita creada");
  };

  const deleteAppointment = (id: string) => {
    if (!confirm("Eliminar esta cita?")) return;
    setBusiness({ ...businessState, appointments: businessState.appointments.filter((a) => a.id !== id) });
    // #2/#5: soft-delete explícito en la tabla normalizada para que la cita no
    // reaparezca al recargar (la fuente principal son las tablas normalizadas).
    if (session.businessId) {
      void databaseService
        .softDeleteAppointment(session.businessId, id)
        .catch((error) => monitoringService.captureError(error, "appointment.softDelete", { businessId: session.businessId, id }));
    }
    onToast("Cita eliminada");
  };

  const updateAppointmentStatus = (id: string, status: Appointment["status"]) => {
    const current = businessState.appointments.find((a) => a.id === id);
    setBusiness({
      ...businessState,
      appointments: businessState.appointments.map((a) => a.id === id ? { ...a, status } : a)
    });
    if (session.businessId && current?.status !== status) {
      void databaseService.recordAppointmentAudit({
        businessId: session.businessId,
        appointmentId: id,
        action: "status_changed",
        oldValue: current?.status,
        newValue: status
      }).catch((error) => monitoringService.captureError(error, "audit.status"));
    }
    onToast("Estado actualizado");
  };

  const updateAppointmentPayment = (id: string, paymentStatus: PaymentStatus) => {
    const current = businessState.appointments.find((appointment) => appointment.id === id);
    setBusiness({
      ...businessState,
      appointments: businessState.appointments.map((appointment) => {
        if (appointment.id !== id) return appointment;
        const paidAmount = paymentStatus === "paid" ? appointment.price : 0;
        return { ...appointment, paymentStatus, paidAmount };
      })
    });
    if (session.businessId && current?.paymentStatus !== paymentStatus) {
      void databaseService.recordAppointmentAudit({
        businessId: session.businessId,
        appointmentId: id,
        action: "payment_changed",
        oldValue: current?.paymentStatus,
        newValue: paymentStatus
      }).catch((error) => monitoringService.captureError(error, "audit.payment"));
    }
    onToast("Pago actualizado");
  };

  const exportRowsCsv = (filename: string, rows: Record<string, string | number>[]) => {
    const csv = [
      Object.keys(rows[0] ?? {}).join(","),
      ...rows.map((row) => Object.values(row).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    onToast("CSV exportado");
  };

  const exportCsv = () => {
    exportRowsCsv("citas.csv", visibleAppointments.map((a) => ({
      cliente: clientById.get(a.clientId)?.name ?? "Sin cliente",
      telefono: clientById.get(a.clientId)?.phone ?? "",
      servicio: a.service,
      fecha: a.date,
      hora: a.time,
      precio: a.price,
      pagado: a.paidAmount,
      empleado: employeeById.get(a.employeeId)?.name ?? "",
      estado: a.status,
      origen: a.source
    })));
  };

  const openAppointmentWhatsApp = (appointment: Appointment) => {
    const opened = whatsappService.openAppointment(
      appointment,
      clientById.get(appointment.clientId),
      employeeById.get(appointment.employeeId),
      businessState.config
    );
    onToast(opened ? "WhatsApp abierto" : "El cliente no tiene teléfono");
  };

  const messageClient = (client: Client) => {
    const message = `Hola ${client.name.split(" ")[0] || client.name}. Te escribimos de ${businessState.config.businessName}.`;
    const opened = whatsappService.open(client.phone, message);
    onToast(opened ? "WhatsApp abierto" : "El cliente no tiene teléfono");
  };

  const currentDate = new Date(`${today}T12:00:00`);
  const currentMonthRevenue = revenueForMonth(businessState.appointments, currentDate.getFullYear(), currentDate.getMonth());
  const prevYear = currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
  const prevMonth = currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;
  const previousMonthRevenue = revenueForMonth(businessState.appointments, prevYear, prevMonth);
  const monthlyChange = previousMonthRevenue
    ? Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)
    : 100;

  const calendarAppointments = role === "employee"
    ? businessState.appointments.filter((a) => a.employeeId === activeEmployee?.id)
    : businessState.appointments;

  const sectionMeta = pageMeta(section, role);
  const sectionInitial = (businessState.config.businessName.charAt(0) || "J").toUpperCase();
  const sessionInitials = session.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "U";

  // Group nav items by section for editorial sidebar
  const navGroups: { label: string; items: typeof navItems }[] = [
    { label: "Principal", items: navItems.filter((n) => ["dashboard", "calendar", "appointments"].includes(n.id)) },
    { label: "Operación", items: navItems.filter((n) => ["employees", "catalog", "suppliers"].includes(n.id)) },
    { label: "Análisis", items: navItems.filter((n) => ["cash", "stats"].includes(n.id)) },
    { label: "Sistema", items: navItems.filter((n) => ["settings"].includes(n.id)) }
  ];

  return (
    <div className="j-app">
      {sidebarOpen && <div className="j-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`j-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="j-brand">
          <div className="j-brand-mark">
            {businessState.config.logoUrl
              ? <img src={businessState.config.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 6 }} />
              : sectionInitial}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="j-brand-name">JACK</div>
            <div className="j-brand-sub" title={businessState.config.businessName}>
              {businessState.config.businessName}
            </div>
          </div>
        </div>

        {navGroups.map((group) => (
          group.items.length > 0 && (
            <div key={group.label}>
              <div className="j-nav-section">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const selected = section === item.id;
                // Hide settings/clients for restricted roles below in render
                if (item.id === "settings" && role === "employee") {
                  return (
                    <button key={item.id}
                            className={"j-nav-item " + (selected ? "active" : "")}
                            onClick={() => { setSection(item.id); setSidebarOpen(false); }}>
                      <Icon size={15} strokeWidth={1.5} />
                      <span>Mi perfil</span>
                    </button>
                  );
                }
                return (
                  <button key={item.id}
                          className={"j-nav-item " + (selected ? "active" : "")}
                          onClick={() => { setSection(item.id); setSidebarOpen(false); }}>
                    <Icon size={15} strokeWidth={1.5} />
                    <span>{item.label}</span>
                    {item.id === "appointments" && businessState.appointments.length > 0 && (
                      <span className="j-badge">{
                        businessState.appointments.filter((a) => a.date === today).length || ""
                      }</span>
                    )}
                  </button>
                );
              })}
            </div>
          )
        ))}

        <div className="j-sidebar-footer">
          <div className="j-session-row">
            <div className="j-avatar">{sessionInitials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.2, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {session.name}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", lineHeight: 1.2 }}>
                {session.role === "super_admin" ? "Super admin" : role === "admin" ? "Administrador" : activeEmployee?.position ?? "Empleado"}
              </div>
            </div>
            <button className="j-btn-ghost" title="Cerrar sesión" onClick={onLogout}
                    style={{ padding: 6, border: "none" }}>
              <LogOut size={15} />
            </button>
          </div>
          <div className="j-watermark">
            <span style={{ width: 5, height: 5, background: "var(--fg)", borderRadius: "50%" }} />
            Powered by Jack
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="j-main">
        <header className="j-topbar">
          <button className="j-burger" onClick={() => setSidebarOpen((v) => !v)} aria-label="Abrir menú">
            <span style={{ display: "block", width: 16 }}>
              <span style={{ display: "block", height: 1.5, background: "currentColor", marginBottom: 4 }} />
              <span style={{ display: "block", height: 1.5, background: "currentColor", marginBottom: 4 }} />
              <span style={{ display: "block", height: 1.5, background: "currentColor" }} />
            </span>
          </button>
          <div className="j-crumb">
            <span>Jack</span>
            <span className="sep">/</span>
            <span className="cur">{sectionMeta.crumb}</span>
          </div>
          <div className="j-spacer" />
          <div className="j-search">
            <Search size={13} />
            <input
              aria-label="Buscar"
              placeholder="Buscar clientes, citas, servicios..."
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
            <kbd>⌘K</kbd>
          </div>
          <button className="j-btn-primary" onClick={() => setAppointmentDraft(emptyAppointment())}>
            <Plus size={14} strokeWidth={2.25} /> Nueva cita
          </button>
        </header>

        <div className="j-page">
          <div className="j-page-head">
            <div>
              <div className="j-page-title">
                <h1>{sectionMeta.title}</h1>
                {sectionMeta.accent && <span className="accent">{sectionMeta.accent}</span>}
              </div>
              <div className="j-page-sub">{sectionMeta.sub}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>
                Hoy
              </span>
              <span className="mono" style={{ fontSize: 12.5, color: "var(--fg)" }}>
                {formatLongDate(today)}
              </span>
            </div>
          </div>

          <div className="space-y-5">
          <Suspense fallback={<div className="j-card" style={{ padding: 28, color: "var(--fg-muted)" }}>Cargando…</div>}>
          {section === "dashboard" && (
            <Dashboard
              state={businessState}
              role={role}
              activeEmployeeId={activeEmployee?.id ?? ""}
              today={today}
              monthlyChange={monthlyChange}
              onComplete={updateAppointmentStatus}
              clientById={clientById}
              employeeById={employeeById}
              onOpenAppointment={setActiveAppointment}
            />
          )}
          {section === "calendar" && (
            <CalendarView
              appointments={calendarAppointments}
              clientById={clientById}
              employeeById={employeeById}
              today={today}
              onOpenAppointment={setActiveAppointment}
            />
          )}
          {section === "appointments" && (
            <div className="space-y-4">
              {/* P2: Reservaciones web vive como subsección/pestaña dentro de Citas. */}
              <div className="j-seg" style={{ width: "fit-content" }}>
                <button type="button" className={appointmentsTab === "list" ? "active" : ""} onClick={() => setAppointmentsTab("list")}>
                  Citas
                </button>
                <button type="button" className={appointmentsTab === "web" ? "active" : ""} onClick={() => setAppointmentsTab("web")}>
                  Reservaciones web{pendingWebReservations.length > 0 ? ` (${pendingWebReservations.length})` : ""}
                </button>
              </div>
              {appointmentsTab === "list" ? (
                <AppointmentsView
                  state={businessState}
                  filters={filters}
                  setFilters={setFilters}
                  appointments={visibleAppointments}
                  clientById={clientById}
                  employeeById={employeeById}
                  onAdd={() => setAppointmentDraft(emptyAppointment())}
                  onOpen={setActiveAppointment}
                  onOpenClient={setActiveClient}
                  exportCsv={exportCsv}
                />
              ) : (
                <WebReservationsView
                  reservations={pendingWebReservations}
                  clientById={clientById}
                  employeeById={employeeById}
                  currency={currency}
                  onOpen={setActiveAppointment}
                />
              )}
            </div>
          )}
          {section === "employees" && (
            <div className="space-y-5">
              <EmployeesManager
                businessId={session.businessId ?? ""}
                employees={businessState.employees}
                appointments={businessState.appointments}
                onEmployeesChange={(next) => setBusiness({ ...businessState, employees: next })}
                onEmployeeRemoved={(id) =>
                  setBusiness({
                    ...businessState,
                    employees: businessState.employees.filter((e) => e.id !== id),
                    appointments: businessState.appointments.map((a) =>
                      a.employeeId === id ? { ...a, employeeId: "" } : a
                    )
                  })
                }
                onToast={onToast}
              />
              <EmployeesView performance={performance} currency={currency} />
            </div>
          )}
          {section === "catalog" && (
            <CatalogManager businessId={session.businessId ?? ""} state={businessState} setState={setBusiness} onToast={onToast} />
          )}
          {section === "suppliers" && (
            <SuppliersManager businessId={session.businessId ?? ""} state={businessState} setState={setBusiness} onToast={onToast} />
          )}
          {section === "stats" && <StatsManager state={businessState} today={today} />}
          {section === "cash" && (
            <CashManager
              businessId={session.businessId ?? ""}
              state={businessState}
              setState={setBusiness}
              today={today}
              closedBy={session.name}
              onToast={onToast}
            />
          )}
          {section === "settings" && role === "admin" && (
            <SettingsEditorial
              state={businessState}
              setState={setBusiness}
              onToast={onToast}
              session={session}
              businessId={session.businessId ?? ""}
            />
          )}
          {section === "settings" && role === "employee" && (
            <EmployeeSettings activeEmployee={activeEmployee!} />
          )}
          </Suspense>
          </div>
        </div>
      </div>

      <MobileBottomNav
        section={section}
        setSection={setSection}
        allowedSections={allowedSections}
        pendingCount={businessState.appointments.filter((a) => a.date === today).length}
      />

      {appointmentDraft && (
        <NewAppointmentFullScreen
          draft={appointmentDraft}
          isNew={!businessState.appointments.some((a) => a.id === appointmentDraft.id)}
          state={businessState}
          appointments={businessState.appointments}
          onChange={setAppointmentDraft}
          onSave={saveAppointment}
          onClose={() => setAppointmentDraft(null)}
          onCreateClient={createClientInline}
        />
      )}
      {activeAppointment && (
        <AppointmentDetailModal
          appointment={activeAppointment}
          client={clientById.get(activeAppointment.clientId)}
          employee={employeeById.get(activeAppointment.employeeId)}
          currency={currency}
          role={role}
          onClose={() => setActiveAppointment(null)}
          onEdit={(appointment) => {
            setActiveAppointment(null);
            setAppointmentDraft(appointment);
          }}
          onStatus={(status) => {
            updateAppointmentStatus(activeAppointment.id, status);
            setActiveAppointment({ ...activeAppointment, status });
          }}
          onPayment={(paymentStatus) => {
            updateAppointmentPayment(activeAppointment.id, paymentStatus);
            const paidAmount = paymentStatus === "paid" ? activeAppointment.price : 0;
            setActiveAppointment({ ...activeAppointment, paymentStatus, paidAmount });
          }}
          onWhatsApp={() => openAppointmentWhatsApp(activeAppointment)}
          onDelete={(id) => {
            deleteAppointment(id);
            setActiveAppointment(null);
          }}
        />
      )}
      {activeClient && (
        <Suspense fallback={null}>
          <ClientDetailModal
            client={activeClient}
            appointments={businessState.appointments}
            employeeById={employeeById}
            currency={currency}
            onClose={() => setActiveClient(null)}
            onWhatsAppClient={messageClient}
          />
        </Suspense>
      )}
    </div>
  );
}

// ─── Section title ─────────────────────────────────────────────────────────────

function sectionTitle(section: Section, role: Role) {
  return pageMeta(section, role).title;
}

function pageMeta(section: Section, role: Role): { crumb: string; title: string; accent: string; sub: string } {
  const meta: Record<Section, { crumb: string; title: string; accent: string; sub: string }> = {
    dashboard: {
      crumb: "Panel principal",
      title: role === "employee" ? "Mis" : "Panel",
      accent: role === "employee" ? "citas" : "principal",
      sub: role === "employee"
        ? "Tus citas asignadas y los próximos compromisos del día."
        : "Resumen ejecutivo del negocio en tiempo real."
    },
    calendar: {
      crumb: "Calendario",
      title: "Calendario",
      accent: "mensual",
      sub: "Vista de todas las citas del equipo. Haz clic en un día para verlo en detalle."
    },
    appointments: {
      crumb: "Citas",
      title: "Citas",
      accent: "agendadas",
      sub: "Historial, próximas reservaciones y reservas web por confirmar."
    },
    employees: {
      crumb: "Empleados",
      title: "Equipo",
      accent: "operativo",
      sub: "Rendimiento y agenda del personal."
    },
    catalog: {
      crumb: "Productos y servicios",
      title: "Productos y",
      accent: "servicios",
      sub: "Tu catálogo: precios, costos, márgenes y categorías."
    },
    suppliers: {
      crumb: "Proveedores",
      title: "Proveedores",
      accent: "y contactos",
      sub: "Quiénes te surten productos e insumos, con contacto directo."
    },
    stats: {
      crumb: "Estadísticas",
      title: "Análisis",
      accent: "comparativo",
      sub: "Métricas del negocio comparadas en el tiempo."
    },
    cash: {
      crumb: "Corte de caja",
      title: "Corte de",
      accent: "caja",
      sub: "Cierre del día por método de pago y estado de cita."
    },
    settings: {
      crumb: "Configuración",
      title: role === "employee" ? "Mi" : "Configuración",
      accent: role === "employee" ? "perfil" : "",
      sub: role === "employee"
        ? "Tus datos personales y preferencias."
        : "Ajustes de tu negocio en Jack."
    }
  };
  return meta[section];
}

// ─── Calendar View ─────────────────────────────────────────────────────────────

function CalendarView({
  appointments,
  clientById,
  employeeById,
  today,
  onOpenAppointment
}: {
  appointments: Appointment[];
  clientById: Map<string, Client>;
  employeeById: Map<string, AppState["employees"][number]>;
  today: string;
  onOpenAppointment: (appointment: Appointment) => void;
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
          return (
            <div
              key={dateStr}
              className={"j-cal-mcell" + (isToday ? " today" : "") + (isSelected ? " selected" : "")}
              onClick={() => setSelectedDay(dateStr)}
            >
              <div className="j-cal-mday">{dayNum}</div>
              {dayApts.length > 0 && (
                <div className="j-cal-mdots">
                  <div className="dots">
                    <span className="dot" />
                    {hasPending && <span className="dot pending" />}
                    {hasCancel && <span className="dot cancel" />}
                  </div>
                  <span className="cnt">{dayApts.length}</span>
                </div>
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
            <h3 className="serif" style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2, textTransform: "capitalize", fontWeight: 400 }}>
              {formatLongDate(selectedDay)}
            </h3>
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  state,
  role,
  activeEmployeeId,
  today,
  monthlyChange,
  onComplete,
  clientById,
  employeeById,
  onOpenAppointment
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
}) {
  const appointments = role === "employee"
    ? state.appointments.filter((a) => a.employeeId === activeEmployeeId)
    : state.appointments;
  const currency = state.config.currency;
  const currentDate = new Date(`${today}T12:00:00`);
  const monthRevenue = revenueForMonth(appointments, currentDate.getFullYear(), currentDate.getMonth());
  const weekRevenue = revenueForCurrentWeek(appointments, today);
  const dayRevenue = revenueForDay(appointments, today);
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
      {/* KPIs editorial */}
      <div className="j-kpis">
        <div className="j-kpi">
          <div className="j-kpi-label">Ingresos de hoy</div>
          <div className="j-kpi-value mono">{formatCurrency(dayRevenue, currency)}</div>
          <div className="j-kpi-delta">
            <span>{todayCount} cita{todayCount !== 1 ? "s" : ""} hoy</span>
          </div>
        </div>
        <div className="j-kpi">
          <div className="j-kpi-label">Ingresos semana</div>
          <div className="j-kpi-value mono">{formatCurrency(weekRevenue, currency)}</div>
          <div className="j-kpi-delta"><span>Semana operativa actual</span></div>
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
              <RevenueChart data={dailyRevenueSeries(appointments)} />
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
                <div className="serif" style={{ fontSize: 42, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--fg)" }}>
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

// ─── Appointments View ────────────────────────────────────────────────────────

// ─── Estados de cita (P3/P6) ──────────────────────────────────────────────────
// El `source` distingue reserva web (public_site) de cita normal (dashboard) y no
// cambia. Lo que cambia es el `status`. Etiquetas y opciones dependen del contexto.

function appointmentStatusLabel(apt: Appointment): string {
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
//   · reserva web por confirmar → Por confirmar / Confirmada / Cancelada
//   · cita confirmada (ex-reserva) → Confirmada / Completada / Cancelada
//   · cita normal               → Pendiente / Completada / Cancelada
function appointmentStatusChoices(apt: Appointment): { value: AppointmentStatus; label: string }[] {
  if (apt.source === "public_site" && apt.status === "pending") {
    return [
      { value: "pending", label: "Por confirmar" },
      { value: "confirmed", label: "Confirmada" },
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

function AppointmentsView({ state, filters, setFilters, appointments, clientById, employeeById, onAdd, onOpen, onOpenClient, exportCsv }: {
  state: AppState; filters: AppointmentFilters; setFilters: (f: AppointmentFilters) => void; appointments: Appointment[];
  clientById: Map<string, Client>; employeeById: Map<string, AppState["employees"][number]>;
  onAdd: () => void;
  onOpen: (a: Appointment) => void; onOpenClient: (client: Client) => void; exportCsv: () => void;
}) {
  const currency = state.config.currency;
  return (
    <section className="j-card">
      <div className="j-card-head" style={{ flexWrap: "wrap", gap: 10, padding: "12px 18px" }}>
        <div className="j-input" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", width: 220 }}>
          <Search size={14} />
          <input
            style={{ border: "none", outline: "none", flex: 1, background: "transparent", color: "var(--fg)", fontSize: 13 }}
            placeholder="Buscar por cliente…"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          />
        </div>
        <input className="j-input" style={{ width: 150 }} type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        <select className="j-input" style={{ width: 160 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as AppointmentFilters["status"] })}>
          <option value="all">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="confirmed">Confirmada</option>
          <option value="completed">Completada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select className="j-input" style={{ width: 180 }} value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}>
          <option value="all">Todos los empleados</option>
          {state.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {/* P5: ordenamiento (se eliminó el filtro por origen). */}
        <select className="j-input" style={{ width: 170 }} value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as AppointmentFilters["sort"] })}>
          <option value="recent">Más recientes</option>
          <option value="client">Nombre del cliente</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="j-btn j-btn-sm" onClick={exportCsv}><Download size={12} /> CSV</button>
          <button className="j-btn j-btn-sm j-btn-primary" onClick={onAdd}>
            <Plus size={12} strokeWidth={2.25} /> Nueva cita
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-sunken)" }}>
        <span
          className={"j-chip " + (filters.service === "all" ? "on" : "")}
          onClick={() => setFilters({ ...filters, service: "all" })}
          style={{ padding: "4px 10px", fontSize: 11.5 }}
        >
          Todos los servicios
        </span>
        {state.config.services.map((service) => (
          <span
            key={service.id}
            className={"j-chip " + (filters.service === service.name ? "on" : "")}
            onClick={() => setFilters({ ...filters, service: filters.service === service.name ? "all" : service.name })}
            style={{ padding: "4px 10px", fontSize: 11.5 }}
          >
            {service.name}
          </span>
        ))}
      </div>

      {appointments.length === 0 ? (
        <div style={{ padding: 28 }}>
          <JEmpty
            compact
            title="Sin citas"
            description="No hay citas que coincidan con los filtros actuales."
            action={
              <button className="j-btn j-btn-primary" onClick={onAdd}>
                <Plus size={13} strokeWidth={2.25} /> Agendar cita
              </button>
            }
          />
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="j-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Fecha · Hora</th>
                <th className="num">Duración</th>
                <th className="num">Precio</th>
                <th>Pago</th>
                <th>Empleado</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {/* P4/P6: filas de solo lectura. Toda acción (estado, pago, WhatsApp,
                  editar, eliminar) vive en el modal centrado de detalle. */}
              {appointments.map((apt) => {
                const client = clientById.get(apt.clientId);
                return (
                  <tr key={apt.id} className="click" onClick={() => onOpen(apt)} style={{ cursor: "pointer" }}>
                    <td
                      onClick={(e) => { if (client) { e.stopPropagation(); onOpenClient(client); } }}
                      title={client ? "Ver ficha del cliente" : undefined}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div className="j-avatar">{initialsFromName(client?.name ?? "?")}</div>
                        <div style={{ fontWeight: 500, color: "var(--fg)" }}>{client?.name ?? "Cliente eliminado"}</div>
                      </div>
                    </td>
                    <td>{apt.service}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {formatDate(apt.date)} <span style={{ color: "var(--fg-muted)" }}>· {apt.time}</span>
                    </td>
                    <td className="num mono">{apt.duration}m</td>
                    <td className="num mono">{formatCurrency(apt.price, currency)}</td>
                    <td><PaymentBadge status={apt.paymentStatus} /></td>
                    <td style={{ color: "var(--fg-muted)" }}>{employeeById.get(apt.employeeId)?.name ?? "—"}</td>
                    <td><StatusBadge status={apt.status} /></td>
                    <td className="num"><ChevronRight size={15} style={{ color: "var(--fg-muted)" }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Employees View ───────────────────────────────────────────────────────────

function EmployeesView({ performance, currency }: { performance: ReturnType<typeof employeePerformance>; currency: string }) {
  const maxRev = Math.max(...performance.map((e) => e.revenue), 1);

  if (performance.length === 0) {
    return (
      <JEmpty
        title="Sin empleados"
        description="Agrega los miembros de tu equipo para asignar citas y medir su desempeño."
      />
    );
  }

  return (
    <section className="j-card">
      <div className="j-card-head">
        <h3>Equipo</h3>
        <span className="sub">— rendimiento del mes</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="j-table">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Posición</th>
              <th className="num">Citas</th>
              <th className="num">Completadas</th>
              <th className="num">Ingresos</th>
              <th>Ocupación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {performance.map((emp) => {
              const occupancy = Math.round((emp.revenue / maxRev) * 100);
              return (
                <tr key={emp.id}>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div className="j-avatar">{initialsFromName(emp.name)}</div>
                      <div style={{ fontWeight: 500, color: "var(--fg)" }}>{emp.name}</div>
                    </div>
                  </td>
                  <td style={{ color: "var(--fg-muted)" }}>{emp.position}</td>
                  <td className="num mono">{emp.assignedCount}</td>
                  <td className="num mono">{emp.completedCount}</td>
                  <td className="num mono">{formatCurrency(emp.revenue, currency)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: "var(--bg-sunken)", borderRadius: 99, overflow: "hidden", maxWidth: 140 }}>
                        <div style={{ height: "100%", width: `${occupancy}%`, background: "var(--fg)" }} />
                      </div>
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{occupancy}%</span>
                    </div>
                  </td>
                  <td><StatusBadge status={emp.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// P4/P6: ventana de detalle CENTRADA (mismo patrón j-modal que Proveedores/Catálogo).
// Todas las acciones de la cita (estado, pago, WhatsApp, editar, eliminar) viven aquí
// como botones grandes; ya no hay edición rápida desde la tabla.
function AppointmentDetailModal({
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
  onPayment: (status: PaymentStatus) => void;
  onWhatsApp: () => void;
  onDelete: (id: string) => void;
}) {
  const isPendingWeb = appointment.source === "public_site" && appointment.status === "pending";
  const statusChoices = appointmentStatusChoices(appointment);
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

          {/* P6: pago con botones grandes (solo desde el detalle) */}
          <div className="j-field">
            <span className="j-field-label">Estado de pago</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={"j-btn" + (appointment.paymentStatus === "none" ? " j-btn-primary" : "")}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => appointment.paymentStatus !== "none" && onPayment("none")}
              >
                Sin pago
              </button>
              <button
                type="button"
                className={"j-btn" + (appointment.paymentStatus === "paid" ? " j-btn-primary" : "")}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => appointment.paymentStatus !== "paid" && onPayment("paid")}
              >
                <CreditCard size={14} /> Pagado
              </button>
            </div>
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

function EmployeeSettings({ activeEmployee }: { activeEmployee: AppState["employees"][number] }) {
  return (
    <section className="card max-w-md p-6">
      <h2 className="text-base font-semibold text-slate-950">Mi perfil</h2>
      <div className="mt-4 space-y-2">
        <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">Nombre</span><span className="font-medium text-slate-900">{activeEmployee.name}</span></div>
        <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">Cargo</span><span className="font-medium text-slate-900">{activeEmployee.position}</span></div>
        <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">Estado</span><StatusBadge status={activeEmployee.status} /></div>
      </div>
      <p className="mt-4 text-xs text-slate-400">Para cambios en tu perfil, contacta al administrador del sistema.</p>
    </section>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

// ─── Editorial: Full-screen Nueva cita ────────────────────────────────────────

function initialsFor(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function NewAppointmentFullScreen({
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

  useEffect(() => {
    if (draft.time && draft.employeeId && availableSlots.length > 0 && !availableSlots.includes(draft.time)) {
      onChange({ ...draft, time: "" });
    }
  }, [availableSlots.join("|"), draft.employeeId, draft.time]);

  const selectClient = (client: Client) => {
    onChange({ ...draft, clientId: client.id });
    setStep(1);
  };

  const selectNewClient = () => {
    if (!newClientName.trim()) return;
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
                <div className="serif" style={{ fontSize: 26, letterSpacing: "-0.01em", color: "var(--fg)" }}>
                  ¿Para qué <i>cliente</i>?
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
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <PhoneInput value={newClientPhone} onChange={setNewClientPhone} />
                      </div>
                      <button className="j-btn j-btn-primary" onClick={selectNewClient} disabled={!newClientName.trim()}>
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
                <input
                  type="date"
                  className="j-input"
                  style={{ marginBottom: 8 }}
                  value={draft.date}
                  onChange={(e) => onChange({ ...draft, date: e.target.value })}
                />
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
                <div className="serif" style={{ fontSize: 18, fontStyle: "italic", marginBottom: 6 }}>
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
                Se enviará un recordatorio automático al cliente cuando confirme la cita.
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
