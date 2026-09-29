import clsx from "clsx";

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-600",
  success: "bg-accent-teal/10 text-accent-teal",
  warning: "bg-accent-amber/10 text-accent-amber",
  danger: "bg-accent-rose/10 text-accent-rose",
  brand: "bg-brand-50 text-brand-700",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}
