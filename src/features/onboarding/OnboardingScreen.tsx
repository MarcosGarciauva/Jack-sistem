// ════════════════════════════════════════════════════════════════════════════
// Jack — Onboarding inicial del negocio
// ════════════════════════════════════════════════════════════════════════════
// Pantalla obligatoria para administradores hasta completar la configuración
// mínima. Lo obligatorio: datos del negocio, horarios y al menos un servicio con
// precio. Lo opcional/omitible: empleados, proveedores y catálogo de productos.
// Si el admin cierra la app antes de terminar, onboardingCompleted sigue en false
// y esta pantalla aparece otra vez al iniciar sesión.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { databaseService } from "../../services/databaseService";
import { BUSINESS_TYPES, HOW_FOUND_OPTIONS } from "../../lib/businessOptions";
import { formatCurrency, uid } from "../../lib/format";
import type {
  AppSession,
  AppState,
  BusinessHours,
  CatalogCategory,
  CostType,
  Employee,
  ProductItem,
  ServiceItem,
  Supplier
} from "../../types";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const STEPS = ["Negocio", "Horarios", "Servicios", "Empleados", "Proveedores", "Catálogo"];

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function defaultHours(current: BusinessHours[]) {
  return DAY_NAMES.map((_, day) => current.find((item) => item.day === day) ?? {
    day,
    enabled: day >= 1 && day <= 5,
    open: "09:00",
    close: "18:00"
  });
}

type ServiceDraft = { id: string; name: string; price: string; duration: string };
type EmployeeDraft = { id: string; name: string; position: string };
type SupplierDraft = { id: string; name: string; contactName: string; phone: string; category: string };
type ProductDraft = { id: string; name: string; category: string; cost: string; salePrice: string; stock: string };

const emptyService = (): ServiceDraft => ({ id: uid("svc"), name: "", price: "", duration: "60" });
const emptyEmployee = (): EmployeeDraft => ({ id: uid("emp"), name: "", position: "Especialista" });
const emptySupplier = (): SupplierDraft => ({ id: uid("sup"), name: "", contactName: "", phone: "", category: "" });
const emptyProduct = (): ProductDraft => ({ id: uid("prd"), name: "", category: "General", cost: "", salePrice: "", stock: "" });

export function OnboardingScreen({
  session,
  businessState,
  onDone,
  onToast
}: {
  session: AppSession;
  businessState: AppState;
  onDone: () => void;
  onToast: (msg: string) => void;
}) {
  const seed = splitName(session.name);
  const seedType = BUSINESS_TYPES.includes(businessState.config.businessType as (typeof BUSINESS_TYPES)[number])
    ? businessState.config.businessType
    : BUSINESS_TYPES[0];
  const currency = businessState.config.currency || "MXN";

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [firstName, setFirstName] = useState(seed.first);
  const [lastName, setLastName] = useState(seed.last);
  const [businessName, setBusinessName] = useState(businessState.config.businessName || "");
  const [businessType, setBusinessType] = useState<string>(seedType);
  const [phone, setPhone] = useState(businessState.config.phone || "");
  const [address, setAddress] = useState(businessState.config.address || "");
  const [howFound, setHowFound] = useState<string>(businessState.config.howFound || HOW_FOUND_OPTIONS[0]);

  const [hours, setHours] = useState<BusinessHours[]>(() => defaultHours(businessState.config.businessHours ?? []));
  const [services, setServices] = useState<ServiceDraft[]>(() => {
    const current = businessState.config.services ?? [];
    return current.length > 0
      ? current.map((service) => ({ id: service.id, name: service.name, price: String(service.basePrice || ""), duration: String(service.duration || 60) }))
      : [emptyService()];
  });
  const [employees, setEmployees] = useState<EmployeeDraft[]>(() =>
    businessState.employees.length > 0
      ? businessState.employees.map((employee) => ({ id: employee.id, name: employee.name, position: employee.position }))
      : []
  );
  const [suppliers, setSuppliers] = useState<SupplierDraft[]>(() =>
    (businessState.suppliers ?? []).map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      category: supplier.category ?? ""
    }))
  );
  const [products, setProducts] = useState<ProductDraft[]>(() =>
    (businessState.config.products ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      category: businessState.config.categories?.find((category) => category.id === product.categoryId)?.name ?? "General",
      cost: String(product.cost || ""),
      salePrice: String(product.salePrice || ""),
      stock: product.stock != null ? String(product.stock) : ""
    }))
  );

  const updateDay = (day: number, patch: Partial<BusinessHours>) =>
    setHours(hours.map((item) => (item.day === day ? { ...item, ...patch } : item)));

  const validServices = services.filter((service) => service.name.trim() && Number(service.price) > 0);
  const validEmployees = employees.filter((employee) => employee.name.trim());
  const validSuppliers = suppliers.filter((supplier) => supplier.name.trim());
  const validProducts = products.filter((product) => product.name.trim() && Number(product.salePrice) > 0);

  const canAdvance = () => {
    if (step === 0) {
      if (!firstName.trim()) return onToast("Tu nombre es obligatorio"), false;
      if (!lastName.trim()) return onToast("Tu apellido es obligatorio"), false;
      if (!businessName.trim()) return onToast("El nombre del negocio es obligatorio"), false;
    }
    if (step === 1) {
      const invalid = hours.find((item) => item.enabled && item.open >= item.close);
      if (invalid) return onToast(`Revisa el horario de ${DAY_NAMES[invalid.day]}`), false;
      if (!hours.some((item) => item.enabled)) return onToast("Habilita al menos un día de atención"), false;
    }
    if (step === 2) {
      if (validServices.length === 0) return onToast("Agrega al menos un servicio con precio"), false;
    }
    return true;
  };

  const next = () => {
    if (!canAdvance()) return;
    setStep(Math.min(step + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!canAdvance()) return;
    setBusy(true);
    try {
      const categories: CatalogCategory[] = [];
      const categoryId = (name: string) => {
        const clean = name.trim() || "General";
        const found = categories.find((category) => category.name.toLowerCase() === clean.toLowerCase());
        if (found) return found.id;
        const category: CatalogCategory = { id: uid("cat-grp"), name: clean };
        categories.push(category);
        return category.id;
      };

      const nextServices: ServiceItem[] = validServices.map((service) => ({
        id: service.id,
        name: service.name.trim(),
        basePrice: Number(service.price),
        duration: Math.max(5, Number(service.duration) || 60),
        depositRequired: false,
        depositAmount: 0,
        cost: 0,
        costType: "net" as CostType
      }));

      const nextEmployees: Employee[] = validEmployees.map((employee) => ({
        id: employee.id,
        name: employee.name.trim(),
        position: employee.position.trim() || "Especialista",
        status: "active"
      }));

      const nextSuppliers: Supplier[] = validSuppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.name.trim(),
        contactName: supplier.contactName.trim() || undefined,
        phone: supplier.phone.trim() || undefined,
        category: supplier.category.trim() || undefined
      }));

      const nextProducts: ProductItem[] = validProducts.map((product) => ({
        id: product.id,
        name: product.name.trim(),
        categoryId: categoryId(product.category),
        cost: Number(product.cost) || 0,
        costType: "net",
        salePrice: Number(product.salePrice),
        stock: Math.max(0, Number(product.stock) || 0)
      }));

      const nextState: AppState = {
        ...businessState,
        employees: nextEmployees,
        suppliers: nextSuppliers,
        config: {
          ...businessState.config,
          businessName: businessName.trim(),
          businessType,
          howFound,
          phone: phone.trim(),
          address: address.trim(),
          businessHours: hours,
          services: nextServices,
          products: nextProducts,
          categories,
          onboardingCompleted: true
        }
      };

      if (session.businessId) await databaseService.saveBusinessState(session.businessId, nextState);
      await databaseService.completeOnboarding({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        businessType,
        howFound
      });
      onToast("Configuración inicial completada");
      onDone();
    } catch (err) {
      onToast((err as Error).message || "No se pudo completar la configuración inicial");
      setBusy(false);
    }
  };

  return (
    <div className="j-onboarding">
      <div className="j-card j-onboarding-card">
        <div className="j-onboarding-brand">Jack</div>
        <h1 className="j-onboarding-title">
          Configura <span className="accent">{businessName || businessState.config.businessName || "tu negocio"}</span>
        </h1>
        <p className="j-onboarding-sub">
          Antes de entrar al panel necesitamos dejar lista la base operativa. Empleados, proveedores y catálogo se pueden omitir y completar después.
        </p>

        <div style={{ display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap" }}>
          {STEPS.map((label, i) => (
            <span
              key={label}
              className="mono"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 99,
                border: "1px solid var(--border)",
                background: i === step ? "var(--accent)" : i < step ? "var(--bg-sunken)" : "var(--bg-elev)",
                color: i === step ? "#fff" : i < step ? "var(--fg)" : "var(--fg-muted)",
                fontWeight: i === step ? 700 : 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 5
              }}
            >
              {i < step ? <Check size={11} strokeWidth={2.5} /> : `${i + 1} ·`} {label}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 }}>
            <div className="j-field">
              <div className="j-field-label">Nombre</div>
              <input className="j-input" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="j-field">
              <div className="j-field-label">Apellido</div>
              <input className="j-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Tu apellido" />
            </div>
            <div className="j-field">
              <div className="j-field-label">Nombre del negocio</div>
              <input className="j-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej. TerraMar Spa" />
            </div>
            <div className="j-field">
              <div className="j-field-label">Tipo de negocio</div>
              <select className="j-input" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                {BUSINESS_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="j-field">
              <div className="j-field-label">Teléfono</div>
              <input className="j-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono del negocio" />
            </div>
            <div className="j-field">
              <div className="j-field-label">¿Cómo nos conociste?</div>
              <select className="j-input" value={howFound} onChange={(e) => setHowFound(e.target.value)}>
                {HOW_FOUND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="j-field" style={{ gridColumn: "1 / -1" }}>
              <div className="j-field-label">Dirección</div>
              <input className="j-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección o zona de atención" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ marginTop: 22 }}>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "0 0 12px" }}>
              Define los días y horas en que se puede agendar. Esto alimenta disponibilidad y reservas web.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {hours.map((item) => (
                <div key={item.day} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, width: 130, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={item.enabled} onChange={(e) => updateDay(item.day, { enabled: e.target.checked })} />
                    {DAY_NAMES[item.day]}
                  </label>
                  {item.enabled ? (
                    <>
                      <input className="j-input mono" type="time" value={item.open} onChange={(e) => updateDay(item.day, { open: e.target.value })} style={{ width: 110 }} />
                      <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>a</span>
                      <input className="j-input mono" type="time" value={item.close} onChange={(e) => updateDay(item.day, { close: e.target.value })} style={{ width: 110 }} />
                    </>
                  ) : <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Cerrado</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ marginTop: 22 }}>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "0 0 12px" }}>
              Agrega los servicios que el negocio vende. Cada servicio necesita precio y duración para poder crear citas.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {services.map((service, index) => (
                <div key={service.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <div className="j-field">
                    <div className="j-field-label">Servicio</div>
                    <input className="j-input" value={service.name} onChange={(e) => setServices(services.map((item) => item.id === service.id ? { ...item, name: e.target.value } : item))} placeholder="Ej. Masaje relajante" />
                  </div>
                  <div className="j-field">
                    <div className="j-field-label">Precio</div>
                    <input className="j-input mono" type="number" min="0" value={service.price} onChange={(e) => setServices(services.map((item) => item.id === service.id ? { ...item, price: e.target.value } : item))} placeholder="500" />
                  </div>
                  <div className="j-field">
                    <div className="j-field-label">Min</div>
                    <input className="j-input mono" type="number" min="5" step="5" value={service.duration} onChange={(e) => setServices(services.map((item) => item.id === service.id ? { ...item, duration: e.target.value } : item))} />
                  </div>
                  <button className="j-btn" onClick={() => setServices(services.filter((item) => item.id !== service.id))} disabled={services.length === 1} aria-label={`Eliminar servicio ${index + 1}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button className="j-btn" style={{ marginTop: 12 }} onClick={() => setServices([...services, emptyService()])}>
              <Plus size={13} /> Agregar servicio
            </button>
            {validServices.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 10 }}>
                {validServices.length} servicio(s) listos. Ejemplo: {validServices[0].name} · {formatCurrency(Number(validServices[0].price), currency)}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <OptionalStep
            title="Empleados"
            description="Puedes agregar empleados operativos ahora para asignar citas. Las cuentas con correo y contraseña se completan después en Empleados."
            onSkip={() => setStep(step + 1)}
          >
            <div style={{ display: "grid", gap: 10 }}>
              {employees.map((employee) => (
                <div key={employee.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <div className="j-field"><div className="j-field-label">Nombre</div><input className="j-input" value={employee.name} onChange={(e) => setEmployees(employees.map((item) => item.id === employee.id ? { ...item, name: e.target.value } : item))} /></div>
                  <div className="j-field"><div className="j-field-label">Puesto</div><input className="j-input" value={employee.position} onChange={(e) => setEmployees(employees.map((item) => item.id === employee.id ? { ...item, position: e.target.value } : item))} /></div>
                  <button className="j-btn" onClick={() => setEmployees(employees.filter((item) => item.id !== employee.id))}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button className="j-btn" style={{ marginTop: 12 }} onClick={() => setEmployees([...employees, emptyEmployee()])}><Plus size={13} /> Agregar empleado</button>
          </OptionalStep>
        )}

        {step === 4 && (
          <OptionalStep title="Proveedores" description="Registra proveedores si el negocio maneja insumos. También puedes omitirlo." onSkip={() => setStep(step + 1)}>
            <div style={{ display: "grid", gap: 10 }}>
              {suppliers.map((supplier) => (
                <div key={supplier.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <div className="j-field"><div className="j-field-label">Proveedor</div><input className="j-input" value={supplier.name} onChange={(e) => setSuppliers(suppliers.map((item) => item.id === supplier.id ? { ...item, name: e.target.value } : item))} /></div>
                  <div className="j-field"><div className="j-field-label">Contacto</div><input className="j-input" value={supplier.contactName} onChange={(e) => setSuppliers(suppliers.map((item) => item.id === supplier.id ? { ...item, contactName: e.target.value } : item))} /></div>
                  <div className="j-field"><div className="j-field-label">Teléfono</div><input className="j-input" value={supplier.phone} onChange={(e) => setSuppliers(suppliers.map((item) => item.id === supplier.id ? { ...item, phone: e.target.value } : item))} /></div>
                  <button className="j-btn" onClick={() => setSuppliers(suppliers.filter((item) => item.id !== supplier.id))}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button className="j-btn" style={{ marginTop: 12 }} onClick={() => setSuppliers([...suppliers, emptySupplier()])}><Plus size={13} /> Agregar proveedor</button>
          </OptionalStep>
        )}

        {step === 5 && (
          <OptionalStep title="Catálogo" description="Agrega productos si también vendes artículos. Si solo manejas citas, puedes omitirlo." onSkip={submit}>
            <div style={{ display: "grid", gap: 10 }}>
              {products.map((product) => (
                <div key={product.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <div className="j-field"><div className="j-field-label">Producto</div><input className="j-input" value={product.name} onChange={(e) => setProducts(products.map((item) => item.id === product.id ? { ...item, name: e.target.value } : item))} /></div>
                  <div className="j-field"><div className="j-field-label">Categoría</div><input className="j-input" value={product.category} onChange={(e) => setProducts(products.map((item) => item.id === product.id ? { ...item, category: e.target.value } : item))} /></div>
                  <div className="j-field"><div className="j-field-label">Costo</div><input className="j-input mono" type="number" value={product.cost} onChange={(e) => setProducts(products.map((item) => item.id === product.id ? { ...item, cost: e.target.value } : item))} /></div>
                  <div className="j-field"><div className="j-field-label">Precio</div><input className="j-input mono" type="number" value={product.salePrice} onChange={(e) => setProducts(products.map((item) => item.id === product.id ? { ...item, salePrice: e.target.value } : item))} /></div>
                  <button className="j-btn" onClick={() => setProducts(products.filter((item) => item.id !== product.id))}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button className="j-btn" style={{ marginTop: 12 }} onClick={() => setProducts([...products, emptyProduct()])}><Plus size={13} /> Agregar producto</button>
          </OptionalStep>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          {step > 0 ? <button className="j-btn" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft size={14} strokeWidth={2.25} /> Atrás</button> : <span />}
          {step < STEPS.length - 1 ? (
            <button className="j-btn j-btn-primary" onClick={next}>Continuar <ArrowRight size={14} strokeWidth={2.25} /></button>
          ) : (
            <button className="j-btn j-btn-primary" onClick={submit} disabled={busy}>{busy ? "Guardando…" : "Terminar configuración"} <ArrowRight size={14} strokeWidth={2.25} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function OptionalStep({ title, description, onSkip, children }: { title: string; description: string; onSkip: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "6px 0 0" }}>{description}</p>
        </div>
        <button className="j-btn-ghost" onClick={onSkip} style={{ fontSize: 12.5, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>Omitir</button>
      </div>
      {children}
    </div>
  );
}
