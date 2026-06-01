export type Route =
  | { kind: "dashboard" }
  | { kind: "public-site"; slug: string }
  | { kind: "forgot-password" };

export function parseRoute(): Route {
  const path = window.location.pathname;

  const publicMatch = path.match(/^\/p\/([a-z0-9-]+)\/?$/i);
  if (publicMatch) return { kind: "public-site", slug: publicMatch[1] };

  if (path === "/forgot-password") return { kind: "forgot-password" };

  return { kind: "dashboard" };
}
