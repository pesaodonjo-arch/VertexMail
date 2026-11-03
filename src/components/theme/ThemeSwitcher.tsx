"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { useTheme, type Theme } from "./ThemeProvider";

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Three-way Light / Dark / Auto switch. `tone="dark"` is for the always-dark admin sidebar. */
export function ThemeSwitcher({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const { theme, setTheme } = useTheme();
  const dark = tone === "dark";
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={clsx("grid grid-cols-3 gap-1 rounded-lg p-1", dark ? "bg-white/10" : "bg-ink-100", className)}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={clsx(
              "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
              dark
                ? active ? "bg-white/20 text-white" : "text-ink-300 hover:text-white"
                : active ? "bg-white text-ink-900 shadow-panel ring-1 ring-ink-200" : "text-ink-500 hover:text-ink-900"
            )}
          >
            <Icon size={14} /> {label}
          </button>
        );
      })}
    </div>
  );
}
