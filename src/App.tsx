import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Search,
  Settings,
  Truck
} from "lucide-react";
import { PaymentBadge, StatusBadge } from "./components/Badge";
import { JShellSkeleton, JEmpty } from "./components/Editorial";
import { SettingsBusinessesAdmin } from "./features/admin/SettingsBusinessesAdmin";
import { OnboardingScreen } from "./features/onboarding/OnboardingScreen";
import { parsePhone } from "./components/PhoneInput";

// ── Code-splitting (#10) ──────────────────────────────────────────────────────
// Componentes pesados o ligados a una sola sección/ruta se cargan bajo demanda con
// React.lazy para sacarlos del chunk inicial (recharts, sitio público, managers de
// secciones secundarias). Cada uso se envuelve en <Suspense> con un fallback ligero.
const PublicBookingSite = lazy(() => import("./pages/PublicBookingSite").then((m) => ({ default: m.PublicBookingSite })));
const LegalPage = lazy(() => import("./pages/LegalPage").then((m) => ({ default: m.LegalPage })));
const LoginScreen = lazy(() => import("./features/auth/LoginScreen").then((m) => ({ default: m.LoginScreen })));
const Dashboard = lazy(() => import("./features/dashboard/Dashboard").then((m) => ({ default: m.Dashboard })));
const CalendarView = lazy(() => import("./features/calendar/CalendarView").then((m) => ({ default: m.CalendarView })));
const AppointmentDetailModal = lazy(() => import("./features/appointments/AppointmentDetailModal").then((m) => ({ default: m.AppointmentDetailModal })));
const NewAppointmentFullScreen = lazy(() => import("./features/appointments/NewAppointmentFullScreen").then((m) => ({ default: m.NewAppointmentFullScreen })));
const EmployeesManager = lazy(() => import("./features/employees/EmployeesManager").then((m) => ({ default: m.EmployeesManager })));
const CatalogManager = lazy(() => import("./features/catalog/CatalogManager").then((m) => ({ default: m.CatalogManager })));
const CashManager = lazy(() => import("./features/cash/CashManager").then((m) => ({ default: m.CashManager })));
const StatsManager = lazy(() => import("./features/stats/StatsManager").then((m) => ({ default: m.StatsManager })));
const WebReservationsView = lazy(() => import("./features/reservations/WebReservationsView").then((m) => ({ default: m.WebReservationsView })));
const SuppliersManager = lazy(() => import("./features/suppliers/SuppliersManager").then((m) => ({ default: m.SuppliersManager })));
const ClientDetailModal = lazy(() => import("./features/clients/ClientDetailModal").then((m) => ({ default: m.ClientDetailModal })));
const SettingsEditorial = lazy(() => import("./features/settings/SettingsEditorial").then((m) => ({ default: m.SettingsEditorial })));
const ProductSalesView = lazy(() => import("./features/sales/ProductSalesView").then((m) => ({ default: m.ProductSalesView })));
import { Toast } from "./components/Toast";
import {
  employeePerformance,
  revenueForCurrentWeek,
  revenueForDay,
  revenueForMonth,
  salesForCurrentWeek,
  salesForDay,
  salesForMonth
} from "./lib/calculations";
import { hasAvailability } from "./lib/availability";
import { appointmentStatusLabel } from "./lib/appointmentUi";
import { downloadExcel } from "./lib/excelExport";
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
  Client,
  PaymentStatus,
  Role,
  Sale,
  SalePaymentMethod
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

// P2: "Reservaciones web" dejó de ser una sección de nivel superior; ahora es una
// subsección (pestaña) dentro de Citas. Por eso ya no aparece en `Section`.
type Section = "dashboard" | "calendar" | "appointments" | "employees" | "catalog" | "suppliers" | "stats" | "cash" | "settings";

const normalizeOptionalPhone = (phone: string) => {
  const { country, national } = parsePhone(phone);
  if (national.length !== 10) return "";
  return `${country === "US" ? "1" : "52"}${national}`;
};

const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "appointments", label: "Agenda", icon: Clock },
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

const appointmentStatusValues = new Set(["all", "pending", "confirmed", "completed", "cancelled", "no_show"]);
const appointmentSortValues = new Set(["recent", "client"]);

function loadAppointmentFilters(storageKey: string): AppointmentFilters {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultFilters;
    const parsed = JSON.parse(raw) as Partial<AppointmentFilters>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : defaultFilters.query,
      date: typeof parsed.date === "string" ? parsed.date : defaultFilters.date,
      status: typeof parsed.status === "string" && appointmentStatusValues.has(parsed.status)
        ? parsed.status as AppointmentFilters["status"]
        : defaultFilters.status,
      employeeId: typeof parsed.employeeId === "string" ? parsed.employeeId : defaultFilters.employeeId,
      service: typeof parsed.service === "string" ? parsed.service : defaultFilters.service,
      sort: typeof parsed.sort === "string" && appointmentSortValues.has(parsed.sort)
        ? parsed.sort as AppointmentFilters["sort"]
        : defaultFilters.sort
    };
  } catch {
    return defaultFilters;
  }
}

function loadAppointmentsTab(storageKey: string): "list" | "web" {
  const saved = window.localStorage.getItem(storageKey);
  return saved === "web" ? "web" : "list";
}

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

  if (route.kind === "legal") {
    return (
      <Suspense fallback={<JShellSkeleton />}>
        <LegalPage page={route.page} />
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
      const err = error as { message?: string; code?: string; details?: string; hint?: string; name?: string };
      const message = error instanceof Error
        ? error.message
        : [err.name, err.code, err.message, err.details, err.hint]
          .filter(Boolean)
          .join(" · ") || JSON.stringify(error);
      setSetupMessage(`No se pudo cargar tu perfil. Detalle técnico: ${message}`);
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
        <Suspense fallback={<JShellSkeleton />}>
          <LoginScreen onLogin={() => void loadAuthenticatedUser()} setupMessage={setupMessage} currentUserId={currentUserId} />
        </Suspense>
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
        applyLocal={setBusinessState}
        session={session}
        onLogout={handleLogout}
        onToast={showToast}
      />
      <Toast message={toast} />
    </>
  );
}

// ─── Business Dashboard ───────────────────────────────────────────────────────

function BusinessDashboard({
  businessState,
  setBusiness,
  applyLocal,
  session,
  onLogout,
  onToast
}: {
  businessState: AppState;
  setBusiness: (state: AppState) => void;
  // #1: actualización local SIN guardado completo de app_state. Las citas/clientes
  // persisten por fila (upsert directo); applyLocal solo refresca la UI optimista.
  applyLocal: (state: AppState) => void;
  session: AppSession;
  onLogout: () => void;
  onToast: (msg: string) => void;
}) {
  const role: Role = session.role === "super_admin" ? "admin" : session.role;
  const allowedSections: Section[] = role === "employee"
    ? ["dashboard", "calendar", "appointments", "settings"]
    : ["dashboard", "calendar", "appointments", "employees", "catalog", "suppliers", "cash", "stats", "settings"];
  const sectionStorageKey = `jack:last-section:${session.userId}`;
  const appointmentsFiltersStorageKey = `jack:appointments-filters:${session.businessId ?? "global"}:${session.userId}`;
  const appointmentsTabStorageKey = `jack:appointments-tab:${session.businessId ?? "global"}:${session.userId}`;
  const [section, setSectionState] = useState<Section>(() => {
    const saved = window.localStorage.getItem(sectionStorageKey) as Section | null;
    return saved && allowedSections.includes(saved) ? saved : "dashboard";
  });
  const [filters, setFiltersState] = useState<AppointmentFilters>(() => loadAppointmentFilters(appointmentsFiltersStorageKey));
  const [appointmentDraft, setAppointmentDraft] = useState<Appointment | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Pestaña dentro de Agenda — "list" (citas) | "sales" (ventas de productos) | "web" (reservaciones web).
  const [appointmentsTabState, setAppointmentsTabState] = useState<"list" | "sales" | "web">(() => loadAppointmentsTab(appointmentsTabStorageKey) as "list" | "sales" | "web");
  const appointmentsTab = appointmentsTabState;

  const today = todayISO();
  const currency = businessState.config.currency;

  const setSection = (next: Section) => {
    const safeNext = allowedSections.includes(next) ? next : "dashboard";
    setSectionState(safeNext);
    window.localStorage.setItem(sectionStorageKey, safeNext);
  };

  const setFilters = (next: AppointmentFilters) => {
    setFiltersState(next);
    window.localStorage.setItem(appointmentsFiltersStorageKey, JSON.stringify(next));
  };

  const setAppointmentsTab = (next: "list" | "sales" | "web") => {
    setAppointmentsTabState(next);
    window.localStorage.setItem(appointmentsTabStorageKey, next);
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

  // Reservación web por aceptar = solicitud que llegó del sitio público y todavía
  // no se convierte en cita formal. Al aceptarla se vuelve cita normal pendiente.
  const isPendingWebReservation = (a: Appointment) => a.source === "public_site" && a.status === "pending";

  const pendingWebReservations = useMemo(() => {
    const base = role === "employee"
      ? businessState.appointments.filter((a) => a.employeeId === activeEmployee?.id)
      : businessState.appointments;
    return base
      .filter(isPendingWebReservation)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [activeEmployee?.id, role, businessState.appointments]);
  const pendingWebReservationsCount = pendingWebReservations.length;

  const visibleAppointments = useMemo(() => {
    const base = role === "employee"
      ? businessState.appointments.filter((a) => a.employeeId === activeEmployee?.id)
      : businessState.appointments;
    const filtered = base.filter((a) => {
      if (isPendingWebReservation(a)) return false; // solicitudes web sin aceptar viven en su pestaña
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
      clientId: "",
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

  // #1: persistencia DIRECTA por fila (no reescribe app_state completo). La cita/cliente
  // van a su tabla normalizada (fuente de verdad, RLS permite a employee sus citas) y el
  // app_state se sincroniza best-effort (compat + frescura para public-booking).
  const bizId = session.businessId;
  const persistAppointmentRow = (next: AppState, appt: Appointment) => {
    applyLocal(next);
    if (!bizId) return;
    void databaseService
      .upsertAppointment(bizId, appt)
      .catch((error) => { void monitoringService.captureError(error, "appointment.upsert", { bizId, id: appt.id }); onToast("No se pudo guardar la cita"); });
    void databaseService.saveAppStateBestEffort(bizId, next);
  };
  const persistClientRow = (next: AppState, client: Client) => {
    applyLocal(next);
    if (!bizId) return;
    void databaseService
      .upsertClient(bizId, client)
      .catch((error) => { void monitoringService.captureError(error, "client.upsert", { bizId, id: client.id }); onToast("No se pudo guardar el cliente"); });
    void databaseService.saveAppStateBestEffort(bizId, next);
  };
  // #2: secciones migradas a escritura por fila (catálogo, proveedores, caja,
  // ventas). La UI se actualiza local y el app_state se sincroniza best-effort
  // como espejo/compat; la FILA normalizada es la fuente de verdad (el manager
  // hace su upsert/softDelete por entidad). Ya NO se usa saveBusinessState aquí.
  const applyWithStateMirror = (next: AppState) => {
    applyLocal(next);
    if (bizId) void databaseService.saveAppStateBestEffort(bizId, next);
  };
  // #1 (ventas): la venta se INSERTA por fila en business_sales y el stock se
  // actualiza por producto. Así un `employee` puede vender (no puede escribir el
  // JSON completo de businesses) y no hay race con otros guardados.
  const persistSaleRow = (next: AppState, sale: Sale, stockChanges: { id: string; stock: number }[]) => {
    applyLocal(next);
    if (!bizId) return;
    void databaseService
      .insertSale(bizId, sale)
      .catch((error) => { void monitoringService.captureError(error, "sale.insert", { bizId, id: sale.id }); onToast("No se pudo guardar la venta"); });
    for (const change of stockChanges) {
      void databaseService
        .updateProductStock(bizId, change.id, change.stock)
        .catch((error) => monitoringService.captureError(error, "sale.stock", { bizId, id: change.id }));
    }
    void databaseService.saveAppStateBestEffort(bizId, next);
  };

  const createClientInline = (name: string, phone: string): Client => {
    const service = businessState.config.services[0];
    const newClient: Client = {
      id: uid("cli"),
      name,
      phone: normalizeOptionalPhone(phone),
      email: "",
      requestedService: service?.name ?? "",
      amount: service?.basePrice ?? 0,
      appointmentDate: today,
      appointmentTime: "10:00",
      status: "pending",
      assignedEmployeeId: businessState.employees[0]?.id ?? "",
      notes: ""
    };
    persistClientRow({ ...businessState, clients: [newClient, ...businessState.clients] }, newClient);
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
    const next = {
      ...businessState,
      appointments: exists
        ? businessState.appointments.map((a) => (a.id === appointmentDraft.id ? appointmentDraft : a))
        : [appointmentDraft, ...businessState.appointments]
    };
    persistAppointmentRow(next, appointmentDraft);
    setAppointmentDraft(null);
    onToast(exists ? "Cita actualizada" : "Cita creada");
  };

  const deleteAppointment = (id: string) => {
    if (!confirm("Eliminar esta cita?")) return;
    const next = { ...businessState, appointments: businessState.appointments.filter((a) => a.id !== id) };
    applyLocal(next);
    // #1/#2/#5: soft-delete DIRECTO por fila (fuente de verdad) + app_state best-effort.
    if (bizId) {
      void databaseService
        .softDeleteAppointment(bizId, id)
        .catch((error) => monitoringService.captureError(error, "appointment.softDelete", { bizId, id }));
      void databaseService.saveAppStateBestEffort(bizId, next);
    }
    onToast("Cita eliminada");
  };

  const updateAppointmentStatus = (id: string, status: Appointment["status"]) => {
    const current = businessState.appointments.find((a) => a.id === id);
    if (!current) return null;
    const acceptsWebReservation = current.source === "public_site" && current.status === "pending" && status === "confirmed";
    const updatedAppointment: Appointment = acceptsWebReservation
      ? { ...current, source: "dashboard", status: "pending" }
      : { ...current, status };
    persistAppointmentRow(
      {
        ...businessState,
        appointments: businessState.appointments.map((appointment) => appointment.id === id ? updatedAppointment : appointment)
      },
      updatedAppointment
    );
    if (session.businessId && (current.status !== updatedAppointment.status || current.source !== updatedAppointment.source)) {
      void databaseService.recordAppointmentAudit({
        businessId: session.businessId,
        appointmentId: id,
        action: "status_changed",
        oldValue: `${current.source}:${current.status}`,
        newValue: `${updatedAppointment.source}:${updatedAppointment.status}`
      }).catch((error) => monitoringService.captureError(error, "audit.status"));
    }
    onToast(acceptsWebReservation ? "Reserva aceptada como cita pendiente" : "Estado actualizado");
    return updatedAppointment;
  };

  const updateAppointmentPayment = (id: string, paymentStatus: PaymentStatus, paymentMethod?: SalePaymentMethod) => {
    const current = businessState.appointments.find((appointment) => appointment.id === id);
    if (!current) return;
    const updatedAppointment: Appointment = {
      ...current,
      paymentStatus,
      // Corte v2: al pagar se registra el método; al quitar el pago se limpia.
      paymentMethod: paymentStatus === "paid" ? (paymentMethod ?? current.paymentMethod) : undefined,
      paidAmount: paymentStatus === "paid" ? current.price : 0
    };
    persistAppointmentRow(
      {
        ...businessState,
        appointments: businessState.appointments.map((appointment) => appointment.id === id ? updatedAppointment : appointment)
      },
      updatedAppointment
    );
    if (session.businessId && (current.paymentStatus !== paymentStatus || current.paymentMethod !== updatedAppointment.paymentMethod)) {
      void databaseService.recordAppointmentAudit({
        businessId: session.businessId,
        appointmentId: id,
        action: "payment_changed",
        oldValue: current?.paymentStatus,
        newValue: paymentStatus === "paid" && updatedAppointment.paymentMethod ? `paid:${updatedAppointment.paymentMethod}` : paymentStatus
      }).catch((error) => monitoringService.captureError(error, "audit.payment"));
    }
    onToast("Pago actualizado");
  };

  const appointmentExcelRows = (appointments: Appointment[]) => appointments.map((a) => ({
    Cliente: clientById.get(a.clientId)?.name ?? "Sin cliente",
    Teléfono: clientById.get(a.clientId)?.phone ?? "",
    Servicio: a.service,
    Fecha: a.date,
    Hora: a.time,
    Duración: a.duration,
    Precio: a.price,
    Pagado: a.paidAmount,
    Saldo: Math.max(a.price - a.paidAmount, 0),
    Empleado: employeeById.get(a.employeeId)?.name ?? "",
    Estado: appointmentStatusLabel(a),
    Pago: a.paymentStatus === "paid" ? "Pagado" : "Sin pagar",
    Origen: a.source === "public_site" ? "Sitio web" : "Dashboard",
    Notas: a.notes ?? ""
  }));

  const exportAppointmentsExcel = () => {
    downloadExcel("citas", "Citas", appointmentExcelRows(visibleAppointments));
    onToast("Exportación descargada");
  };

  const exportDashboardExcel = () => {
    const appointments = role === "employee"
      ? businessState.appointments.filter((a) => a.employeeId === activeEmployee?.id)
      : businessState.appointments;
    const sales = role === "employee"
      ? allSales.filter((s) => s.employeeId === activeEmployee?.id)
      : allSales;
    const now = new Date(`${today}T12:00:00`);
    downloadExcel("dashboard", "Dashboard Jack", [
      { Métrica: "Ingresos de hoy (citas + ventas)", Valor: revenueForDay(appointments, today) + salesForDay(sales, today) },
      { Métrica: "Ingresos de la semana (citas + ventas)", Valor: revenueForCurrentWeek(appointments, today) + salesForCurrentWeek(sales, today) },
      { Métrica: "Ingresos del mes (citas + ventas)", Valor: revenueForMonth(appointments, now.getFullYear(), now.getMonth()) + salesForMonth(sales, now.getFullYear(), now.getMonth()) },
      { Métrica: "Total de citas", Valor: appointments.length },
      { Métrica: "Ventas de productos", Valor: sales.length },
      { Métrica: "Clientes registrados", Valor: businessState.clients.length },
      { Métrica: "Cambio mensual %", Valor: monthlyChange }
    ]);
    onToast("Exportación descargada");
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
  // #3: el cambio mensual compara citas + ventas de productos (misma base que los
  // KPIs del dashboard, para no mostrar un % calculado sobre otra cifra).
  const allSales = businessState.sales ?? [];
  const currentMonthRevenue = revenueForMonth(businessState.appointments, currentDate.getFullYear(), currentDate.getMonth())
    + salesForMonth(allSales, currentDate.getFullYear(), currentDate.getMonth());
  const prevYear = currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
  const prevMonth = currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;
  const previousMonthRevenue = revenueForMonth(businessState.appointments, prevYear, prevMonth)
    + salesForMonth(allSales, prevYear, prevMonth);
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
              onExportExcel={exportDashboardExcel}
            />
          )}
          {section === "calendar" && (
            <CalendarView
              appointments={calendarAppointments}
              clientById={clientById}
              employeeById={employeeById}
              today={today}
              onOpenAppointment={setActiveAppointment}
              onNewAppointment={(date) => setAppointmentDraft({ ...emptyAppointment(), date })}
              onExportExcel={(appointments) => {
                downloadExcel("calendario", "Calendario", appointmentExcelRows(appointments));
                onToast("Exportación descargada");
              }}
            />
          )}
          {section === "appointments" && (
            <div className="space-y-4">
              {/* Pestañas dentro de Agenda: Citas | Ventas | Reservaciones web */}
              <div className="j-seg" style={{ width: "fit-content" }}>
                <button type="button" className={appointmentsTab === "list" ? "active" : ""} onClick={() => setAppointmentsTab("list")}>
                  Citas
                </button>
                <button type="button" className={appointmentsTab === "sales" ? "active" : ""} onClick={() => setAppointmentsTab("sales")}>
                  Ventas
                </button>
                <button type="button" className={appointmentsTab === "web" ? "active" : ""} onClick={() => setAppointmentsTab("web")}>
                  Reservaciones web{pendingWebReservationsCount > 0 ? ` (${pendingWebReservationsCount})` : ""}
                </button>
              </div>
              {appointmentsTab === "list" && (
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
                  exportExcel={exportAppointmentsExcel}
                />
              )}
              {appointmentsTab === "sales" && (
                <Suspense fallback={<JShellSkeleton />}>
                  <ProductSalesView
                    state={businessState}
                    onRegisterSale={persistSaleRow}
                    currency={currency}
                    employeeId={session.employeeId}
                    employees={businessState.employees}
                    onToast={onToast}
                  />
                </Suspense>
              )}
              {appointmentsTab === "web" && (
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
            <CatalogManager businessId={session.businessId ?? ""} state={businessState} setState={applyWithStateMirror} onToast={onToast} />
          )}
          {section === "suppliers" && (
            <SuppliersManager businessId={session.businessId ?? ""} state={businessState} setState={applyWithStateMirror} onToast={onToast} />
          )}
          {section === "stats" && <StatsManager state={businessState} today={today} />}
          {section === "cash" && (
            <CashManager
              businessId={session.businessId ?? ""}
              state={businessState}
              setState={applyWithStateMirror}
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}
      {activeAppointment && (
        <Suspense fallback={null}>
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
            const updated = updateAppointmentStatus(activeAppointment.id, status);
            setActiveAppointment(updated ?? { ...activeAppointment, status });
          }}
          onPayment={(paymentStatus, paymentMethod) => {
            updateAppointmentPayment(activeAppointment.id, paymentStatus, paymentMethod);
            const paidAmount = paymentStatus === "paid" ? activeAppointment.price : 0;
            setActiveAppointment({
              ...activeAppointment,
              paymentStatus,
              paymentMethod: paymentStatus === "paid" ? (paymentMethod ?? activeAppointment.paymentMethod) : undefined,
              paidAmount
            });
          }}
          onWhatsApp={() => openAppointmentWhatsApp(activeAppointment)}
          onDelete={(id) => {
            deleteAppointment(id);
            setActiveAppointment(null);
          }}
        />
        </Suspense>
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

// ─── Page meta ──────────────────────────────────────────────────────────────────

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
      crumb: "Agenda",
      title: "Agenda",
      accent: "y ventas",
      sub: "Citas agendadas, registro de ventas de productos y reservas web por confirmar."
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

// ─── Appointments View ────────────────────────────────────────────────────────

function AppointmentsView({ state, filters, setFilters, appointments, clientById, employeeById, onAdd, onOpen, onOpenClient, exportExcel }: {
  state: AppState; filters: AppointmentFilters; setFilters: (f: AppointmentFilters) => void; appointments: Appointment[];
  clientById: Map<string, Client>; employeeById: Map<string, AppState["employees"][number]>;
  onAdd: () => void;
  onOpen: (a: Appointment) => void; onOpenClient: (client: Client) => void; exportExcel: () => void;
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
          <button className="j-btn j-btn-sm" onClick={exportExcel}><Download size={12} /> Exportar</button>
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
  const exportExcel = () => {
    downloadExcel("rendimiento-empleados", "Rendimiento de empleados", performance.map((emp) => ({
      Empleado: emp.name,
      Puesto: emp.position,
      Citas: emp.assignedCount,
      Completadas: emp.completedCount,
      Ingresos: emp.revenue,
      Ocupación: `${Math.round((emp.revenue / maxRev) * 100)}%`,
      Estado: emp.status
    })));
  };

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
        <button className="j-btn j-btn-sm" onClick={exportExcel} style={{ marginLeft: "auto" }}>
          <Download size={12} /> Exportar
        </button>
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
