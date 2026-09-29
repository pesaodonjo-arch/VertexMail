import { PoweredBy } from "@/components/ui/PoweredBy";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <div className="flex flex-1 flex-col">{children}</div>
      <PoweredBy />
    </div>
  );
}
