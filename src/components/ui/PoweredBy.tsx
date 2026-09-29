import clsx from "clsx";

export function PoweredBy({ className }: { className?: string }) {
  return (
    <footer className={clsx("vx-safe-bottom shrink-0 py-2 text-center text-[11px] text-ink-400", className)}>
      Powered By Vertex Tech Solutions
    </footer>
  );
}
