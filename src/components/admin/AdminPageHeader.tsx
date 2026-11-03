import { AdminMenuButton } from "./AdminNav";

export function AdminPageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="vx-safe-top sticky top-0 z-20 border-b border-ink-200 bg-white">
      <div className="flex items-start gap-3 px-4 py-3.5 md:gap-4 md:px-6 md:py-5">
        <AdminMenuButton />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold leading-7 text-ink-900 md:text-xl">{title}</h1>
          {description && <p className="mt-0.5 text-[13px] leading-snug text-ink-500 md:mt-1 md:text-sm">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
