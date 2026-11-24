import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Alert } from "../components/ui";
import { homeFor, useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEMO = [
  ["secretary@example.com", "admin"],
  ["collector@example.com", "staff"],
  ["rahima@example.com", "member"],
] as const;

export function AuthHero() {
  return (
    <div className="auth-hero">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 10 }}>
          <Icon name="logo" size={22} />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Samity Khata</div>
          <div className="bn" style={{ fontSize: 13, color: "#a9c2b6" }}>
            সমিতি খাতা
          </div>
        </div>
      </div>
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
          {/* Phone only: compact brand in place of the hero panel */}
          <div className="auth-mbrand">
            <span className="brand-mark" style={{ width: 52, height: 52, borderRadius: 14 }}>
              <Icon name="logo" size={28} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 22 }}>Samity Khata</div>
              <div className="bn mut" style={{ fontSize: 14 }}>সমিতি খাতা</div>
            </div>
          </div>
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
            <label className="lbl" htmlFor="pw">
              {t("Password")}
            </label>
            <input
              className="inp"
              id="pw"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn pri lg" type="submit" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : t("Sign in")}
          </button>
          <p className="mut" style={{ margin: 0, fontSize: 14, textAlign: "center" }}>
            {t("New member?")} <Link to="/register">{t("Create an account")}</Link>
          </p>
          <div className="demo">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Demo accounts (after running the seed)</div>
            {DEMO.map(([e, r]) => (
              <div key={e}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(e);
                    setPassword("samity-demo-123");
                  }}
                >
                  {e}
                </button>{" "}
                · {r}
              </div>
            ))}
            <div className="mut">Password: samity-demo-123 — click an email to fill it in.</div>
          </div>
          <LangPills />
        </form>
      </div>
    </div>
  );
}
