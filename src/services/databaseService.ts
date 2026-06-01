import type { AppState, AuthProfile, EmployeeStatus } from "../types";
import { supabase } from "./supabaseClient";

// ─── Tipos de apoyo ───────────────────────────────────────────────────────────

export interface EmployeeAccount {
  id: string;
  name: string;
  position: string;
  status: EmployeeStatus;
  email: string | null;
  profileId: string | null;
}

export interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  publicSiteEnabled: boolean;
}

export interface PublicBusinessSummary {
  id: string;
  name: string;
  slug: string;
  config: AppState["config"];
  employees: AppState["employees"];
  appointments: AppState["appointments"];
}

// ─── Helper para invocar el Edge Function de administración de cuentas ──────────
// `admin-manage-user` corre con service_role y verifica al solicitante por su JWT
// (que supabase-js adjunta automáticamente). Devuelve 4xx/5xx con { error } en
// caso de fallo controlado; aquí lo normalizamos a una excepción legible.
async function invokeAdminUser<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!supabase) {
    throw new Error(
      "Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local."
    );
  }
  const { data, error } = await supabase.functions.invoke("admin-manage-user", {
    body: { action, ...payload }
  });
  if (error) {
    // 1) Fallo controlado de la función: llega como HTTP no-2xx con cuerpo { error }.
    //    En supabase-js, `error.context` es la Response original (FunctionsHttpError).
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const parsed = await context.json();
        if (parsed?.error) throw new Error(parsed.error);
      } catch (parseErr) {
        // Si el throw de arriba fue el { error } legible, propágalo.
        if (parseErr instanceof Error && parseErr.message && !/json|body|unexpected/i.test(parseErr.message)) {
          throw parseErr;
        }
        // Si no, la respuesta no traía JSON legible: seguimos al diagnóstico de red.
      }
    }
    // 2) FunctionsFetchError: el navegador no pudo contactar la función. Casi siempre
    //    significa que `admin-manage-user` no está desplegada, la URL de Supabase es
    //    incorrecta, o la sesión caducó. Damos un mensaje accionable en vez del genérico
    //    "Failed to send a request to the Edge Function".
    if ((error as { name?: string }).name === "FunctionsFetchError") {
      throw new Error(
        "No se pudo contactar la función 'admin-manage-user'. Verifica que esté desplegada " +
        "(supabase functions deploy admin-manage-user), que VITE_SUPABASE_URL sea correcta y que tu sesión siga activa."
      );
    }
    throw new Error(error.message || "No se pudo completar la operación de cuenta.");
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

function normalizePaymentState(state: AppState): AppState {
  return {
    ...state,
    appointments: state.appointments.map((appointment) => {
      const isPaid = appointment.paymentStatus === "paid";
      return {
        ...appointment,
        paymentStatus: isPaid ? "paid" : "none",
        paidAmount: isPaid ? (appointment.paidAmount || appointment.price) : 0
      };
    })
  };
}

const normalizedAvailable = (error: unknown) => {
  const message = String((error as { message?: string })?.message ?? "");
  return !message.includes("business_services") &&
    !message.includes("business_employees") &&
    !message.includes("business_clients") &&
    !message.includes("business_appointments") &&
    !message.includes("relation") &&
    !message.includes("does not exist");
};

async function loadNormalizedState(businessId: string, fallbackConfig: AppState["config"]): Promise<AppState | null> {
  if (!supabase) return null;
  const [servicesRes, employeesRes, clientsRes, appointmentsRes] = await Promise.all([
    supabase.from("business_services").select("*").eq("business_id", businessId).eq("active", true).order("created_at"),
    supabase.from("business_employees").select("*").eq("business_id", businessId).order("created_at"),
    supabase.from("business_clients").select("*").eq("business_id", businessId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("business_appointments").select("*").eq("business_id", businessId).is("deleted_at", null).order("date").order("time")
  ]);

  const firstError = servicesRes.error ?? employeesRes.error ?? clientsRes.error ?? appointmentsRes.error;
  if (firstError) {
    if (!normalizedAvailable(firstError)) return null;
    throw firstError;
  }

  const hasData =
    (servicesRes.data?.length ?? 0) +
    (employeesRes.data?.length ?? 0) +
    (clientsRes.data?.length ?? 0) +
    (appointmentsRes.data?.length ?? 0) > 0;
  if (!hasData) return null;

  return {
    config: {
      ...fallbackConfig,
      services: (servicesRes.data ?? []).map((service) => ({
        id: service.id,
        name: service.name,
        basePrice: Number(service.base_price ?? 0),
        duration: Number(service.duration_minutes ?? 60),
        depositRequired: Boolean(service.deposit_required),
        depositAmount: Number(service.deposit_amount ?? 0)
      }))
    },
    employees: (employeesRes.data ?? []).map((employee) => ({
      id: employee.id,
      name: employee.name,
      position: employee.position,
      status: employee.status
    })),
    clients: (clientsRes.data ?? []).map((client) => ({
      id: client.id,
      name: client.name,
      phone: client.phone ?? "",
      email: client.email ?? undefined,
      requestedService: "",
      amount: 0,
      appointmentDate: "",
      appointmentTime: "",
      status: "pending",
      assignedEmployeeId: "",
      notes: client.notes ?? undefined
    })),
    appointments: (appointmentsRes.data ?? []).map((appointment) => ({
      id: appointment.id,
      clientId: appointment.client_id ?? "",
      service: appointment.service_name,
      date: appointment.date,
      time: String(appointment.time).slice(0, 5),
      duration: Number(appointment.duration_minutes ?? 60),
      price: Number(appointment.price ?? 0),
      employeeId: appointment.employee_id ?? "",
      status: appointment.status,
      paymentStatus: appointment.payment_status === "paid" ? "paid" : "none",
      depositAmount: 0,
      paidAmount: Number(appointment.paid_amount ?? 0),
      source: appointment.source ?? "dashboard",
      createdAt: appointment.created_at,
      notes: appointment.notes ?? undefined
    }))
  };
}

async function mirrorNormalizedState(businessId: string, state: AppState): Promise<void> {
  if (!supabase) return;
  const services = state.config.services.map((service) => ({
    id: service.id,
    business_id: businessId,
    name: service.name,
    base_price: service.basePrice,
    duration_minutes: service.duration,
    deposit_required: false,
    deposit_amount: 0,
    active: true
  }));
  const employees = state.employees.map((employee) => ({
    id: employee.id,
    business_id: businessId,
    name: employee.name,
    position: employee.position,
    status: employee.status
  }));
  const clients = state.clients.map((client) => ({
    id: client.id,
    business_id: businessId,
    name: client.name,
    phone: client.phone ?? "",
    email: client.email ?? null,
    notes: client.notes ?? null
  }));
  const appointments = state.appointments.map((appointment) => ({
    id: appointment.id,
    business_id: businessId,
    client_id: appointment.clientId || null,
    employee_id: appointment.employeeId || null,
    service_name: appointment.service,
    date: appointment.date,
    time: appointment.time,
    duration_minutes: appointment.duration,
    price: appointment.price,
    status: appointment.status,
    payment_status: appointment.paymentStatus === "paid" ? "paid" : "none",
    paid_amount: appointment.paymentStatus === "paid" ? appointment.price : 0,
    source: appointment.source,
    notes: appointment.notes ?? null,
    created_at: appointment.createdAt
  }));

  const results = await Promise.all([
    services.length ? supabase.from("business_services").upsert(services) : Promise.resolve({ error: null }),
    employees.length ? supabase.from("business_employees").upsert(employees) : Promise.resolve({ error: null }),
    clients.length ? supabase.from("business_clients").upsert(clients) : Promise.resolve({ error: null }),
    appointments.length ? supabase.from("business_appointments").upsert(appointments) : Promise.resolve({ error: null })
  ]);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError && normalizedAvailable(firstError)) throw firstError;
}

export const databaseService = {
  async loadProfile(userId: string): Promise<AuthProfile | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,business_id,employee_id,active")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      role: data.role,
      businessId: data.business_id ?? undefined,
      employeeId: data.employee_id ?? undefined,
      active: data.active
    };
  },

  async loadBusinessState(businessId: string): Promise<AppState | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("businesses")
      .select("app_state,active,onboarding_completed")
      .eq("id", businessId)
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.active) return null;
    const fallback = normalizePaymentState(data.app_state as AppState);
    fallback.config.onboardingCompleted = Boolean(data.onboarding_completed);
    const normalized = await loadNormalizedState(businessId, fallback.config);
    if (normalized) {
      // Cortes de caja y proveedores viven en app_state (nivel raíz, fuera de
      // config para no exponerlos al sitio público); la capa normalizada no los
      // reconstruye, así que los preservamos desde el fallback.
      normalized.cashCuts = fallback.cashCuts ?? [];
      normalized.suppliers = fallback.suppliers ?? [];
      return normalized;
    }
    return fallback;
  },

  async saveBusinessState(businessId: string, state: AppState): Promise<void> {
    if (!supabase) return;

    const { error } = await supabase
      .from("businesses")
      .update({ app_state: state, updated_at: new Date().toISOString() })
      .eq("id", businessId);

    if (error) throw error;
    await mirrorNormalizedState(businessId, state);
  },

  // ─── Cuentas: empleados (creados directamente por el administrador) ────────

  async listEmployeeAccounts(businessId: string): Promise<EmployeeAccount[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("business_employees")
      .select("id,name,position,status,email,profile_id")
      .eq("business_id", businessId)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      status: row.status,
      email: row.email ?? null,
      profileId: row.profile_id ?? null
    }));
  },

  async createEmployee(input: {
    name: string;
    email: string;
    password: string;
    position?: string;
    employeeId?: string;
  }): Promise<EmployeeAccount> {
    const data = await invokeAdminUser<{ employee: EmployeeAccount }>("create_employee", input);
    return data.employee;
  },

  async updateEmployee(input: {
    employeeId: string;
    name?: string;
    position?: string;
    status?: EmployeeStatus;
    password?: string;
  }): Promise<void> {
    await invokeAdminUser("update_employee", input);
  },

  async deleteEmployee(employeeId: string): Promise<void> {
    await invokeAdminUser("delete_employee", { employeeId });
  },

  // ─── Cuentas: negocios + administradores (solo super_admin) ────────────────

  async listBusinesses(): Promise<BusinessSummary[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,slug,active,public_site_enabled")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      active: row.active,
      publicSiteEnabled: Boolean(row.public_site_enabled)
    }));
  },

  async createBusinessWithAdmin(input: {
    businessName: string;
    slug?: string;
    businessType?: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }): Promise<{ id: string; name: string; slug: string }> {
    const data = await invokeAdminUser<{ business: { id: string; name: string; slug: string } }>(
      "create_business_admin",
      input
    );
    return data.business;
  },

  // ─── Onboarding inicial del negocio (primer ingreso del administrador) ─────

  async completeOnboarding(input: {
    firstName: string;
    lastName: string;
    businessType: string;
    howFound: string;
  }): Promise<{ fullName: string; businessType: string; howFound: string }> {
    return invokeAdminUser<{ fullName: string; businessType: string; howFound: string }>(
      "complete_onboarding",
      input
    );
  },

  // ─── Sitio público (Wave 3) ─────────────────────────────────────────────────

  async loadPublicBusinessBySlug(slug: string): Promise<PublicBusinessSummary | null> {
    if (!supabase) return null;
    const { data: publicData, error: rpcError } = await supabase.rpc("get_public_business", { p_slug: slug });
    if (!rpcError && publicData) {
      return {
        id: publicData.id,
        name: publicData.name,
        slug: publicData.slug,
        config: publicData.config,
        employees: publicData.employees ?? [],
        appointments: publicData.appointments ?? []
      };
    }

    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,slug,app_state,public_site_enabled,active")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return null;
    if (!data || !data.active || !data.public_site_enabled) return null;
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      config: (data.app_state as AppState).config,
      employees: (data.app_state as AppState).employees ?? [],
      appointments: (data.app_state as AppState).appointments ?? []
    };
  },

  /** Reserva pública: lee estado actual, appendea la cita, guarda. */
  async publicCreateAppointment(businessId: string, appointment: AppState["appointments"][number], newClient: AppState["clients"][number]): Promise<void> {
    if (!supabase) throw new Error("Supabase no configurado");
    // Esto requiere una política RLS pública para insertar en businesses.app_state
    // o una Edge Function. Por ahora usamos la edge function `public-booking`.
    const { error } = await supabase.functions.invoke("public-booking", {
      body: { businessId, appointment, newClient }
    });
    if (error) throw error;
  },

  async setBusinessPublicSiteEnabled(businessId: string, enabled: boolean): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("businesses")
      .update({ public_site_enabled: enabled })
      .eq("id", businessId);
    if (error) throw error;
  },

  async recordAppointmentAudit(input: {
    businessId: string;
    appointmentId: string;
    action: string;
    oldValue?: string;
    newValue?: string;
  }): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc("record_appointment_audit", {
      p_business_id: input.businessId,
      p_appointment_id: input.appointmentId,
      p_action: input.action,
      p_old_value: input.oldValue ?? null,
      p_new_value: input.newValue ?? null
    });
    if (error && normalizedAvailable(error)) throw error;
  }
};
