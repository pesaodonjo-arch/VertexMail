"use client";

import { ThemeSwitcher } from "./ThemeSwitcher";

export function AppearanceCard() {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Appearance</p>
      <p className="mt-1 text-sm text-ink-700">Choose a light or dark look. “Auto” follows your phone or computer setting.</p>
      <ThemeSwitcher className="mt-3" />
    </div>
  );
}
