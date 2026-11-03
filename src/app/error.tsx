"use client";

import { useEffect } from "react";

// Shown if a page crashes while running. Deliberately generic: no technical details, no host names.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-6 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-xl font-bold text-ink-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-500">Check your internet connection and try again.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 h-11 w-full rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:brightness-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
