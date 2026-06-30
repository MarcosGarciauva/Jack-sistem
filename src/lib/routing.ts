export type Route =
  | { kind: "dashboard" }
  | { kind: "public-site"; slug: string }
  | { kind: "forgot-password" }
  | { kind: "legal"; page: "terms" | "privacy" };

export function parseRoute(): Route {
  const path = window.location.pathname;

  const publicMatch = path.match(/^\/p\/([a-z0-9-]+)\/?$/i);
  if (publicMatch) return { kind: "public-site", slug: publicMatch[1] };

  if (path === "/forgot-password") return { kind: "forgot-password" };

  // Políticas legales (públicas, sin sesión).
  if (path === "/terminos" || path === "/terminos/") return { kind: "legal", page: "terms" };
  if (path === "/privacidad" || path === "/privacidad/") return { kind: "legal", page: "privacy" };

  return { kind: "dashboard" };
}
