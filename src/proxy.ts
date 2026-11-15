import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/sign-in", "/api/cron", "/manifest.webmanifest", "/brand", "/_next", "/favicon.ico"];

/**
 * Lightweight gate: redirects unauthenticated page requests to sign-in when
 * there is no session cookie at all. Real authorization happens server-side in
 * every layout, action and route handler (the cookie is validated against the
 * sessions table there).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const hasCookie = request.cookies.has("pa_session");
  if (!hasCookie && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
