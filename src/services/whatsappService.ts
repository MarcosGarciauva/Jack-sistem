import type { Appointment, BusinessConfig, Client, Employee } from "../types";
import { formatLongDate } from "../lib/format";

function normalizeMexicoWaNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("521") && digits.length === 13) return `52${digits.slice(3)}`;
  if (digits.startsWith("52") && digits.length === 12) return digits;
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

// Normaliza considerando los países soportados por el selector (P11). EE.UU. es
// "1" + 10 dígitos; cualquier otro caso delega en la regla de México (que cubre
// los datos previos: 10 dígitos, 52… y limpieza de 521…).
function normalizeWaNumber(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("1") && digits.length === 11) return digits;
  return normalizeMexicoWaNumber(digits);
}

function buildMessage(
  appointment: Appointment,
  client: Client,
  employee: Employee | undefined,
  config: BusinessConfig
) {
  const firstName = client.name.split(" ")[0] || client.name;
  const employeeLine = employee?.name ? `Te atenderá: ${employee.name}` : "Te atenderá nuestro equipo.";
  return [
    `Hola ${firstName}.`,
    `Te contactamos de ${config.businessName} para confirmar tu asistencia a tu cita.`,
    `Servicio: ${appointment.service}`,
    `Fecha: ${formatLongDate(appointment.date)}`,
    `Hora: ${appointment.time}`,
    employeeLine,
    "",
    "¿Nos confirmas si podrás asistir?",
    "Responde CONFIRMO para confirmar o CANCELAR si no podrás asistir."
  ].join("\n");
}

export const whatsappService = {
  normalizeMexicoWaNumber,
  normalizeWaNumber,

  buildUrl(phone: string, message?: string): string | null {
    const number = normalizeWaNumber(phone);
    if (!number) return null;
    const text = message ? `?text=${encodeURIComponent(message)}` : "";
    return `https://wa.me/${number}${text}`;
  },

  open(phone: string, message?: string): boolean {
    const url = this.buildUrl(phone, message);
    if (!url) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  },

  openAppointment(
    appointment: Appointment,
    client: Client | undefined,
    employee: Employee | undefined,
    config: BusinessConfig
  ): boolean {
    if (!client?.phone) return false;
    return this.open(client.phone, buildMessage(appointment, client, employee, config));
  }
};
