// ════════════════════════════════════════════════════════════════════════════
// Jack — Edge Function: administración segura de cuentas
// ════════════════════════════════════════════════════════════════════════════
// Reemplaza al sistema de códigos de invitación. Crea/edita/elimina cuentas
// usando el service_role (única forma segura de fijar una contraseña). Verifica
// SIEMPRE al solicitante por su JWT antes de actuar.
//
//   action = "create_employee"        (admin / super_admin del negocio)
//   action = "update_employee"        (admin / super_admin del negocio)
//   action = "delete_employee"        (admin / super_admin del negocio)
//   action = "create_business_admin"  (solo super_admin)
//   action = "delete_business"        (solo super_admin; desactiva negocio + accesos)
//   action = "complete_onboarding"    (admin del negocio, primer ingreso)
//
// Deploy: supabase functions deploy admin-manage-user
// ════════════════════════════════════════════════════════════════════════════

// @ts-expect-error — Deno
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error — Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "negocio";

function defaultAppState(businessName: string, slug: string, businessType: string) {
  return {
    config: {
      businessName,
      businessType: businessType || "Servicio",
      logoUrl: "",
      currency: "MXN",
      publicSlug: slug,
      websiteHeadline: "Reserva tu cita en linea",
      websiteDescription: "",
      address: "",
      phone: "",
      whatsapp: "",
      instagram: "",
      businessHours: [],
      services: []
    },
    clients: [],
    employees: [],
    appointments: []
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    // @ts-expect-error — Deno
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // @ts-expect-error — Deno
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── 1. Verificar al solicitante por su JWT ────────────────────────────────
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "No autenticado" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Sesión inválida" }, 401);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, business_id, active")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || !callerProfile.active) {
      return json({ error: "Tu cuenta no tiene permisos" }, 403);
    }

    const isSuperAdmin = callerProfile.role === "super_admin";
    const isAdmin = callerProfile.role === "admin" || isSuperAdmin;

    const body = await req.json();
    const action = String(body?.action ?? "");

    // ── 2. Crear empleado (admin del negocio) ─────────────────────────────────
    if (action === "create_employee") {
      if (!isAdmin) return json({ error: "Solo un administrador puede crear empleados" }, 403);
      const businessId = callerProfile.business_id;
      if (!businessId) return json({ error: "No tienes un negocio asignado" }, 400);

      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const position = String(body.position ?? "Especialista").trim() || "Especialista";
      const employeeId = String(body.employeeId ?? "").trim() ||
        `emp-${crypto.randomUUID().slice(0, 8)}`;

      if (!name) return json({ error: "El nombre es obligatorio" });
      if (!email) return json({ error: "El correo es obligatorio" });
      if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" });

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name }
      });

      let newUserId = created?.user?.id ?? "";

      if (createErr || !newUserId) {
        const msg = createErr?.message ?? "";
        // Caso típico de un intento previo a medias: el usuario de Auth ya existe
        // (p. ej. la creación funcionó pero la respuesta no llegó al navegador).
        // Si NO tiene perfil, es un huérfano y lo adoptamos en vez de fallar.
        const alreadyExists = /already.*regist|already been registered|email.*exist|been registered/i.test(msg);
        if (!alreadyExists) {
          return json({ error: msg || "No se pudo crear el usuario" });
        }

        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (existingProfile) {
          return json({ error: "Ese correo ya pertenece a una cuenta activa. Usa otro correo." });
        }

        // Buscar el usuario de Auth huérfano por correo (paginado).
        let orphanId = "";
        for (let page = 1; page <= 20 && !orphanId; page++) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          const users = list?.users ?? [];
          const found = users.find((u: { id: string; email?: string }) =>
            (u.email ?? "").toLowerCase() === email
          );
          if (found) orphanId = found.id;
          if (users.length < 200) break;
        }
        if (!orphanId) {
          return json({
            error: "El correo ya está registrado pero no se pudo recuperar la cuenta. " +
              "Elimínala desde el panel de Supabase (Authentication → Users) e intenta de nuevo."
          });
        }

        // Reactivar el huérfano: fijar la contraseña indicada y confirmar correo.
        const { error: adoptErr } = await admin.auth.admin.updateUserById(orphanId, {
          password,
          email_confirm: true,
          user_metadata: { full_name: name }
        });
        if (adoptErr) {
          return json({ error: "No se pudo reactivar la cuenta existente: " + adoptErr.message });
        }
        newUserId = orphanId;
      }

      // upsert (no insert): si quedó un perfil a medias de otro intento, lo completa
      // en vez de fallar por clave duplicada.
      const { error: profErr } = await admin.from("profiles").upsert({
        id: newUserId,
        email,
        full_name: name,
        role: "employee",
        business_id: businessId,
        employee_id: employeeId,
        active: true
      });
      if (profErr) {
        return json({ error: "No se pudo crear el perfil: " + profErr.message });
      }

      const { error: empErr } = await admin.from("business_employees").upsert({
        id: employeeId,
        business_id: businessId,
        profile_id: newUserId,
        name,
        position,
        status: "active",
        email
      });
      if (empErr) {
        await admin.auth.admin.deleteUser(newUserId);
        return json({ error: "No se pudo registrar el empleado: " + empErr.message });
      }

      return json({
        success: true,
        employee: { id: employeeId, name, position, status: "active", email, profileId: newUserId }
      });
    }

    // ── 3. Editar empleado ────────────────────────────────────────────────────
    if (action === "update_employee") {
      if (!isAdmin) return json({ error: "Solo un administrador puede editar empleados" }, 403);
      const businessId = callerProfile.business_id;
      const employeeId = String(body.employeeId ?? "").trim();
      if (!employeeId) return json({ error: "Empleado no especificado" });

      const { data: emp } = await admin
        .from("business_employees")
        .select("id, business_id, profile_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (!emp || (!isSuperAdmin && emp.business_id !== businessId)) {
        return json({ error: "Empleado no encontrado" }, 404);
      }

      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
      if (typeof body.position === "string" && body.position.trim()) patch.position = body.position.trim();
      if (body.status === "active" || body.status === "inactive") patch.status = body.status;
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        await admin.from("business_employees").update(patch).eq("id", employeeId);
      }

      if (emp.profile_id) {
        const profilePatch: Record<string, unknown> = {};
        if (patch.name) profilePatch.full_name = patch.name;
        if (body.status === "active" || body.status === "inactive") {
          profilePatch.active = body.status === "active";
        }
        if (Object.keys(profilePatch).length) {
          await admin.from("profiles").update(profilePatch).eq("id", emp.profile_id);
        }
        if (typeof body.password === "string" && body.password) {
          if (body.password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" });
          const { error: pwErr } = await admin.auth.admin.updateUserById(emp.profile_id, {
            password: body.password
          });
          if (pwErr) return json({ error: "No se pudo actualizar la contraseña: " + pwErr.message });
        }
      }

      return json({ success: true });
    }

    // ── 4. Eliminar empleado ──────────────────────────────────────────────────
    if (action === "delete_employee") {
      if (!isAdmin) return json({ error: "Solo un administrador puede eliminar empleados" }, 403);
      const businessId = callerProfile.business_id;
      const employeeId = String(body.employeeId ?? "").trim();
      if (!employeeId) return json({ error: "Empleado no especificado" });

      const { data: emp } = await admin
        .from("business_employees")
        .select("id, business_id, profile_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (!emp || (!isSuperAdmin && emp.business_id !== businessId)) {
        return json({ error: "Empleado no encontrado" }, 404);
      }

      if (emp.profile_id) {
        // Borra el usuario auth; profiles se elimina en cascada (FK on delete cascade)
        await admin.auth.admin.deleteUser(emp.profile_id);
      }
      await admin.from("business_employees").delete().eq("id", employeeId);

      return json({ success: true });
    }

    // ── 5. Crear negocio + administrador (solo super_admin) ───────────────────
    if (action === "create_business_admin") {
      if (!isSuperAdmin) return json({ error: "Solo el super admin puede crear negocios" }, 403);

      const businessName = String(body.businessName ?? "").trim();
      const adminName = String(body.adminName ?? "").trim();
      const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
      const adminPassword = String(body.adminPassword ?? "");
      const businessType = String(body.businessType ?? "Servicio").trim();
      const slug = slugify(String(body.slug ?? businessName));

      if (!businessName) return json({ error: "El nombre del negocio es obligatorio" });
      if (!adminName) return json({ error: "El nombre del administrador es obligatorio" });
      if (!adminEmail) return json({ error: "El correo del administrador es obligatorio" });
      if (adminPassword.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" });

      const { data: clash } = await admin
        .from("businesses")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (clash) return json({ error: `El identificador "${slug}" ya existe. Usa otro.` });

      const { data: biz, error: bizErr } = await admin
        .from("businesses")
        .insert({
          name: businessName,
          slug,
          business_type: businessType,
          currency: "MXN",
          active: true,
          app_state: defaultAppState(businessName, slug, businessType)
        })
        .select("id, name, slug")
        .single();
      if (bizErr || !biz) return json({ error: "No se pudo crear el negocio: " + (bizErr?.message ?? "") });

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { full_name: adminName }
      });
      if (createErr || !created?.user) {
        await admin.from("businesses").delete().eq("id", biz.id);
        return json({ error: createErr?.message ?? "No se pudo crear el administrador" });
      }

      const { error: profErr } = await admin.from("profiles").insert({
        id: created.user.id,
        email: adminEmail,
        full_name: adminName,
        role: "admin",
        business_id: biz.id,
        active: true
      });
      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        await admin.from("businesses").delete().eq("id", biz.id);
        return json({ error: "No se pudo crear el perfil del administrador: " + profErr.message });
      }

      return json({ success: true, business: { id: biz.id, name: biz.name, slug: biz.slug } });
    }

    // ── 6. Eliminar negocio de forma segura (solo super_admin) ───────────────
    if (action === "delete_business") {
      if (!isSuperAdmin) return json({ error: "Solo el super admin puede eliminar negocios" }, 403);

      const businessId = String(body.businessId ?? "").trim();
      if (!businessId) return json({ error: "Negocio no especificado" }, 400);
      if (callerProfile.business_id && callerProfile.business_id === businessId) {
        return json({ error: "No puedes eliminar el negocio desde el que estás operando como super admin." }, 400);
      }

      const { data: business } = await admin
        .from("businesses")
        .select("id, name, active")
        .eq("id", businessId)
        .maybeSingle();
      if (!business) return json({ error: "Negocio no encontrado" }, 404);

      const now = new Date().toISOString();

      // 1) Bloquear accesos del negocio. No borramos auth.users: puede haber usuarios
      // ya eliminados manualmente en Supabase y no queremos que eso rompa la operación.
      await admin
        .from("profiles")
        .update({ active: false })
        .eq("business_id", businessId);

      // 2) Marcar empleados como inactivos para que el panel refleje el estado si se
      // reactiva o se consulta el histórico.
      await admin
        .from("business_employees")
        .update({ status: "inactive", updated_at: now })
        .eq("business_id", businessId);

      // 3) Desactivar negocio y apagar reservas públicas. Es un archivo operativo,
      // no un hard delete: conserva citas, clientes, caja y auditoría.
      const { error: bizErr } = await admin
        .from("businesses")
        .update({
          active: false,
          public_site_enabled: false,
          updated_at: now
        })
        .eq("id", businessId);
      if (bizErr) return json({ error: "No se pudo eliminar el negocio: " + bizErr.message }, 500);

      return json({ success: true, business: { id: business.id, name: business.name, active: false } });
    }

    // ── 7. Completar onboarding inicial (admin del negocio) ───────────────────
    if (action === "complete_onboarding") {
      if (!isAdmin) return json({ error: "Solo un administrador puede completar el onboarding" }, 403);
      const businessId = callerProfile.business_id;
      if (!businessId) return json({ error: "No tienes un negocio asignado" }, 400);

      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      const businessType = String(body.businessType ?? "").trim();
      const howFound = String(body.howFound ?? "").trim();
      const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

      if (!firstName) return json({ error: "El nombre es obligatorio" });
      if (!lastName) return json({ error: "El apellido es obligatorio" });
      if (!businessType) return json({ error: "El tipo de negocio es obligatorio" });

      // El nombre del administrador vive en profiles, protegido por RLS sin
      // self-update: por eso se actualiza aquí con service_role.
      await admin.from("profiles").update({ full_name: fullName }).eq("id", caller.id);

      // Fusiona el app_state existente para no perder configuración previa.
      const { data: bizRow } = await admin
        .from("businesses")
        .select("app_state")
        .eq("id", businessId)
        .maybeSingle();
      const appState = (bizRow?.app_state ?? {}) as Record<string, unknown>;
      const config = { ...((appState.config as Record<string, unknown>) ?? {}) };
      config.businessType = businessType;
      config.howFound = howFound;
      config.onboardingCompleted = true;
      const mergedAppState = { ...appState, config };

      const { error: bizErr } = await admin
        .from("businesses")
        .update({
          business_type: businessType,
          how_found: howFound,
          onboarding_completed: true,
          app_state: mergedAppState,
          updated_at: new Date().toISOString()
        })
        .eq("id", businessId);
      if (bizErr) return json({ error: "No se pudo guardar el onboarding: " + bizErr.message });

      return json({ success: true, fullName, businessType, howFound });
    }

    return json({ error: "Acción no reconocida" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
