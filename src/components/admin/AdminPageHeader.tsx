export function AdminPageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-ink-200 bg-white px-6 py-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}
