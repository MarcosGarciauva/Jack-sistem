// ─── Login screen ─────────────────────────────────────────────────────────────
// Pantalla de acceso con Supabase Auth. El registro público está cerrado: las
// cuentas las crea el administrador (Edge Function admin-manage-user).
// Vivía en App.tsx; se extrajo al dividirlo (#10) y carga lazy (solo la ve quien
// no tiene sesión).

import { useState } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import { supabase } from "../../services/supabaseClient";

export function LoginScreen({
  onLogin,
  setupMessage,
  currentUserId
}: {
  onLogin: () => void;
  setupMessage: string;
  currentUserId: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!supabase) {
        setError("Supabase no esta configurado.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (signInError) {
        setError("Correo o contraseña incorrectos.");
        return;
      }
      onLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="j-login">
      {/* LEFT — editorial dark panel */}
      <aside className="j-login-aside">
        <div className="j-la-top">
          <div className="flex items-center gap-3">
            <div className="j-brand-mark" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", boxShadow: "none" }}>J</div>
            <div>
              <div style={{ fontWeight: 600, letterSpacing: "0.06em", fontSize: 13 }}>JACK</div>
              <div style={{ fontSize: 10.5, opacity: 0.55, letterSpacing: "0.02em" }}>
                Sistema de gestión empresarial
              </div>
            </div>
          </div>
        </div>

        <div className="j-la-quote">
          <div className="j-la-eyebrow">— Jack · 2026</div>
          <p className="j-la-q">
            Una plataforma para organizar tu agenda, ver tus citas y entender tu negocio en un solo lugar.
          </p>
        </div>

        <div className="j-la-stats">
          <div>
            <div className="j-la-stat-v">100%</div>
            <div className="j-la-stat-l">Acceso restringido</div>
          </div>
          <div>
            <div className="j-la-stat-v">Tiempo real</div>
            <div className="j-la-stat-l">Sincronización</div>
          </div>
          <div>
            <div className="j-la-stat-v">Supabase</div>
            <div className="j-la-stat-l">Auth + datos</div>
          </div>
        </div>

        <svg className="j-la-grid" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <pattern id="jlg" x="0" y="0" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M64 0 L0 0 0 64" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth=".5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#jlg)" />
        </svg>
      </aside>

      {/* RIGHT — form */}
      <main className="j-login-main">
        <div className="j-lm-top">
          <span>Acceso restringido. Tu administrador crea tu cuenta.</span>
        </div>

        <div className="j-lm-form-wrap">
          <form className="j-lm-form" onSubmit={handleSubmit}>
            <div className="j-lm-restricted">
              <span style={{ width: 6, height: 6, background: "var(--fg)", borderRadius: "50%" }} />
              <span>Acceso restringido</span>
            </div>

            <h1 className="j-lm-h1">
              Bienvenido <span className="serif">de vuelta</span>
            </h1>
            <p className="j-lm-sub">
              Inicia sesión con tu cuenta de Jack para acceder al panel de tu negocio.
            </p>

            <div className="j-lm-field">
              <label htmlFor="login-email">Correo electrónico</label>
              <input
                id="login-email"
                className="j-lm-input"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="j-lm-field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                className="j-lm-input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="j-lm-alert err">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {setupMessage && (
              <div className="j-lm-alert warn">
                <AlertCircle size={15} />
                <div>
                  <p style={{ margin: 0 }}>{setupMessage}</p>
                  {currentUserId && (
                    <p className="mono" style={{ marginTop: 6, fontSize: 11, wordBreak: "break-all" }}>
                      auth user id: {currentUserId}
                    </p>
                  )}
                </div>
              </div>
            )}

            <button type="submit" className="j-lm-submit" disabled={loading}>
              {loading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".25" />
                    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Iniciando sesión…
                </>
              ) : (
                <>
                  Iniciar sesión <ChevronRight size={14} />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="j-lm-foot">
          <span>© {new Date().getFullYear()} Jack</span>
          <span>·</span>
          <a href="/terminos" style={{ color: "inherit" }}>Términos</a>
          <span>·</span>
          <a href="/privacidad" style={{ color: "inherit" }}>Privacidad</a>
          <span className="mono" style={{ marginLeft: "auto" }}>v 2.4.1</span>
        </div>
      </main>
    </div>
  );
}
