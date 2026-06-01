// Componentes UI editoriales reutilizables: skeletons, empty states.
// Lenguaje B&W consistente con styles.css

import type { ReactNode } from "react";

// ════════════════════════════════════════════════════════════════════════════
// JSkeleton — bloque animado para indicar carga
// ════════════════════════════════════════════════════════════════════════════

export function JSkeleton({
  w = "100%",
  h = 14,
  radius = 6,
  className = "",
  style
}: {
  w?: number | string;
  h?: number | string;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={"j-skel " + className}
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: typeof h === "number" ? `${h}px` : h,
        borderRadius: radius,
        ...style
      }}
    />
  );
}

// Pre-armado: skeleton para fila de tabla
export function JSkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
      {Array.from({ length: cols }).map((_, i) => (
        <JSkeleton key={i} h={12} w={i === 0 ? "70%" : "50%"} />
      ))}
    </div>
  );
}

// Pre-armado: skeleton para card KPI
export function JSkeletonKpi() {
  return (
    <div className="j-kpi">
      <JSkeleton w={90} h={10} />
      <div style={{ marginTop: 12 }}>
        <JSkeleton w={120} h={28} />
      </div>
      <div style={{ marginTop: 8 }}>
        <JSkeleton w={70} h={10} />
      </div>
    </div>
  );
}

// Pre-armado: skeleton para todo el shell mientras carga businessState
export function JShellSkeleton() {
  return (
    <div className="j-app">
      <aside className="j-sidebar">
        <div className="j-brand">
          <JSkeleton w={28} h={28} radius={6} />
          <div style={{ flex: 1 }}>
            <JSkeleton w={60} h={12} />
            <div style={{ marginTop: 6 }}>
              <JSkeleton w={120} h={10} />
            </div>
          </div>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ padding: "8px 20px" }}>
            <JSkeleton w="80%" h={11} />
          </div>
        ))}
      </aside>
      <div className="j-main">
        <header className="j-topbar">
          <JSkeleton w={120} h={12} />
          <div className="j-spacer" />
          <JSkeleton w={120} h={32} radius={6} />
        </header>
        <div className="j-page">
          <div className="j-page-head">
            <div>
              <JSkeleton w={160} h={28} />
              <div style={{ marginTop: 8 }}>
                <JSkeleton w={280} h={12} />
              </div>
            </div>
          </div>
          <div className="j-kpis">
            <JSkeletonKpi />
            <JSkeletonKpi />
            <JSkeletonKpi />
            <JSkeletonKpi />
          </div>
          <div className="j-card">
            <JSkeletonRow cols={5} />
            <JSkeletonRow cols={5} />
            <JSkeletonRow cols={5} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// JEmpty — estado vacío editorial con copy + CTA opcional
// ════════════════════════════════════════════════════════════════════════════

export function JEmpty({
  title,
  description,
  action,
  icon,
  compact = false
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="j-empty" style={compact ? { padding: 28 } : undefined}>
      {icon && <div className="j-empty-icon">{icon}</div>}
      <div className="j-empty-title">{title}</div>
      {description && <p className="j-empty-desc">{description}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}
