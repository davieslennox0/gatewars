"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "zh" | "en";
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "zh", setLang: () => {} });

/** Chinese by default; the EN toggle is remembered per browser (convenience only). */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      const saved = (q === "en" || q === "zh" ? q : localStorage.getItem("gw-lang")) as Lang | null;
      if (saved === "en" || saved === "zh") setLangState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("gw-lang", l);
    } catch {}
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

/** L("中文", "English") → the string for the current language. */
export function useL() {
  const { lang } = useLang();
  return useCallback((zh: string, en: string) => (lang === "zh" ? zh : en), [lang]);
}

/** Inline text for server-rendered pages. */
export function T({ zh, en }: { zh: string; en: string }) {
  const { lang } = useLang();
  return <>{lang === "zh" ? zh : en}</>;
}

export const RISK_ZH = "技能竞赛。报名费可能损失，不承诺任何回报。奖金以 BNB/USDC 支付，其价值可能波动。";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      className="btn outline"
      style={{ minHeight: 36, minWidth: 52, padding: "0 10px" }}
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
      lang={lang === "zh" ? "en" : "zh-CN"}
    >
      {lang === "zh" ? "EN" : "中文"}
    </button>
  );
}
