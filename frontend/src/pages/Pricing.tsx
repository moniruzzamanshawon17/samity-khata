import { useEffect, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import logoUrl from "../assets/brand/samity-khata-logo.svg";
import { PLAN_PRICES, SETUP_FEE } from "../lib/plans";

/** Replace these placeholders with your real contact details. */
const CONTACT = {
  phone: "[YOUR PHONE]",
  email: "[YOUR EMAIL]",
};

const taka = (n: number) => `৳${n.toLocaleString("en-IN")}`;

const PLANS = [
  {
    name: "Khata",
    price: taka(PLAN_PRICES.khata),
    features: ["Up to 50 members", "Secretary + 1 collector", "100 assistant questions a month"],
    forWho: "For a small village samity starting out",
    popular: false,
  },
  {
    name: "Samity",
    price: taka(PLAN_PRICES.samity),
    features: ["Up to 200 members", "Secretary + 3 collectors", "1,000 assistant questions a month"],
    forWho: "For most samities",
    popular: true,
  },
  {
    name: "Branch",
    price: taka(PLAN_PRICES.branch),
    features: ["Up to 500 members", "Unlimited collectors", "3,000 assistant questions a month"],
    forWho: "For large samities and NGO branch offices",
    popular: false,
  },
];

const INCLUDED = [
  "Member register and passbook",
  "Monthly deposits, withdrawals and corrections by reversal",
  "Loans with equal monthly instalments (EMI) and repayment schedule",
  "Overdue loan tracking",
  "Your samity's bylaw rules, checked automatically",
  "Members see their own savings and loans",
  "Ask questions in Bangla or English (সহকারী)",
  "Daily backups and updates",
];

const EXTRAS = [
  {
    title: `Setup fee ${taka(SETUP_FEE)}, one time`,
    body: "We import your paper khata or Excel register, load your bylaw and train the secretary and collectors. Free on an annual plan.",
  },
  { title: "Annual plan", body: "Pay for 10 months, get 12." },
  { title: "30-day free trial", body: "On every plan." },
];

const FAQ = [
  { q: "Can members see other members' savings?", a: "No. Each member sees only their own records, as the bylaw's confidentiality rule requires." },
  { q: "Do we need internet?", a: "Yes, the app runs in the browser on a phone or computer." },
  { q: "How do we pay?", a: "Monthly or yearly. Mobile payment is planned; for now, contact us." },
  { q: "What happens to our data if we stop?", a: "You can ask for a full export of your records." },
];

export function Pricing() {
  // Arriving from another page with /pricing#contact: scroll to that section once it has rendered.
  useEffect(() => {
    if (window.location.hash === "#contact") {
      requestAnimationFrame(() => document.getElementById("contact")?.scrollIntoView({ block: "start" }));
    }
  }, []);

  useEffect(() => {
    document.title = "Pricing — Samity Khata";
    return () => {
      document.title = "Samity Khata";
    };
  }, []);

  // Smooth-scroll to the contact section and keep #contact in the address bar.
  const toContact = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", "#contact");
  };

  return (
    <div className="lp pr">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="pr-logo">
            <img src={logoUrl} alt="Samity Khata" width={160} />
          </Link>
          <div className="lp-nav-right">
            <Link to="/login" className="btn pri">Sign in</Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Heading + plans ---------- */}
        <section className="pr-head">
          <div className="lp-wrap">
            <h1 className="pr-h1">Simple pricing for every samity</h1>
            <p className="pr-sub">Pay per samity, by member count. The basic plan costs less than one member's monthly deposit.</p>

            <div className="pr-plans">
              {PLANS.map((p) => (
                <article key={p.name} className={`pr-plan${p.popular ? " popular" : ""}`} aria-label={`${p.name} plan`}>
                  {p.popular && <span className="pr-badge">Most popular</span>}
                  <h2 className="pr-name">{p.name}</h2>
                  <div className="pr-price">
                    {p.price} <span>/ month</span>
                  </div>
                  <ul className="pr-feats">
                    {p.features.map((f) => (
                      <li key={f}>
                        <Icon name="check" size={18} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="pr-for">{p.forWho}</p>
                  <a href="#contact" className={`btn lg ${p.popular ? "pri" : "pr-btn-outline"}`} onClick={toContact}>
                    Start 30-day free trial
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Every plan includes ---------- */}
        <section className="lp-sec lp-alt">
          <div className="lp-wrap">
            <h2 className="lp-h2">Every plan includes</h2>
            <ul className="pr-included">
              {INCLUDED.map((x) => (
                <li key={x}>
                  <Icon name="check" size={18} />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Extras ---------- */}
        <section className="lp-sec">
          <div className="lp-wrap">
            <h2 className="lp-h2">Extras</h2>
            <div className="pr-extras">
              {EXTRAS.map((x) => (
                <div key={x.title} className="lp-card">
                  <h3 className="pr-extra-t">{x.title}</h3>
                  <p>{x.body}</p>
                </div>
              ))}
            </div>

            {/* ---------- Founding samities ---------- */}
            <div className="pr-founding">
              <h2 className="pr-founding-t">Founding samities</h2>
              <p>The first 10 samities get 3 months free in exchange for feedback.</p>
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="lp-sec lp-alt">
          <div className="lp-wrap lp-faq-wrap">
            <h2 className="lp-h2">Questions</h2>
            <div className="lp-faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Contact ---------- */}
        <section className="lp-sec pr-contact" id="contact">
          <div className="lp-wrap">
            <h2 className="lp-h2">Start your free trial</h2>
            <p className="pr-contact-p">Call or email us to set up your samity:</p>
            <div className="pr-contact-list">
              <div className="pr-contact-item">
                <span className="pr-contact-k">Phone</span>
                <span className="pr-placeholder">{CONTACT.phone}</span>
              </div>
              <div className="pr-contact-item">
                <span className="pr-contact-k">Email</span>
                <span className="pr-placeholder">{CONTACT.email}</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <Link to="/" className="pr-logo">
            <img src={logoUrl} alt="Samity Khata" width={110} />
          </Link>
          <span>Digital khata for savings &amp; credit samitis in Bangladesh.</span>
          <Link to="/login">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
