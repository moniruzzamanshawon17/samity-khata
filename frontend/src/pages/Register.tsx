import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert } from "../components/ui";
import { homeFor, useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { errorText } from "../lib/api";

export function Register() {
  const { user, register } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;
  const short = password.length > 0 && password.length < 8;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a full email address, for example rahima@example.com");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await register(name.trim(), email.trim(), password);
      nav(homeFor(me.role), { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    <>You get a <b>member</b> login. Admin and collector accounts are created by the secretary only.</>,
    <>The secretary links it to your member number, e.g. <b>SSR-0001</b>.</>,
    <>You see your balance and loan schedule, and can ask the assistant in Bangla or English.</>,
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 960, display: "flex", flexWrap: "wrap", overflow: "hidden", borderRadius: 16 }}>
        <form onSubmit={submit} noValidate style={{ flex: "999 1 420px", padding: 40, display: "flex", flexDirection: "column", gap: 18 }}>
          <Link to="/login" style={{ fontSize: 14, textDecoration: "none" }}>
            ← Back to sign in
          </Link>
          <div>
            <h1 style={{ fontSize: 28, marginBottom: 6 }}>Create your member account</h1>
            <p className="mut" style={{ margin: 0 }}>
              After you sign up, the secretary links this account to your member number so you can see your own savings and loan.
            </p>
          </div>
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="lbl" htmlFor="n">{t("Full name")}</label>
            <input className="inp" id="n" autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="e">{t("Email")}</label>
            <input className="inp" id="e" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="p">{t("Password")}</label>
            <input
              className={`inp${short ? " err" : ""}`}
              id="p"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="p-hint"
            />
            <div id="p-hint" className={short ? "emsg" : "hint"}>
              At least 8 characters.
            </div>
          </div>
          <button className="btn pri lg" type="submit" disabled={busy || !name.trim() || !email || password.length < 8}>
            {busy ? "Creating…" : t("Create account")}
          </button>
        </form>
        <div style={{ flex: "1 1 300px", background: "#e9f1ec", padding: "40px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontWeight: 700 }}>What happens next</div>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 14 }}>
              <span className="avatar" style={{ width: 28, height: 28, background: "var(--primary)" }}>{i + 1}</span>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>{s}</div>
            </div>
          ))}
          <div className="bn" style={{ marginTop: "auto", fontSize: 13, color: "var(--ink-2)" }}>
            আপনার তথ্য শুধু আপনি ও সমিতির সম্পাদক দেখতে পারবেন।
          </div>
        </div>
      </div>
    </div>
  );
}
