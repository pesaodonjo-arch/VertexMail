import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh on every request, and gates
// /inbox, /sent, /drafts, /trash, /archive, /spam, /search, /compose and /admin
// behind a signed-in session. Fine-grained access (which mailbox, which
// domain) is still enforced by RLS and by each route/page's own checks —
// this middleware only answers "is anyone signed in".
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const protectedPrefixes = [
    "/inbox", "/sent", "/drafts", "/trash", "/archive", "/spam", "/search", "/compose", "/thread", "/admin",
  ];
  const isProtected = protectedPrefixes.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/inbox/:path*", "/sent/:path*", "/drafts/:path*", "/trash/:path*",
    "/archive/:path*", "/spam/:path*", "/search/:path*", "/compose/:path*", "/thread/:path*",
    "/admin/:path*",
  ],
};
