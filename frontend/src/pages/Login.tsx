import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import logoUrl from "../assets/brand/samity-khata-logo.svg";
import markWhiteUrl from "../assets/brand/samity-khata-mark-white.svg";
import { Icon } from "../components/Icon";
import { Alert } from "../components/ui";
import { homeFor, useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthHero() {
  return (
    <div className="auth-hero">
      {/* Dark panel: white mark + app name (the name is the accessible label) */}
      <Link to="/" className="brand" style={{ padding: 0, alignSelf: "flex-start" }}>
        <img src={markWhiteUrl} alt="" width={36} className="brand-img" />
        <span>
          <span className="brand-name" style={{ display: "block" }}>Samity Khata</span>
          <span className="brand-sub bn" style={{ display: "block" }}>সমিতি খাতা</span>
        </span>
      </Link>
      <div style={{ maxWidth: 520 }}>
        <h1>The samity's ledger, loans and bylaws, in one place.</h1>
        <p>
          Record deposits on the 10th, check loan eligibility by the bylaw, and let members ask “
          <span className="bn">আমার ব্যালেন্স কত?</span>” in Bangla, without a paper khata.
        </p>
        <div className="auth-points">
          {[
            "Append-only ledger: every correction is a visible reversal",
            "Loan ceiling, interest and overdue status computed from the bylaw",
            "Bilingual assistant that cites the clause it used",
          ].map((p) => (
            <div key={p}>
              <Icon name="check" size={20} color="#7fd1ae" />
              <span>{p}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#8fb0a1" }}>For savings &amp; credit samitis in Bangladesh</div>
    </div>
  );
}

export function LangPills() {
  const { lang, setLang } = useI18n();
  return (
    <div className="langpills" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
        English
      </button>
      <button type="button" className="bn" aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>
        বাংলা
      </button>
    </div>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    // The API rejects a malformed email with 422 before checking the password; catch it here first.
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter your full email address, for example secretary@example.com");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await login(email.trim(), password);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && me.role !== "customer" ? from : homeFor(me.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setError("Enter your full email address, for example secretary@example.com");
      else setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <AuthHero />
      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit} noValidate>
          {/* Full logo above the form (220px desktop, 160px phone — width only, so it never stretches) */}
          <Link to="/" className="auth-logo">
            <img src={logoUrl} alt="Samity Khata" />
          </Link>
          <div>
            <h2 className="auth-h" style={{ fontSize: 28, marginBottom: 6 }}>{t("Sign in")}</h2>
            <p className="mut auth-sub" style={{ margin: 0 }}>
              Secretary, collector or member: one login for everyone.
            </p>
          </div>
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="lbl" htmlFor="em">
              {t("Email")}
            </label>
            <input className="inp" id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <label className="lbl" htmlFor="pw">
                {t("Password")}
              </label>
              <button type="button" className="linkbtn" style={{ padding: 0 }} aria-expanded={showHelp} onClick={() => setShowHelp((s) => !s)}>
                {t("Forgot password?")}
              </button>
            </div>
            <div className="pw-wrap">
              <input
                className="inp"
                id="pw"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}>
                <Icon name={showPw ? "eyeOff" : "eye"} size={18} />
              </button>
            </div>
            {showHelp && (
              <div className="hint" role="note">
                {t("Ask your samity secretary to reset your password.")}
              </div>
            )}
          </div>
          <button className="btn pri lg" type="submit" disabled={busy || !email || !password}>
            {busy ? <><span className="spinner" style={{ width: 16, height: 16, margin: 0, borderColor: "rgba(255,255,255,.35)", borderTopColor: "#fff" }} /> {t("Signing in…")}</> : t("Sign in")}
          </button>
          <p className="auth-more">
            <Link to="/pricing">See plans and pricing</Link>
          </p>
          <LangPills />
        </form>
      </div>
    </div>
  );
}
