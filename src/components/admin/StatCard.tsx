import clsx from "clsx";

export function StatCard({
  label, value, hint, tone = "neutral",
}: { label: string; value: string | number; hint?: string; tone?: "neutral" | "brand" | "teal" }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p
        className={clsx(
          "mt-1.5 font-display text-2xl font-bold",
          tone === "brand" && "text-brand-600",
          tone === "teal" && "text-accent-teal",
          tone === "neutral" && "text-ink-900"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
