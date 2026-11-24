import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setFormatLang } from "./format";

export type Lang = "en" | "bn";

// Keys are the English text; missing Bangla entries fall back to English.
const BN: Record<string, string> = {
  Dashboard: "ড্যাশবোর্ড",
  Members: "সদস্য",
  Collect: "আদায়",
  Ledger: "খাতা",
  Loans: "ঋণ",
  Bylaws: "উপবিধি",
  Assistant: "সহকারী",
  Settings: "সেটিংস",
  "Sign out": "সাইন আউট",
  "Sign in": "সাইন ইন",
  Email: "ইমেইল",
  Password: "পাসওয়ার্ড",
  "Full name": "পুরো নাম",
  "Create account": "অ্যাকাউন্ট খুলুন",
  "Create an account": "অ্যাকাউন্ট খুলুন",
  "New member?": "নতুন সদস্য?",
  "Forgot password?": "পাসওয়ার্ড ভুলে গেছেন?",
  Features: "বৈশিষ্ট্য",
  "How it works": "কীভাবে কাজ করে",
  Pricing: "মূল্য",
  FAQ: "প্রশ্নোত্তর",
  Questions: "প্রশ্নোত্তর",
  "See how it works": "কীভাবে কাজ করে দেখুন",
  "Still running the samity on paper?": "এখনও কাগজের খাতায় সমিতি চালাচ্ছেন?",
  "Everything a samity needs": "সমিতির যা কিছু দরকার",
  "One app, three roles": "এক অ্যাপ, তিন ভূমিকা",
  "Simple pricing": "সহজ মূল্য",
  "Ask your samity secretary to reset your password.": "পাসওয়ার্ড নতুন করে দিতে সমিতির সম্পাদককে বলুন।",
  "Signing in…": "সাইন ইন হচ্ছে…",
  Home: "হোম",
  "My loan": "আমার ঋণ",
  History: "লেনদেন",
  Ask: "জিজ্ঞাসা",
  "My savings": "আমার সঞ্চয়",
  "Can withdraw": "তোলা যাবে",
  "Loan ceiling": "ঋণ সীমা",
  "Next instalment": "পরবর্তী কিস্তি",
  "Recent transactions": "সাম্প্রতিক লেনদেন",
  "Active member": "সক্রিয় সদস্য",
  "Inactive member": "নিষ্ক্রিয় সদস্য",
  "No unpaid deposits": "বকেয়া জমা নেই",
  "unpaid deposits": "টি জমা বকেয়া",
  "Principal left": "বাকি আসল",
  "Due now": "এখন দেয়",
  "Total repaid": "মোট পরিশোধ",
  "Repayment schedule": "কিস্তির তালিকা",
  Paid: "পরিশোধিত",
  Next: "পরবর্তী",
  Upcoming: "আসন্ন",
  Overdue: "বকেয়া",
  Active: "সক্রিয়",
  Closed: "বন্ধ",
  Deposit: "জমা",
  Withdrawal: "উত্তোলন",
  Repayment: "কিস্তি পরিশোধ",
  Reversal: "সংশোধন",
  "No loan yet": "এখনো কোনো ঋণ নেই",
  "Questions about the rules? Ask the assistant": "সমিতির নিয়ম নিয়ে প্রশ্ন? জিজ্ঞেস করুন",
  "Samity assistant": "সমিতি সহকারী",
  "Can only see your own records": "শুধু আপনার নিজের হিসাব দেখতে পারে",
  "Type your question…": "প্রশ্ন লিখুন…",
  Send: "পাঠান",
  Sources: "সূত্র",
  "Your account is not linked yet": "আপনার অ্যাকাউন্ট এখনো যুক্ত হয়নি",
  "Ask the secretary to link your login to your member number. Until then you can still ask the assistant about the bylaws.":
    "সম্পাদককে আপনার লগইন সদস্য নম্বরের সাথে যুক্ত করতে বলুন। ততক্ষণ উপবিধি নিয়ে সহকারীকে প্রশ্ন করতে পারেন।",
  "Member no.": "সদস্য নং",
  "Tell the secretary": "সম্পাদককে জানান",
  More: "আরও",
  "next deposit date": "পরবর্তী জমার তারিখ",
  collection: "আদায়",
  "Reading your question…": "প্রশ্নটি পড়ছি…",
  "Looking up records and bylaws…": "হিসাব ও উপবিধি খুঁজছি…",
  "Writing the answer…": "উত্তর লিখছি…",
  "Finding the member": "সদস্য খুঁজছি",
  "Reading the member record": "সদস্যের তথ্য পড়ছি",
  "Checking the balance": "ব্যালেন্স দেখছি",
  "Reading transactions": "লেনদেন পড়ছি",
  "Checking loans": "ঋণ দেখছি",
  "Reading the loan schedule": "কিস্তির তালিকা পড়ছি",
  "Searching the bylaws": "উপবিধি খুঁজছি",
  "Looking things up": "তথ্য খুঁজছি",
  "Total interest": "মোট সুদ",
  Member: "সদস্য",
  "Member app": "সদস্য অ্যাপ",
  "Account ID": "অ্যাকাউন্ট আইডি",
  "instalments paid": "কিস্তি পরিশোধিত",
  "Good day": "শুভেচ্ছা",
  "Loading…": "লোড হচ্ছে…",
  "Thinking…": "খুঁজছি…",
  "New chat": "নতুন চ্যাট",
  "Ask in Bangla or English. It can only look things up — never change records — and only what you are allowed to see.":
    "বাংলা বা ইংরেজিতে জিজ্ঞেস করুন। সহকারী শুধু তথ্য খুঁজে দেখতে পারে — কোনো হিসাব বদলাতে পারে না — আর শুধু সেটুকুই দেখে, যা আপনার দেখার অনুমতি আছে।",
  "Ask about a member, a loan, a balance or a bylaw rule — in Bangla or English. Answers about rules cite the clause.":
    "কোনো সদস্য, ঋণ, ব্যালেন্স বা উপবিধির নিয়ম নিয়ে বাংলা বা ইংরেজিতে জিজ্ঞেস করুন। নিয়মের উত্তরে ধারা উল্লেখ থাকে।",
  "This conversation is cleared when you close the tab.": "ট্যাব বন্ধ করলে এই কথোপকথন মুছে যাবে।",
  "Looked up:": "যা দেখা হয়েছে:",
};

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (s: string) => string;
  locale: string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem("sk.lang") === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });
  // Money, number, phone and date helpers read the language from here.
  setFormatLang(lang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("sk.lang", l);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (s) => (lang === "bn" ? BN[s] ?? s : s), locale: lang === "bn" ? "bn-BD" : "en-IN" }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}
