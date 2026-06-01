export type Role = "super_admin" | "admin" | "employee";
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
export type EmployeeStatus = "active" | "inactive";
export type PaymentStatus = "none" | "paid";
export type BookingSource = "dashboard" | "public_site";

export interface BusinessHours {
  day: number;
  enabled: boolean;
  open: string;
  close: string;
}

export type CatalogItemType = "product" | "service";
export type CostType = "net" | "gross";

export interface CatalogCategory {
  id: string;
  name: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  basePrice: number;
  duration: number;
  depositRequired: boolean;
  depositAmount: number;
  categoryId?: string;
  cost?: number;
  costType?: CostType;
}

export interface ProductItem {
  id: string;
  name: string;
  categoryId?: string;
  cost: number;
  costType: CostType;
  salePrice: number;
}

export interface BusinessConfig {
  businessName: string;
  businessType: string;
  howFound?: string;
  onboardingCompleted?: boolean;
  logoUrl?: string;
  currency: string;
  publicSlug: string;
  websiteHeadline: string;
  websiteDescription: string;
  address: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  businessHours: BusinessHours[];
  services: ServiceItem[];
  products?: ProductItem[];
  categories?: CatalogCategory[];
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  requestedService: string;
  amount: number;
  appointmentDate: string;
  appointmentTime: string;
  status: AppointmentStatus;
  assignedEmployeeId: string;
  notes?: string;
}

export interface Employee {
  id: string;
  name: string;
  position: string;
  status: EmployeeStatus;
}

export interface Appointment {
  id: string;
  clientId: string;
  service: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  employeeId: string;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  depositAmount: number;
  paidAmount: number;
  source: BookingSource;
  createdAt: string;
  notes?: string;
}

export interface PublicBooking {
  serviceId: string;
  employeeId: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
  wantsDeposit: boolean;
}

export interface CashCut {
  id: string;
  date: string;
  closedAt: string;
  closedBy: string;
  // P7: el fondo inicial se eliminó de la captura. Se conserva como opcional solo
  // por compatibilidad con cortes históricos ya guardados (nuevos cortes = 0).
  openingFloat?: number;
  total: number;
  paidCount: number;
  pendingBalance: number;
  movements: number;
  notes?: string;
  // P7 · Captura por método de pago (opcionales por compatibilidad con cortes viejos)
  cashAmount?: number;       // efectivo
  cardCredit?: number;       // tarjeta de crédito
  cardDebit?: number;        // tarjeta de débito
  transfer?: number;         // transferencia
  totalReceived?: number;    // total recibido (suma de los métodos capturados)
  expectedTotal?: number;    // total esperado según citas pagadas
  difference?: number;       // recibido − esperado (negativo = faltante)
  withdrawal?: number;       // monto retirado de caja al cierre
  cashRemaining?: number;    // efectivo restante en caja tras el retiro
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  category?: string;
  notes?: string;
}

export interface AppState {
  config: BusinessConfig;
  clients: Client[];
  employees: Employee[];
  appointments: Appointment[];
  cashCuts?: CashCut[];
  suppliers?: Supplier[];
}

export interface AppointmentFilters {
  query: string;
  date: string;
  status: "all" | AppointmentStatus;
  employeeId: "all" | string;
  service: "all" | string;
  // P5: ordenamiento del listado de citas. Se eliminó el filtro por origen.
  sort: "recent" | "client";
}

export interface AppSession {
  userId: string;
  email: string;
  name: string;
  role: Role;
  businessId?: string;
  employeeId?: string;
}

export interface AuthProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  businessId?: string;
  employeeId?: string;
  active: boolean;
}
