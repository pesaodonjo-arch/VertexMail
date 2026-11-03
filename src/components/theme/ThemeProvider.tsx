"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCapacitor } from "@/lib/native-push";

export type Theme = "light" | "dark" | "system";
export const THEME_KEY = "vx-theme";

// Colours the Android status bar uses (matches the page background in each theme).
const BAR = { light: "#FFFFFF", dark: "#10152A" };

const ThemeContext = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void }>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});
export const useTheme = () => useContext(ThemeContext);

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(theme: Theme): "light" | "dark" {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  // Inside the Android app, also recolour the native status bar.
  try {
    const cap = getCapacitor();
    if (cap) {
      const StatusBar = cap.registerPlugin ? cap.registerPlugin("StatusBar") : cap.Plugins?.StatusBar;
      StatusBar?.setStyle?.({ style: dark ? "DARK" : "LIGHT" });
      StatusBar?.setBackgroundColor?.({ color: dark ? BAR.dark : BAR.light });
    }
  } catch {
    /* status bar plugin unavailable — ignore */
  }
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Load the saved choice once on the client.
  useEffect(() => {
    let saved: Theme = "system";
    try {
      const v = window.localStorage.getItem(THEME_KEY);
      if (v === "light" || v === "dark" || v === "system") saved = v;
    } catch {}
    setThemeState(saved);
    setResolved(apply(saved));
  }, []);

  // "System" follows the phone/computer setting live.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(apply("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(THEME_KEY, t);
    } catch {}
    setResolved(apply(t));
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}
