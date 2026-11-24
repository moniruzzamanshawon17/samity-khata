import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LangToggle } from "../components/NavParts";
import markUrl from "../assets/brand/samity-khata-mark.svg";
import { useI18n, type Lang } from "../lib/i18n";

import { PLAN_PRICES, SETUP_FEE } from "../lib/plans";

/** Money in the page's language: "৳1,86,500" or "৳১,৮৬,৫০০". */
function money(n: number, lang: Lang) {
  return lang === "bn" ? `৳${n.toLocaleString("bn-BD")}` : `৳${n.toLocaleString("en-IN")}`;
}
function num(n: number, lang: Lang) {
  return n.toLocaleString(lang === "bn" ? "bn-BD" : "en-IN");
}

// Every piece of text on the page, in both languages.
const CONTENT = {
  en: {
    title: "Samity Khata — the digital khata for savings samitis",
    brandName: "Samity Khata",
    brandSub: "সমিতি খাতা",
    nav: { features: "Features", how: "How it works", pricing: "Pricing", faq: "FAQ", signIn: "Sign in", menu: "Menu" },
    hero: {
      eyebrow: "For savings & credit samitis in Bangladesh",
      h1: "Your samity's khata, loans and bylaws — in one place.",
      p: "Samity Khata replaces the paper ledger. Collectors record deposits on the 10th, loans follow your bylaw automatically, and every member can check their own balance in Bangla.",
      seeHow: "See how it works",
      ticks: ["Bangla & English", "Works on any phone", "No more hand-calculated interest"],
    },
    preview: {
      savings: "Total savings",
      loans: "Loans outstanding",
      overdue: "Overdue",
      collection: "November collection",
      paid: (a: string, b: string, amt: string) => `${a} of ${b} members paid · ${amt}`,
      deposit: "Deposit",
      repayment: "Repayment",
      m1: "Rahima Begum",
      m2: "Karim Mia",
    },
    problem: {
      h2: "Still running the samity on paper?",
      lead: "The secretary spends hours adding totals, interest is worked out by hand, and one disputed entry can split a samity.",
      compare: [
        { old: "Paper khata", pain: "Pages get lost or rewritten; totals are added by hand at every meeting." },
        { old: "Excel sheet", pain: "One person's laptop; formulas break; members can't check their own balance." },
        { old: "Facebook group & phone calls", pain: "Balances are shared in chats; nothing is a record you can trust in a dispute." },
      ],
      answerLabel: "Samity Khata:",
      answer: "one record everyone can trust — calculated by the bylaw, checked by the members themselves.",
    },
    features: {
      h2: "Everything a samity needs",
      lead: "Built around how a savings and credit samity actually works: monthly deposits, loans, collectors and meetings.",
      items: [
        { icon: "list", title: "A ledger nobody can quietly change", body: "Every deposit, withdrawal and instalment is a permanent entry. Mistakes are fixed with a visible reversal, so there are no torn pages or overwritten numbers." },
        { icon: "loan", title: "Loans that follow your bylaw", body: "Eligibility, loan ceiling, 1% monthly reducing-balance interest, instalment amounts and overdue status are calculated from the bylaw — not by hand." },
        { icon: "plus", title: "Collection in seconds", body: "Collectors find a member, tap Deposit or Repayment and save. Today's total is always on screen. Withdrawals stay with the secretary." },
        { icon: "home", title: "A member app in Bangla", body: "Members see their own savings, how much they can withdraw, their loan schedule and every transaction — on their own phone." },
        { icon: "chat", title: "Ask in Bangla or English", body: "“আমার ব্যালেন্স কত?” The assistant looks up the real records and answers from the bylaw, citing the clause — or says the bylaw doesn't cover it." },
        { icon: "settings", title: "Roles and privacy built in", body: "Secretary, collector and member each see only what their role allows. A member can never open another member's account." },
      ],
    },
    roles: {
      h2: "One app, three roles",
      items: [
        { chip: "ok", name: "Secretary", body: "Manages members and loans, corrects mistakes, uploads the bylaw and sees the whole samity at a glance." },
        { chip: "blu", name: "Collector", body: "Records deposits and instalments in the field. Cannot withdraw money or change past entries." },
        { chip: "neu", name: "Member", body: "Sees their own savings, loan and history, and asks questions in Bangla — nobody else's account." },
      ],
    },
    how: {
      h2: "How it works",
      steps: [
        { title: "Secretary sets up the samity", body: "Add members, set the monthly deposit and upload your bylaw (Bangla or English)." },
        { title: "Collector records on the 10th", body: "Deposits and instalments are entered on a phone as they are collected." },
        { title: "Members check and ask", body: "Members see their balance and loan anytime, and ask the assistant about the rules." },
      ],
    },
    pricing: {
      h2: "Simple pricing for every samity",
      lead: "Pay per samity, by member count. Every plan starts with a 30-day free trial.",
      per: "/ month",
      popular: "Most popular",
      plans: [
        { key: "khata", name: "Khata", features: ["Up to 50 members", "Secretary + 1 collector", "100 assistant questions a month"], forWho: "For a small village samity starting out" },
        { key: "samity", name: "Samity", features: ["Up to 200 members", "Secretary + 3 collectors", "1,000 assistant questions a month"], forWho: "For most samities" },
        { key: "branch", name: "Branch", features: ["Up to 500 members", "Unlimited collectors", "3,000 assistant questions a month"], forWho: "For large samities and NGO branch offices" },
      ],
      trial: "Start 30-day free trial",
      extras: (setup: string) => `One-time setup ${setup} (free on an annual plan) · Annual plan: pay for 10 months, get 12.`,
      more: "See full pricing and what every plan includes",
    },
    faq: {
      h2: "Questions",
      items: [
        { q: "Can someone change an old entry?", a: "No. Entries can't be edited or deleted. A wrong entry is corrected by the secretary with a reversal that stays visible in the ledger." },
        { q: "Does it follow our bylaw?", a: "The money rules (deposit, loan ceiling, interest, instalments, overdue) follow the samity's bylaw. You upload the bylaw text, and the assistant answers rule questions only from it." },
        { q: "Which languages does it support?", a: "Bangla and English, for both the app and the assistant. Each person can switch language anytime." },
        { q: "Who can see a member's money?", a: "The secretary and the collector, and the member themself. Members can only see their own records." },
        { q: "What doesn't it do yet?", a: "Late fines are shown as guidance but not posted automatically, and guarantors are still checked on paper. We'll tell you exactly what is covered before you start." },
      ],
    },
    final: {
      h2: "Bring your samity's khata online.",
      p: "Secretary, collector or member — sign in with the account your samity gave you.",
    },
    footer: {
      line: "Digital khata for savings & credit samitis in Bangladesh.",
      copy: (y: string) => `© ${y} Samity Khata`,
    },
  },
  bn: {
    title: "সমিতি খাতা — সঞ্চয় সমিতির ডিজিটাল খাতা",
    brandName: "সমিতি খাতা",
    brandSub: "সঞ্চয় ও ঋণদান সমিতি",
    nav: { features: "বৈশিষ্ট্য", how: "কীভাবে কাজ করে", pricing: "মূল্য", faq: "প্রশ্নোত্তর", signIn: "সাইন ইন", menu: "মেনু" },
    hero: {
      eyebrow: "বাংলাদেশের সঞ্চয় ও ঋণদান সমিতির জন্য",
      h1: "আপনার সমিতির খাতা, ঋণ আর উপবিধি — এক জায়গায়।",
      p: "সমিতি খাতা কাগজের খাতার জায়গা নেয়। আদায়কারী ১০ তারিখে জমা লেখেন, ঋণের হিসাব উপবিধি মেনে নিজে থেকেই হয়, আর প্রত্যেক সদস্য বাংলায় নিজের ব্যালেন্স দেখতে পারেন।",
      seeHow: "কীভাবে কাজ করে দেখুন",
      ticks: ["বাংলা ও ইংরেজি", "যেকোনো ফোনে চলে", "হাতে সুদ হিসাবের ঝামেলা নেই"],
    },
    preview: {
      savings: "মোট সঞ্চয়",
      loans: "বকেয়া ঋণ",
      overdue: "মেয়াদোত্তীর্ণ",
      collection: "নভেম্বরের আদায়",
      paid: (a: string, b: string, amt: string) => `${b} জনের মধ্যে ${a} জন দিয়েছেন · ${amt}`,
      deposit: "জমা",
      repayment: "কিস্তি",
      m1: "রহিমা বেগম",
      m2: "করিম মিয়া",
    },
    problem: {
      h2: "এখনও কাগজের খাতায় সমিতি চালাচ্ছেন?",
      lead: "প্রতি মাসে যোগফল মেলাতে সম্পাদকের ঘণ্টার পর ঘণ্টা চলে যায়, সুদ হিসাব হয় হাতে, আর একটা বিতর্কিত হিসাবেই সমিতি ভেঙে যেতে পারে।",
      compare: [
        { old: "কাগজের খাতা", pain: "পাতা হারায় বা ঘষামাজা হয়; প্রতিটি সভায় হাতে যোগফল করতে হয়।" },
        { old: "এক্সেল শিট", pain: "একজনের ল্যাপটপে থাকে; ফর্মুলা ভেঙে যায়; সদস্যরা নিজের ব্যালেন্স দেখতে পারেন না।" },
        { old: "ফেসবুক গ্রুপ ও ফোন কল", pain: "ব্যালেন্স চ্যাটে ঘোরে; বিরোধের সময় ভরসা করার মতো কোনো রেকর্ড থাকে না।" },
      ],
      answerLabel: "সমিতি খাতা:",
      answer: "একটাই হিসাব, যা সবাই বিশ্বাস করতে পারেন — উপবিধি মেনে হিসাব করা, আর সদস্যরা নিজেরাই যাচাই করেন।",
    },
    features: {
      h2: "সমিতির যা কিছু দরকার",
      lead: "সঞ্চয় ও ঋণদান সমিতি যেভাবে চলে, ঠিক সেভাবেই তৈরি: মাসিক জমা, ঋণ, আদায়কারী আর সভা।",
      items: [
        { icon: "list", title: "এমন খাতা, যা কেউ গোপনে বদলাতে পারে না", body: "প্রতিটি জমা, উত্তোলন ও কিস্তি স্থায়ীভাবে লেখা থাকে। ভুল হলে দৃশ্যমান সংশোধনী এন্ট্রি দিয়ে ঠিক করা হয় — ছেঁড়া পাতা বা ঘষামাজা নেই।" },
        { icon: "loan", title: "উপবিধি মেনে ঋণ", body: "যোগ্যতা, ঋণসীমা, মাসিক ১% ক্রমহ্রাসমান সুদ, কিস্তির পরিমাণ আর মেয়াদোত্তীর্ণ অবস্থা — সবই উপবিধি থেকে হিসাব হয়, হাতে নয়।" },
        { icon: "plus", title: "মুহূর্তেই আদায়", body: "আদায়কারী সদস্য খুঁজে “জমা” বা “কিস্তি” চেপে সেভ করেন। আজকের মোট আদায় সবসময় স্ক্রিনে থাকে। উত্তোলন শুধু সম্পাদকের হাতে।" },
        { icon: "home", title: "বাংলায় সদস্য অ্যাপ", body: "সদস্যরা নিজের ফোনেই দেখেন নিজের সঞ্চয়, কত টাকা তোলা যাবে, ঋণের কিস্তির তালিকা আর প্রতিটি লেনদেন।" },
        { icon: "chat", title: "বাংলা বা ইংরেজিতে জিজ্ঞেস করুন", body: "“আমার ব্যালেন্স কত?” সহকারী আসল হিসাব দেখে উপবিধি থেকে উত্তর দেয় এবং ধারা উল্লেখ করে — অথবা জানিয়ে দেয় উপবিধিতে বিষয়টি নেই।" },
        { icon: "settings", title: "ভূমিকা ও গোপনীয়তা", body: "সম্পাদক, আদায়কারী ও সদস্য প্রত্যেকে শুধু নিজের ভূমিকার অনুমতি অনুযায়ী দেখতে পান। কোনো সদস্য অন্যের হিসাব খুলতে পারেন না।" },
      ],
    },
    roles: {
      h2: "এক অ্যাপ, তিন ভূমিকা",
      items: [
        { chip: "ok", name: "সম্পাদক", body: "সদস্য ও ঋণ পরিচালনা করেন, ভুল সংশোধন করেন, উপবিধি আপলোড করেন এবং পুরো সমিতি এক নজরে দেখেন।" },
        { chip: "blu", name: "আদায়কারী", body: "মাঠে গিয়ে জমা ও কিস্তি লেখেন। টাকা তুলতে বা পুরোনো এন্ট্রি বদলাতে পারেন না।" },
        { chip: "neu", name: "সদস্য", body: "নিজের সঞ্চয়, ঋণ ও লেনদেন দেখেন এবং বাংলায় প্রশ্ন করেন — অন্য কারো হিসাব নয়।" },
      ],
    },
    how: {
      h2: "কীভাবে কাজ করে",
      steps: [
        { title: "সম্পাদক সমিতি সাজান", body: "সদস্য যোগ করুন, মাসিক জমার পরিমাণ ঠিক করুন আর উপবিধি আপলোড করুন (বাংলা বা ইংরেজি)।" },
        { title: "আদায়কারী ১০ তারিখে লেখেন", body: "জমা ও কিস্তি আদায়ের সাথে সাথেই ফোনে লেখা হয়।" },
        { title: "সদস্যরা দেখেন ও জিজ্ঞেস করেন", body: "সদস্যরা যেকোনো সময় নিজের ব্যালেন্স ও ঋণ দেখেন, আর নিয়ম নিয়ে সহকারীকে প্রশ্ন করেন।" },
      ],
    },
    pricing: {
      h2: "প্রতিটি সমিতির জন্য সহজ মূল্য",
      lead: "প্রতি সমিতির জন্য, সদস্যসংখ্যা অনুযায়ী মূল্য। প্রতিটি প্ল্যান শুরু হয় ৩০ দিনের ফ্রি ট্রায়াল দিয়ে।",
      per: "/ মাস",
      popular: "সবচেয়ে জনপ্রিয়",
      plans: [
        { key: "khata", name: "খাতা", features: ["সর্বোচ্চ ৫০ জন সদস্য", "সম্পাদক + ১ জন আদায়কারী", "মাসে ১০০টি সহকারী প্রশ্ন"], forWho: "নতুন শুরু করা ছোট গ্রামীণ সমিতির জন্য" },
        { key: "samity", name: "সমিতি", features: ["সর্বোচ্চ ২০০ জন সদস্য", "সম্পাদক + ৩ জন আদায়কারী", "মাসে ১,০০০টি সহকারী প্রশ্ন"], forWho: "বেশিরভাগ সমিতির জন্য" },
        { key: "branch", name: "শাখা", features: ["সর্বোচ্চ ৫০০ জন সদস্য", "যত খুশি আদায়কারী", "মাসে ৩,০০০টি সহকারী প্রশ্ন"], forWho: "বড় সমিতি ও এনজিওর শাখা অফিসের জন্য" },
      ],
      trial: "৩০ দিনের ফ্রি ট্রায়াল শুরু করুন",
      extras: (setup: string) => `এককালীন সেটআপ ${setup} (বার্ষিক প্ল্যানে ফ্রি) · বার্ষিক প্ল্যান: ১০ মাসের দামে ১২ মাস।`,
      more: "সম্পূর্ণ মূল্য ও প্রতিটি প্ল্যানের সুবিধা দেখুন",
    },
    faq: {
      h2: "প্রশ্নোত্তর",
      items: [
        { q: "কেউ কি পুরোনো এন্ট্রি বদলাতে পারে?", a: "না। কোনো এন্ট্রি সম্পাদনা বা মুছে ফেলা যায় না। ভুল এন্ট্রি সম্পাদক একটি সংশোধনী এন্ট্রি দিয়ে ঠিক করেন, যা খাতায় দৃশ্যমান থাকে।" },
        { q: "এটা কি আমাদের উপবিধি মেনে চলে?", a: "টাকার নিয়ম (জমা, ঋণসীমা, সুদ, কিস্তি, মেয়াদোত্তীর্ণ) সমিতির উপবিধি অনুযায়ী চলে। আপনি উপবিধি আপলোড করেন, আর সহকারী নিয়মের প্রশ্নের উত্তর শুধু সেখান থেকেই দেয়।" },
        { q: "কোন কোন ভাষায় চলে?", a: "বাংলা ও ইংরেজি — অ্যাপ ও সহকারী দুটোতেই। যে কেউ যেকোনো সময় ভাষা বদলাতে পারেন।" },
        { q: "সদস্যের টাকার হিসাব কে দেখতে পারেন?", a: "সম্পাদক, আদায়কারী এবং সদস্য নিজে। সদস্যরা শুধু নিজের হিসাবই দেখতে পারেন।" },
        { q: "এখনো কী কী করে না?", a: "দেরির জরিমানা নির্দেশনা হিসেবে দেখানো হয়, তবে স্বয়ংক্রিয়ভাবে খাতায় ওঠে না; আর জামিনদার এখনো কাগজে যাচাই করতে হয়। শুরুর আগেই আমরা ঠিক কী কী আছে তা জানিয়ে দেব।" },
      ],
    },
    final: {
      h2: "আপনার সমিতির খাতা অনলাইনে আনুন।",
      p: "সম্পাদক, আদায়কারী বা সদস্য — সমিতি থেকে পাওয়া অ্যাকাউন্ট দিয়ে সাইন ইন করুন।",
    },
    footer: {
      line: "বাংলাদেশের সঞ্চয় ও ঋণদান সমিতির ডিজিটাল খাতা।",
      copy: (y: string) => `© ${y} সমিতি খাতা`,
    },
  },
} as const;

const SECTIONS = ["features", "how", "pricing", "faq"] as const;

export function Landing() {
  const { lang } = useI18n();
  const c = CONTENT[lang];
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    document.title = c.title;
    return () => {
      document.title = "Samity Khata";
    };
  }, [c.title]);

  // Close the phone menu first, then scroll once the layout has settled, so the target doesn't move mid-scroll.
  const goTo = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setMenu(false);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    });
  };

  const brand = (
    <Link to="/" className="lp-brand">
      <img src={markUrl} alt="" width={36} className="brand-img" />
      <span>
        <span className="lp-brand-name">{c.brandName}</span>
        <span className="lp-brand-sub">{c.brandSub}</span>
      </span>
    </Link>
  );

  return (
    <div className="lp" lang={lang}>
      {/* ---------- Public navbar ---------- */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          {brand}
          <nav className="lp-links" aria-label={c.nav.menu}>
            {SECTIONS.map((id) => (
              <a key={id} href={`#${id}`} onClick={(e) => goTo(e, id)}>{c.nav[id]}</a>
            ))}
          </nav>
          <div className="lp-nav-right">
            <span className="lp-hide-sm"><LangToggle /></span>
            <Link to="/login" className="btn pri">{c.nav.signIn}</Link>
            <button type="button" className="lp-menu-btn" aria-label={c.nav.menu} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon name={menu ? "close" : "menu"} size={22} />
            </button>
          </div>
        </div>
        {menu && (
          <div className="lp-mobile-menu">
            {SECTIONS.map((id) => (
              <a key={id} href={`#${id}`} onClick={(e) => goTo(e, id)}>{c.nav[id]}</a>
            ))}
            <div style={{ padding: "8px 4px" }}><LangToggle /></div>
          </div>
        )}
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow">{c.hero.eyebrow}</span>
              <h1>{c.hero.h1}</h1>
              <p>{c.hero.p}</p>
              <div className="lp-cta">
                <Link to="/login" className="btn pri lg">{c.nav.signIn}</Link>
                <a href="#how" className="btn lg lp-btn-ghost" onClick={(e) => goTo(e, "how")}>{c.hero.seeHow}</a>
              </div>
              <ul className="lp-ticks">
                {c.hero.ticks.map((tk) => (
                  <li key={tk}><Icon name="check" size={18} /> {tk}</li>
                ))}
              </ul>
            </div>

            {/* Product preview built from cards (no screenshot needed) */}
            <div className="lp-preview" aria-hidden="true">
              <div className="lp-pv-bar"><span /><span /><span /></div>
              <div className="lp-pv-body">
                <div className="lp-pv-kpis">
                  <div><small>{c.preview.savings}</small><b>{money(186500, lang)}</b></div>
                  <div><small>{c.preview.loans}</small><b>{money(92340, lang)}</b></div>
                  <div><small>{c.preview.overdue}</small><b className="bad">{num(2, lang)}</b></div>
                </div>
                <div className="lp-pv-card">
                  <small>{c.preview.collection}</small>
                  <div className="lp-pv-progress"><div style={{ width: "83%" }} /></div>
                  <span>{c.preview.paid(num(15, lang), num(18, lang), money(7500, lang))}</span>
                </div>
                <div className="lp-pv-row"><span className="chip ok">{c.preview.deposit}</span><span>{c.preview.m1}</span><b>{money(500, lang)}</b></div>
                <div className="lp-pv-row"><span className="chip neu">{c.preview.repayment}</span><span>{c.preview.m2}</span><b>{money(1830, lang)}</b></div>
                <div className="lp-pv-chat">
                  <div className="lp-pv-q bn">আমার ব্যালেন্স কত?</div>
                  <div className="lp-pv-a bn">আপনার সঞ্চয় ১২,০০০ টাকা। (ধারা ৩.৩)</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Problem ---------- */}
        <section className="lp-sec lp-alt">
          <div className="lp-wrap">
            <h2 className="lp-h2">{c.problem.h2}</h2>
            <p className="lp-lead">{c.problem.lead}</p>
            <div className="lp-grid3">
              {c.problem.compare.map((x) => (
                <div key={x.old} className="lp-card">
                  <div className="lp-card-k">{x.old}</div>
                  <p>{x.pain}</p>
                </div>
              ))}
            </div>
            <div className="lp-answer">
              <Icon name="check" size={20} />
              <span><b>{c.problem.answerLabel}</b> {c.problem.answer}</span>
            </div>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section className="lp-sec" id="features">
          <div className="lp-wrap">
            <h2 className="lp-h2">{c.features.h2}</h2>
            <p className="lp-lead">{c.features.lead}</p>
            <div className="lp-grid3">
              {c.features.items.map((f) => (
                <div key={f.title} className="lp-card">
                  <span className="lp-ic"><Icon name={f.icon} size={20} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Who uses it ---------- */}
        <section className="lp-sec lp-alt">
          <div className="lp-wrap">
            <h2 className="lp-h2">{c.roles.h2}</h2>
            <div className="lp-grid3">
              {c.roles.items.map((r) => (
                <div key={r.name} className="lp-card lp-role">
                  <span className={`chip ${r.chip}`}>{r.name}</span>
                  <p>{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section className="lp-sec" id="how">
          <div className="lp-wrap">
            <h2 className="lp-h2">{c.how.h2}</h2>
            <ol className="lp-steps">
              {c.how.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-n">{num(i + 1, lang)}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section className="lp-sec lp-alt" id="pricing">
          <div className="lp-wrap">
            <h2 className="lp-h2">{c.pricing.h2}</h2>
            <p className="lp-lead">{c.pricing.lead}</p>
            {/* Same plans and card styles as /pricing; prices come from lib/plans.ts */}
            <div className="pr-plans">
              {c.pricing.plans.map((p) => {
                const popular = p.key === "samity";
                return (
                  <article key={p.key} className={`pr-plan${popular ? " popular" : ""}`} aria-label={p.name}>
                    {popular && <span className="pr-badge">{c.pricing.popular}</span>}
                    <h3 className="pr-name">{p.name}</h3>
                    <div className="pr-price">
                      {money(PLAN_PRICES[p.key], lang)} <span>{c.pricing.per}</span>
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
                    <Link to="/pricing#contact" className={`btn lg ${popular ? "pri" : "pr-btn-outline"}`}>
                      {c.pricing.trial}
                    </Link>
                  </article>
                );
              })}
            </div>
            <p className="lp-price-note">{c.pricing.extras(money(SETUP_FEE, lang))}</p>
            <p className="lp-price-more">
              <Link to="/pricing">{c.pricing.more} →</Link>
            </p>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="lp-sec" id="faq">
          <div className="lp-wrap lp-faq-wrap">
            <h2 className="lp-h2">{c.faq.h2}</h2>
            <div className="lp-faq">
              {c.faq.items.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="lp-final">
          <div className="lp-wrap lp-final-in">
            <div>
              <h2>{c.final.h2}</h2>
              <p>{c.final.p}</p>
            </div>
            <Link to="/login" className="btn lg lp-btn-light">{c.nav.signIn}</Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          {brand}
          <span>{c.footer.line}</span>
          <span>{c.footer.copy(num(new Date().getFullYear(), lang).replace(/,/g, ""))}</span>
        </div>
      </footer>
    </div>
  );
}
