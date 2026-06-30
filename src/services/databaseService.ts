import type { AppState, AuthProfile, EmployeeStatus, PaymentStatus } from "../types";
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
  businessType?: string;
  createdAt?: string;
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
  const err = error as { message?: string; code?: string; details?: string; hint?: string };
  const message = [err.code, err.message, err.details, err.hint].filter(Boolean).join(" ").toLowerCase();
  const optionalOrNormalizedTables = [
    "business_services",
    "business_employees",
    "business_clients",
    "business_appointments",
    "business_product_categories",
    "business_products",
    "business_suppliers",
    "business_cash_cuts",
    "business_sales"
  ];
  return !optionalOrNormalizedTables.some((table) => message.includes(table)) &&
    !message.includes("pgrst205") &&
    !message.includes("schema cache") &&
    !message.includes("could not find the table") &&
    !message.includes("relation") &&
    !message.includes("does not exist");
};

// Carga la capa normalizada con FALLBACK POR ENTIDAD (#2/#6, mini-lote: clientes +
// citas como fuente principal). Si una tabla normalizada está vacía o aún no
// existe, esa entidad cae a `app_state` para no mostrar listas vacías por una
// migración parcial. Las citas y los clientes filtran `deleted_at is null`, así un
// registro borrado no reaparece.
async function loadNormalizedState(businessId: string, fallback: AppState): Promise<AppState | null> {
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

  const servicesRows = servicesRes.data ?? [];
  const employeesRows = employeesRes.data ?? [];
  const clientsRows = clientsRes.data ?? [];
  const appointmentsRows = appointmentsRes.data ?? [];

  const hasData =
    servicesRows.length + employeesRows.length + clientsRows.length + appointmentsRows.length > 0;
  if (!hasData) return null;

  // Servicios/empleados todavía NO se migran en este lote: si la tabla normalizada
  // trae datos los usamos, pero si está vacía caemos a app_state (sin romper).
  const services = servicesRows.length
    ? servicesRows.map((service) => ({
        id: service.id,
        name: service.name,
        basePrice: Number(service.base_price ?? 0),
        duration: Number(service.duration_minutes ?? 60),
        depositRequired: Boolean(service.deposit_required),
        depositAmount: Number(service.deposit_amount ?? 0)
      }))
    : fallback.config.services;

  const employees = employeesRows.length
    ? employeesRows.map((employee) => ({
        id: employee.id,
        name: employee.name,
        position: employee.position,
        status: employee.status
      }))
    : fallback.employees;

  // CLIENTES: fuente principal normalizada; fallback por entidad a app_state.
  const clients = clientsRows.length
    ? clientsRows.map((client) => ({
        id: client.id,
        name: client.name,
        phone: client.phone ?? "",
        email: client.email ?? undefined,
        requestedService: "",
        amount: 0,
        appointmentDate: "",
        appointmentTime: "",
        status: "pending" as const,
        assignedEmployeeId: "",
        notes: client.notes ?? undefined
      }))
    : fallback.clients;

  // CITAS: fuente principal normalizada; fallback por entidad a app_state.
  const appointments = appointmentsRows.length
    ? appointmentsRows.map((appointment) => ({
        id: appointment.id,
        clientId: appointment.client_id ?? "",
        service: appointment.service_name,
        date: appointment.date,
        time: String(appointment.time).slice(0, 5),
        duration: Number(appointment.duration_minutes ?? 60),
        price: Number(appointment.price ?? 0),
        employeeId: appointment.employee_id ?? "",
        status: appointment.status,
        paymentStatus: (appointment.payment_status === "paid" ? "paid" : "none") as PaymentStatus,
        paymentMethod: appointment.payment_method ?? undefined,
        depositAmount: 0,
        paidAmount: Number(appointment.paid_amount ?? 0),
        source: appointment.source ?? "dashboard",
        createdAt: appointment.created_at,
        notes: appointment.notes ?? undefined
      }))
    : fallback.appointments;

  // CATÁLOGO (#C): categorías + productos. Fetch SEPARADO y tolerante: si las tablas
  // de catálogo no existen todavía (BD sin catalog_products.sql) NO se rompe la carga
  // de citas/clientes; cae a app_state solo para catálogo. Fallback POR ENTIDAD.
  let categories = fallback.config.categories ?? [];
  let products = fallback.config.products ?? [];
  try {
    const [catRes, prodRes] = await Promise.all([
      supabase.from("business_product_categories").select("*").eq("business_id", businessId).order("created_at"),
      supabase.from("business_products").select("*").eq("business_id", businessId).eq("active", true).order("created_at")
    ]);
    const catalogErr = catRes.error ?? prodRes.error;
    if (catalogErr) {
      if (normalizedAvailable(catalogErr)) throw catalogErr; // error real → propaga
      // tabla ausente → conserva fallback de app_state
    } else {
      if ((catRes.data?.length ?? 0) > 0) {
        categories = (catRes.data ?? []).map((category) => ({ id: category.id, name: category.name }));
      }
      if ((prodRes.data?.length ?? 0) > 0) {
        products = (prodRes.data ?? []).map((product) => ({
          id: product.id,
          name: product.name,
          categoryId: product.category_id ?? undefined,
          cost: Number(product.cost ?? 0),
          costType: product.cost_type === "gross" ? "gross" : "net",
          salePrice: Number(product.sale_price ?? 0),
          stock: product.stock != null ? Number(product.stock) : undefined,
          lowStock: product.low_stock != null ? Number(product.low_stock) : undefined
        }));
      }
    }
  } catch (catalogErr) {
    if (normalizedAvailable(catalogErr)) throw catalogErr;
  }

  // PROVEEDORES (#D): viven a nivel RAÍZ de AppState (fuera de config) para no
  // exponerse al sitio público. Fetch separado y tolerante; filtra `deleted_at is
  // null`; fallback por entidad a app_state.suppliers.
  let suppliers = fallback.suppliers ?? [];
  try {
    const supRes = await supabase
      .from("business_suppliers")
      .select("*")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (supRes.error) {
      if (normalizedAvailable(supRes.error)) throw supRes.error;
    } else if ((supRes.data?.length ?? 0) > 0) {
      suppliers = (supRes.data ?? []).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        contactName: supplier.contact_name ?? undefined,
        phone: supplier.phone ?? undefined,
        email: supplier.email ?? undefined,
        category: supplier.category ?? undefined,
        notes: supplier.notes ?? undefined
      }));
    }
  } catch (supErr) {
    if (normalizedAvailable(supErr)) throw supErr;
  }

  // CORTE DE CAJA (#E): vive a nivel RAÍZ de AppState (datos financieros, fuera de
  // config → no se exponen al sitio público). Fetch separado y tolerante; filtra
  // `deleted_at is null`; fallback por entidad a app_state.cashCuts. Se mapean TODOS
  // los campos por método/retiro (la tabla se extendió en normalize_cash_cuts.sql).
  const numOrUndef = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  let cashCuts = fallback.cashCuts ?? [];
  try {
    const cutsRes = await supabase
      .from("business_cash_cuts")
      .select("*")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("cut_date", { ascending: false });
    if (cutsRes.error) {
      if (normalizedAvailable(cutsRes.error)) throw cutsRes.error;
    } else if ((cutsRes.data?.length ?? 0) > 0) {
      cashCuts = (cutsRes.data ?? []).map((cut) => ({
        id: cut.id,
        date: cut.cut_date,
        closedAt: cut.closed_at,
        closedBy: cut.closed_by ?? "",
        openingFloat: Number(cut.opening_float ?? 0),
        total: Number(cut.total ?? 0),
        paidCount: Number(cut.paid_count ?? 0),
        pendingBalance: Number(cut.pending_balance ?? 0),
        movements: Number(cut.movements ?? 0),
        notes: cut.notes ?? undefined,
        cashAmount: numOrUndef(cut.cash_amount),
        cardCredit: numOrUndef(cut.card_credit),
        cardDebit: numOrUndef(cut.card_debit),
        transfer: numOrUndef(cut.transfer),
        totalReceived: numOrUndef(cut.total_received),
        expectedTotal: numOrUndef(cut.expected_total),
        difference: numOrUndef(cut.difference),
        withdrawal: numOrUndef(cut.withdrawal),
        cashRemaining: numOrUndef(cut.cash_remaining),
        // Corte v2: esperado por método + ventas de productos (cash_cut_v2.sql)
        expectedCash: numOrUndef(cut.expected_cash),
        expectedCardCredit: numOrUndef(cut.expected_card_credit),
        expectedCardDebit: numOrUndef(cut.expected_card_debit),
        expectedTransfer: numOrUndef(cut.expected_transfer),
        expectedUnassigned: numOrUndef(cut.expected_unassigned),
        salesTotal: numOrUndef(cut.sales_total),
        salesCount: numOrUndef(cut.sales_count)
      }));
    }
  } catch (cutsErr) {
    if (normalizedAvailable(cutsErr)) throw cutsErr;
  }

  // VENTAS de productos: fuente principal business_sales (insertadas por fila,
  // incluso por empleados); fallback por entidad a app_state.sales si la tabla
  // no existe o está vacía.
  let sales = fallback.sales ?? [];
  try {
    const salesRes = await supabase
      .from("business_sales")
      .select("*")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (salesRes.error) {
      if (normalizedAvailable(salesRes.error)) throw salesRes.error;
    } else if ((salesRes.data?.length ?? 0) > 0) {
      sales = (salesRes.data ?? []).map((sale) => ({
        id: sale.id,
        date: sale.sale_date,
        time: sale.sale_time ?? "",
        items: Array.isArray(sale.items) ? sale.items : [],
        total: Number(sale.total ?? 0),
        paymentMethod: sale.payment_method ?? "cash",
        employeeId: sale.employee_id ?? undefined,
        notes: sale.notes ?? undefined,
        createdAt: sale.created_at
      }));
    }
  } catch (salesErr) {
    if (normalizedAvailable(salesErr)) throw salesErr;
  }

  return {
    config: { ...fallback.config, services, products, categories },
    employees,
    clients,
    appointments,
    suppliers,
    cashCuts,
    sales
  };
}

async function mirrorNormalizedState(businessId: string, state: AppState): Promise<void> {
  if (!supabase) return;
  // SERVICIOS (#B): se espeja con valores reales de depósito. NO se incluye `active`
  // en el payload: al insertar usa el default (true) y al actualizar NO lo toca, así
  // un servicio desactivado (borrado) no resucita aunque una sesión vieja lo re-espeje
  // (mismo patrón anti-resurrección que `deleted_at` en citas/clientes).
  const services = state.config.services.map((service) => ({
    id: service.id,
    business_id: businessId,
    name: service.name,
    base_price: service.basePrice,
    duration_minutes: service.duration,
    deposit_required: Boolean(service.depositRequired),
    deposit_amount: Number(service.depositAmount ?? 0)
  }));
  // EMPLEADOS (#B): NO se espejan aquí. La fuente de verdad es el Edge Function
  // `admin-manage-user` (crea/edita/borra la fila en business_employees). Espejarlos
  // desde un guardado de admin con sesión vieja podría RESUCITAR un empleado borrado.
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
    clients.length ? supabase.from("business_clients").upsert(clients) : Promise.resolve({ error: null }),
    appointments.length ? supabase.from("business_appointments").upsert(appointments) : Promise.resolve({ error: null })
  ]);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError && normalizedAvailable(firstError)) throw firstError;

  // CATÁLOGO (#C): categorías + productos. Secuencial (categorías primero por la FK
  // category_id) y tolerante a tablas ausentes. Productos NO mandan `active`: al
  // insertar usa default true, al actualizar no lo toca, así un producto borrado
  // (active=false) no resucita aunque una sesión vieja lo re-espeje.
  const categories = (state.config.categories ?? []).map((category) => ({
    id: category.id,
    business_id: businessId,
    name: category.name
  }));
  const products = (state.config.products ?? []).map((product) => ({
    id: product.id,
    business_id: businessId,
    category_id: product.categoryId || null,
    name: product.name,
    cost: product.cost,
    cost_type: product.costType,
    sale_price: product.salePrice,
    stock: product.stock ?? 0,
    low_stock: product.lowStock ?? null
  }));
  try {
    if (categories.length) {
      const r = await supabase.from("business_product_categories").upsert(categories);
      if (r.error && normalizedAvailable(r.error)) throw r.error;
    }
    if (products.length) {
      const r = await supabase.from("business_products").upsert(products);
      if (r.error && normalizedAvailable(r.error)) throw r.error;
    }
  } catch (catalogErr) {
    if (normalizedAvailable(catalogErr)) throw catalogErr;
  }

  // PROVEEDORES (#D): upsert tolerante a tabla ausente. NO se manda `deleted_at`, así
  // un proveedor borrado (soft-delete) no resucita aunque una sesión vieja lo re-espeje.
  const suppliers = (state.suppliers ?? []).map((supplier) => ({
    id: supplier.id,
    business_id: businessId,
    name: supplier.name,
    contact_name: supplier.contactName ?? null,
    phone: supplier.phone ?? null,
    email: supplier.email ?? null,
    category: supplier.category ?? null,
    notes: supplier.notes ?? null
  }));
  if (suppliers.length) {
    const r = await supabase.from("business_suppliers").upsert(suppliers);
    if (r.error && normalizedAvailable(r.error)) throw r.error;
  }

  // CORTE DE CAJA (#E): upsert por id (un corte por fecha; el id es estable por
  // fecha). Se guardan los campos por método/retiro. NO se manda `deleted_at` → un
  // corte borrado no resucita aunque una sesión vieja lo re-espeje.
  const cashCutBase = (cut: NonNullable<AppState["cashCuts"]>[number]) => ({
    id: cut.id,
    business_id: businessId,
    cut_date: cut.date,
    closed_at: cut.closedAt,
    closed_by: cut.closedBy ?? null,
    opening_float: cut.openingFloat ?? 0,
    total: cut.total,
    paid_count: cut.paidCount,
    pending_balance: cut.pendingBalance,
    movements: cut.movements,
    notes: cut.notes ?? null,
    cash_amount: cut.cashAmount ?? null,
    card_credit: cut.cardCredit ?? null,
    card_debit: cut.cardDebit ?? null,
    transfer: cut.transfer ?? null,
    total_received: cut.totalReceived ?? null,
    expected_total: cut.expectedTotal ?? null,
    difference: cut.difference ?? null,
    withdrawal: cut.withdrawal ?? null,
    cash_remaining: cut.cashRemaining ?? null
  });
  const cashCuts = (state.cashCuts ?? []).map((cut) => ({
    ...cashCutBase(cut),
    // Corte v2 (cash_cut_v2.sql): esperado por método + ventas de productos
    expected_cash: cut.expectedCash ?? null,
    expected_card_credit: cut.expectedCardCredit ?? null,
    expected_card_debit: cut.expectedCardDebit ?? null,
    expected_transfer: cut.expectedTransfer ?? null,
    expected_unassigned: cut.expectedUnassigned ?? null,
    sales_total: cut.salesTotal ?? null,
    sales_count: cut.salesCount ?? null
  }));
  if (cashCuts.length) {
    let r = await supabase.from("business_cash_cuts").upsert(cashCuts);
    // Tolerancia de despliegue: si la BD aún no corre cash_cut_v2.sql, PostgREST
    // rechaza las columnas nuevas. Reintenta con el payload base para no bloquear
    // el guardado (la foto v2 queda solo en app_state mientras tanto).
    if (r.error && /expected_|sales_/.test(String(r.error.message ?? ""))) {
      r = await supabase.from("business_cash_cuts").upsert((state.cashCuts ?? []).map(cashCutBase));
    }
    if (r.error && normalizedAvailable(r.error)) throw r.error;
  }

  // VENTAS (#1): upsert tolerante a tabla ausente. NO se manda `deleted_at`
  // (mismo patrón anti-resurrección que proveedores/cortes).
  const sales = (state.sales ?? []).map((sale) => ({
    id: sale.id,
    business_id: businessId,
    sale_date: sale.date,
    sale_time: sale.time,
    items: sale.items,
    total: sale.total,
    payment_method: sale.paymentMethod,
    employee_id: sale.employeeId ?? null,
    notes: sale.notes ?? null,
    created_at: sale.createdAt
  }));
  if (sales.length) {
    const r = await supabase.from("business_sales").upsert(sales);
    if (r.error && normalizedAvailable(r.error)) throw r.error;
  }
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
    const normalized = await loadNormalizedState(businessId, fallback);
    if (normalized) {
      // Proveedores (#D) y cortes de caja (#E) ya los resolvió loadNormalizedState
      // (normalizado o fallback por entidad), ambos a nivel raíz fuera de config.
      // No los sobrescribimos desde el fallback.
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

  // ─── Escritura DIRECTA por fila para citas/clientes (#1) ────────────────────
  // Las acciones de cita (crear/editar/estado/pago) y el alta de cliente escriben
  // directo a su tabla normalizada (fuente de verdad), en vez de reescribir el
  // `app_state` completo. Esto: (a) deja al rol `employee` guardar sus citas (su RLS
  // permite business_appointments), y (b) evita el race del JSON monolítico. El
  // `app_state` se sincroniza aparte best-effort (ver saveAppStateBestEffort).
  async upsertAppointment(businessId: string, a: AppState["appointments"][number]): Promise<void> {
    if (!supabase) return;
    const row: Record<string, unknown> = {
      id: a.id,
      business_id: businessId,
      client_id: a.clientId || null,
      employee_id: a.employeeId || null,
      service_name: a.service,
      date: a.date,
      time: a.time,
      duration_minutes: a.duration,
      price: a.price,
      status: a.status,
      payment_status: a.paymentStatus === "paid" ? "paid" : "none",
      payment_method: a.paymentMethod ?? null,
      paid_amount: a.paymentStatus === "paid" ? a.price : 0,
      source: a.source,
      notes: a.notes ?? null,
      created_at: a.createdAt
    };
    const { error } = await supabase.from("business_appointments").upsert(row);
    if (!error) return;
    // Tolerancia de despliegue: si la BD aún no corre appointment_payment_method.sql,
    // PostgREST rechaza la columna desconocida. Reintenta sin ella para no bloquear
    // el guardado de la cita (el método queda solo en app_state mientras tanto).
    if (String(error.message ?? "").includes("payment_method")) {
      delete row.payment_method;
      const retry = await supabase.from("business_appointments").upsert(row);
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  },

  async upsertClient(businessId: string, c: AppState["clients"][number]): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from("business_clients").upsert({
      id: c.id,
      business_id: businessId,
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? null,
      notes: c.notes ?? null
    });
    if (error) throw error;
  },

  // Sincroniza `app_state` SIN romper si falla (p. ej. un `employee` no tiene permiso
  // de UPDATE sobre `businesses`). Mantiene el JSON como espejo/compat y fresco para
  // public-booking cuando lo escribe un admin. No espeja (eso ya lo hace saveBusinessState
  // en los flujos que sí pasan por él); aquí solo escribe el JSON.
  async saveAppStateBestEffort(businessId: string, state: AppState): Promise<void> {
    if (!supabase) return;
    try {
      await supabase
        .from("businesses")
        .update({ app_state: state, updated_at: new Date().toISOString() })
        .eq("id", businessId);
    } catch {
      // best-effort: la fuente de verdad de citas/clientes son las tablas.
    }
  },

  // ─── Borrado normalizado por entidad (#2/#5) ────────────────────────────────
  // Soft-delete EXPLÍCITO por id: marca `deleted_at` solo en el registro que el
  // usuario eliminó. NO inferimos borrados por ausencia (eso podría borrar una
  // reserva pública recién entrada si la sesión del admin está desactualizada).
  // `app_state` ya se actualiza por separado vía saveBusinessState (espejo/compat).
  async softDeleteAppointment(businessId: string, appointmentId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_appointments")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", appointmentId);
    if (error && normalizedAvailable(error)) throw error;
  },

  async softDeleteClient(businessId: string, clientId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_clients")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", clientId);
    if (error && normalizedAvailable(error)) throw error;
  },

  // Servicios (#B): el loader filtra `active = true`. Borrar un servicio = marcarlo
  // inactivo por id (no se borra la fila para preservar el histórico de citas que lo
  // referencian). El espejo ya no fuerza `active`, así no se reactiva solo.
  async deactivateService(businessId: string, serviceId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_services")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", serviceId);
    if (error && normalizedAvailable(error)) throw error;
  },

  // Productos (#C): mismo patrón que servicios. Borrar = active=false por id.
  async deactivateProduct(businessId: string, productId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_products")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", productId);
    if (error && normalizedAvailable(error)) throw error;
  },

  // Proveedores (#D): borrar = soft-delete por id (deleted_at). El loader filtra
  // deleted_at null; el espejo no manda deleted_at → no resucita.
  async softDeleteSupplier(businessId: string, supplierId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_suppliers")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", supplierId);
    if (error && normalizedAvailable(error)) throw error;
  },

  // Corte de caja (#E): borrar = soft-delete por id. Mismo patrón anti-resurrección.
  async softDeleteCashCut(businessId: string, cutId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_cash_cuts")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", cutId);
    if (error && normalizedAvailable(error)) throw error;
  },

  // ─── Escritura por fila (#1/#2): ventas, stock, catálogo, proveedores, corte ──
  // Mismo patrón que upsertAppointment: la fila normalizada es la fuente de verdad
  // y app_state se sincroniza aparte best-effort. Tolerantes a tabla ausente (la
  // entidad queda en app_state mientras no se corra el SQL correspondiente).

  // VENTAS: insert por fila — esto es lo que permite que un `employee` registre
  // ventas (no puede escribir el JSON completo de businesses).
  async insertSale(businessId: string, sale: NonNullable<AppState["sales"]>[number]): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from("business_sales").upsert({
      id: sale.id,
      business_id: businessId,
      sale_date: sale.date,
      sale_time: sale.time,
      items: sale.items,
      total: sale.total,
      payment_method: sale.paymentMethod,
      employee_id: sale.employeeId ?? null,
      notes: sale.notes ?? null,
      created_at: sale.createdAt
    });
    if (error && normalizedAvailable(error)) throw error;
  },

  // STOCK: actualización puntual tras una venta (la RLS same_business de
  // business_products permite update a cualquier miembro activo del negocio).
  async updateProductStock(businessId: string, productId: string, stock: number): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_products")
      .update({ stock, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", productId);
    if (error && normalizedAvailable(error)) throw error;
  },

  async upsertService(businessId: string, s: AppState["config"]["services"][number]): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from("business_services").upsert({
      id: s.id,
      business_id: businessId,
      name: s.name,
      base_price: s.basePrice,
      duration_minutes: s.duration,
      deposit_required: Boolean(s.depositRequired),
      deposit_amount: Number(s.depositAmount ?? 0)
    });
    if (error && normalizedAvailable(error)) throw error;
  },

  async upsertCategory(businessId: string, c: { id: string; name: string }): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from("business_product_categories").upsert({
      id: c.id,
      business_id: businessId,
      name: c.name
    });
    if (error && normalizedAvailable(error)) throw error;
  },

  async deleteCategory(businessId: string, categoryId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_product_categories")
      .delete()
      .eq("business_id", businessId)
      .eq("id", categoryId);
    if (error && normalizedAvailable(error)) throw error;
  },

  async upsertProduct(businessId: string, p: NonNullable<AppState["config"]["products"]>[number]): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from("business_products").upsert({
      id: p.id,
      business_id: businessId,
      category_id: p.categoryId || null,
      name: p.name,
      cost: p.cost,
      cost_type: p.costType,
      sale_price: p.salePrice,
      stock: p.stock ?? 0,
      low_stock: p.lowStock ?? null
    });
    if (error && normalizedAvailable(error)) throw error;
  },

  async upsertSupplier(businessId: string, s: NonNullable<AppState["suppliers"]>[number]): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from("business_suppliers").upsert({
      id: s.id,
      business_id: businessId,
      name: s.name,
      contact_name: s.contactName ?? null,
      phone: s.phone ?? null,
      email: s.email ?? null,
      category: s.category ?? null,
      notes: s.notes ?? null
    });
    if (error && normalizedAvailable(error)) throw error;
  },

  async upsertCashCut(businessId: string, cut: NonNullable<AppState["cashCuts"]>[number]): Promise<void> {
    if (!supabase) return;
    const base: Record<string, unknown> = {
      id: cut.id,
      business_id: businessId,
      cut_date: cut.date,
      closed_at: cut.closedAt,
      closed_by: cut.closedBy ?? null,
      opening_float: cut.openingFloat ?? 0,
      total: cut.total,
      paid_count: cut.paidCount,
      pending_balance: cut.pendingBalance,
      movements: cut.movements,
      notes: cut.notes ?? null,
      cash_amount: cut.cashAmount ?? null,
      card_credit: cut.cardCredit ?? null,
      card_debit: cut.cardDebit ?? null,
      transfer: cut.transfer ?? null,
      total_received: cut.totalReceived ?? null,
      expected_total: cut.expectedTotal ?? null,
      difference: cut.difference ?? null,
      withdrawal: cut.withdrawal ?? null,
      cash_remaining: cut.cashRemaining ?? null
    };
    const row = {
      ...base,
      expected_cash: cut.expectedCash ?? null,
      expected_card_credit: cut.expectedCardCredit ?? null,
      expected_card_debit: cut.expectedCardDebit ?? null,
      expected_transfer: cut.expectedTransfer ?? null,
      expected_unassigned: cut.expectedUnassigned ?? null,
      sales_total: cut.salesTotal ?? null,
      sales_count: cut.salesCount ?? null
    };
    let r = await supabase.from("business_cash_cuts").upsert(row);
    // Tolerancia: BD sin cash_cut_v2.sql → reintenta sin las columnas nuevas.
    if (r.error && /expected_|sales_/.test(String(r.error.message ?? ""))) {
      r = await supabase.from("business_cash_cuts").upsert(base);
    }
    if (r.error && normalizedAvailable(r.error)) throw r.error;
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
      .select("id,name,slug,business_type,active,public_site_enabled,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      active: row.active,
      publicSiteEnabled: Boolean(row.public_site_enabled),
      businessType: row.business_type ?? undefined,
      createdAt: row.created_at ?? undefined
    }));
  },

  async deleteBusiness(businessId: string): Promise<void> {
    await invokeAdminUser("delete_business", { businessId });
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
