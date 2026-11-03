import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-6 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-xl font-bold text-ink-900">Page not found</h1>
        <p className="mt-2 text-sm text-ink-500">The page you’re looking for doesn’t exist or was moved.</p>
        <Link
          href="/inbox"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:brightness-90"
        >
          Go to inbox
        </Link>
      </div>
    </div>
  );
}
