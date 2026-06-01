import type { Appointment, BusinessConfig, ServiceItem } from "../types";

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const toTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
};

export const appointmentOverlaps = (
  aStart: string,
  aDuration: number,
  bStart: string,
  bDuration: number,
) => {
  const startA = toMinutes(aStart);
  const endA = startA + aDuration;
  const startB = toMinutes(bStart);
  const endB = startB + bDuration;
  return startA < endB && startB < endA;
};

export const hasAvailability = (
  appointments: Appointment[],
  date: string,
  time: string,
  employeeId: string,
  duration: number,
  ignoreAppointmentId?: string,
) =>
  !appointments.some((appointment) =>
    appointment.id !== ignoreAppointmentId &&
    appointment.date === date &&
    appointment.employeeId === employeeId &&
    appointment.status !== "cancelled" &&
    appointmentOverlaps(time, duration, appointment.time, appointment.duration),
  );

export const getAvailableSlots = (
  config: BusinessConfig,
  appointments: Appointment[],
  service: ServiceItem,
  date: string,
  employeeId: string,
) => {
  const day = new Date(`${date}T12:00:00`).getDay();
  const hours = config.businessHours.find((item) => item.day === day);
  if (!hours?.enabled) return [];

  const slots: string[] = [];
  const start = toMinutes(hours.open);
  const end = toMinutes(hours.close) - service.duration;

  for (let minute = start; minute <= end; minute += 30) {
    const time = toTime(minute);
    if (hasAvailability(appointments, date, time, employeeId, service.duration)) {
      slots.push(time);
    }
  }

  return slots;
};
