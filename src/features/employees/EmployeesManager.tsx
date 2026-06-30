// ════════════════════════════════════════════════════════════════════════════
// Jack — Gestión de empleados (Operación)
// ════════════════════════════════════════════════════════════════════════════
// El administrador crea empleados directamente con correo + contraseña. La
// creación/edición/eliminación de la cuenta de acceso pasa por el Edge Function
// `admin-manage-user` (service_role). La lista operativa (AppState.employees) se
// mantiene en sincronía para que calendario y disponibilidad reflejen cambios.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Download, Plus, Trash2, X } from "lucide-react";
import { StatusBadge } from "../../components/Badge";
import { JEmpty } from "../../components/Editorial";
import { databaseService, type EmployeeAccount } from "../../services/databaseService";
import { downloadExcel } from "../../lib/excelExport";
import { initialsFromName, uid } from "../../lib/format";
import type { Appointment, Employee, EmployeeStatus } from "../../types";

interface DraftState {
  mode: "create" | "edit";
  id: string;
  name: string;
  email: string;
  password: string;
  position: string;
  status: EmployeeStatus;
}

export function EmployeesManager({
  businessId,
  employees,
  appointments,
  onEmployeesChange,
  onEmployeeRemoved,
  onToast
}: {
  businessId: string;
  employees: Employee[];
  appointments: Appointment[];
  onEmployeesChange: (next: Employee[]) => void;
  // Eliminación atómica (#4): quita al empleado Y libera (employeeId = "") las
  // citas que lo referencian, en una sola actualización de estado, para no dejar
  // citas huérfanas apuntando a un empleado inexistente.
  onEmployeeRemoved: (employeeId: string) => void;
  onToast: (msg: string) => void;
}) {
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAccounts = async () => {
    if (!businessId) return;
    try {
      setAccounts(await databaseService.listEmployeeAccounts(businessId));
    } catch {
      setAccounts([]);
    }
  };

  useEffect(() => { void loadAccounts(); /* eslint-disable-next-line */ }, [businessId]);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const appointmentCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const apt of appointments) counts.set(apt.employeeId, (counts.get(apt.employeeId) ?? 0) + 1);
    return counts;
  }, [appointments]);

  const startCreate = () =>
    setDraft({ mode: "create", id: uid("emp"), name: "", email: "", password: "", position: "Especialista", status: "active" });

  const startEdit = (employee: Employee) =>
    setDraft({
      mode: "edit",
      id: employee.id,
      name: employee.name,
      email: accountById.get(employee.id)?.email ?? "",
      password: "",
      position: employee.position,
      status: employee.status
    });

  const submit = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return onToast("Agrega el nombre del empleado");
    setBusy(true);
    try {
      if (draft.mode === "create") {
        if (!draft.email.trim()) return onToast("Agrega el correo del empleado");
        if (draft.password.length < 8) return onToast("La contraseña debe tener al menos 8 caracteres");
        const created = await databaseService.createEmployee({
          name: draft.name.trim(),
          email: draft.email.trim(),
          password: draft.password,
          position: draft.position.trim() || "Especialista",
          employeeId: draft.id
        });
        onEmployeesChange([
          ...employees,
          { id: created.id, name: created.name, position: created.position, status: created.status }
        ]);
        onToast("Empleado creado con acceso");
      } else {
        await databaseService.updateEmployee({
          employeeId: draft.id,
          name: draft.name.trim(),
          position: draft.position.trim() || "Especialista",
          status: draft.status,
          password: draft.password ? draft.password : undefined
        });
        onEmployeesChange(
          employees.map((e) =>
            e.id === draft.id
              ? { ...e, name: draft.name.trim(), position: draft.position.trim() || "Especialista", status: draft.status }
              : e
          )
        );
        onToast(draft.password ? "Empleado y contraseña actualizados" : "Empleado actualizado");
      }
      setDraft(null);
      void loadAccounts();
    } catch (err) {
      onToast((err as Error).message || "No se pudo guardar el empleado");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (employee: Employee) => {
    const pending = appointmentCount.get(employee.id) ?? 0;
    const message = pending > 0
      ? `${employee.name} tiene ${pending} cita(s) asociada(s). Si lo eliminas, esas citas quedarán SIN empleado asignado (deberás reasignarlas). ¿Continuar?`
      : `¿Eliminar a ${employee.name}? También se eliminará su acceso a Jack.`;
    if (!confirm(message)) return;
    setBusy(true);
    try {
      await databaseService.deleteEmployee(employee.id);
      // #4: una sola actualización atómica que quita al empleado y libera sus citas.
      onEmployeeRemoved(employee.id);
      void loadAccounts();
      setDraft(null);
      onToast(pending > 0 ? `Empleado eliminado · ${pending} cita(s) quedaron sin asignar` : "Empleado eliminado");
    } catch (err) {
      onToast((err as Error).message || "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => {
    downloadExcel("empleados", "Empleados", employees.map((employee) => {
      const account = accountById.get(employee.id);
      return {
        Empleado: employee.name,
        Correo: account?.email ?? "",
        Acceso: account?.profileId ? "Con acceso" : "Sin acceso",
        Puesto: employee.position,
        Estado: employee.status,
        Citas: appointmentCount.get(employee.id) ?? 0
      };
    }));
    onToast("Exportación descargada");
  };

  return (
    <section>
      <div className="j-stat-strip">
        <div className="j-stat">
          <div className="j-stat-l">Empleados activos</div>
          <div className="j-stat-v">{employees.filter((e) => e.status === "active").length}</div>
        </div>
        <div className="j-stat">
          <div className="j-stat-l">Total equipo</div>
          <div className="j-stat-v">{employees.length}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button className="j-btn" onClick={exportExcel} disabled={employees.length === 0}>
            <Download size={13} strokeWidth={2.25} /> Exportar
          </button>
          <button className="j-btn j-btn-primary" onClick={startCreate} disabled={!!draft || busy}>
            <Plus size={13} strokeWidth={2.25} /> Nuevo empleado
          </button>
        </div>
      </div>

      <div className="j-card">
        {employees.length === 0 ? (
          <div style={{ padding: 28 }}>
            <JEmpty
              compact
              title="Sin empleados"
              description="Crea al menos un empleado con su correo y contraseña para que pueda iniciar sesión y recibir citas."
              action={<button className="j-btn j-btn-primary" onClick={startCreate}><Plus size={13} strokeWidth={2.25} /> Crear empleado</button>}
            />
          </div>
        ) : (
          <table className="j-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Correo / acceso</th>
                <th>Puesto</th>
                <th>Estado</th>
                <th className="num">Citas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {/* P4: filas de solo lectura. Editar/contraseña/estado/eliminar viven
                  en la ventana centrada de detalle (clic en la fila). */}
              {employees.map((employee) => {
                const account = accountById.get(employee.id);
                return (
                  <tr key={employee.id} className="click" onClick={() => startEdit(employee)} style={{ cursor: "pointer" }}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="j-avatar">{initialsFromName(employee.name)}</div>
                        <div style={{ fontWeight: 500, color: "var(--fg)" }}>{employee.name}</div>
                      </div>
                    </td>
                    <td style={{ color: "var(--fg-muted)", fontSize: 12 }}>
                      {account?.email ?? "—"}
                      {account?.profileId
                        ? <div className="j-tag dot pos" style={{ marginTop: 4 }}>Con acceso</div>
                        : <div className="j-tag dot" style={{ marginTop: 4 }}>Sin acceso</div>}
                    </td>
                    <td style={{ color: "var(--fg-muted)" }}>{employee.position}</td>
                    <td><StatusBadge status={employee.status} /></td>
                    <td className="num mono">{appointmentCount.get(employee.id) ?? 0}</td>
                    <td className="num"><ChevronRight size={15} style={{ color: "var(--fg-muted)" }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* P4: ventana centrada (mismo patrón j-modal que Proveedores/Catálogo) para
          crear y editar. Toda acción importante ocurre aquí, no desde la tabla. */}
      {draft && (
        <div className="j-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDraft(null); }}>
          <div className="j-modal">
            <div className="j-modal-head">
              <h2>{draft.mode === "create" ? "Nuevo empleado" : "Editar empleado"}</h2>
              <button className="j-btn-ghost" onClick={() => setDraft(null)} disabled={busy} style={{ padding: 6 }}><X size={16} /></button>
            </div>
            <div className="j-modal-body">
              <div className="j-field" style={{ marginBottom: 14 }}>
                <div className="j-field-label">Nombre</div>
                <input className="j-input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre del empleado" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div className="j-field">
                  <div className="j-field-label">Correo electrónico</div>
                  <input
                    className="j-input"
                    type="email"
                    value={draft.email}
                    disabled={draft.mode === "edit"}
                    placeholder="empleado@correo.com"
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </div>
                <div className="j-field">
                  <div className="j-field-label">Puesto</div>
                  <input className="j-input" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} placeholder="Ej. Especialista" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: draft.mode === "edit" ? "1fr 1fr" : "1fr", gap: 12 }}>
                <div className="j-field">
                  <div className="j-field-label">{draft.mode === "create" ? "Contraseña" : "Nueva contraseña (opcional)"}</div>
                  <input
                    className="j-input"
                    type="password"
                    value={draft.password}
                    placeholder={draft.mode === "create" ? "Mínimo 8 caracteres" : "Dejar vacío para no cambiar"}
                    onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  />
                </div>
                {draft.mode === "edit" && (
                  <div className="j-field">
                    <div className="j-field-label">Estado</div>
                    <select className="j-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as EmployeeStatus })}>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="j-modal-foot" style={{ gap: 8 }}>
              {draft.mode === "edit" && (
                <button
                  className="j-btn"
                  onClick={() => { const emp = employees.find((e) => e.id === draft.id); if (emp) void remove(emp); }}
                  disabled={busy}
                  style={{ color: "var(--neg)" }}
                >
                  <Trash2 size={13} /> Eliminar
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button className="j-btn" onClick={() => setDraft(null)} disabled={busy}>Cancelar</button>
                <button className="j-btn j-btn-primary" onClick={submit} disabled={busy}>
                  <Check size={13} strokeWidth={2.25} /> {busy ? "Guardando…" : "Guardar empleado"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
