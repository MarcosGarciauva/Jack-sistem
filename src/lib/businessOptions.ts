// Opciones compartidas de negocio. Usadas en onboarding (Fase B), alta de
// negocios por super_admin y configuración. Centralizar evita listas divergentes.

export const BUSINESS_TYPES = [
  "Spa",
  "Farmacia",
  "Clínica",
  "Limpieza",
  "Óptica",
  "Belleza y Cosméticos"
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const HOW_FOUND_OPTIONS = [
  "Distribuidor",
  "Google",
  "Recomendación / Conocido",
  "Otro"
] as const;

export type HowFoundOption = (typeof HOW_FOUND_OPTIONS)[number];
