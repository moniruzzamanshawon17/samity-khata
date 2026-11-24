import { useEffect, useState } from "react";

/** Breakpoints shared with styles.css: phone < 768, tablet 768–1023, desktop 1024+. */
export const PHONE = "(max-width: 767px)";

/** True while the media query matches; updates on resize/rotation. */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
