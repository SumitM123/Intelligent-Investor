import { NextResponse, type NextRequest } from "next/server";

// The single auth gate for the app, replacing the per-page cookie checks that let every
// investor route render (badly) while logged out. Runs server-side, so it can read the
// httpOnly cookies set by the sign-in server actions.
//
// Next 16 renamed this file convention from `middleware.ts` to `proxy.ts`; the handler must
// be exported as `proxy` (see next/dist/build/templates/middleware.js).

const SIGN_IN = "/pages/signIn";
const DEFAULT_LANDING = "/pages/typesOfInvestor/defensivePage";

// Reachable without a session. Everything else requires the userName cookie.
const PUBLIC_PATHS = new Set<string>(["/", SIGN_IN]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSignedIn = Boolean(request.cookies.get("userName")?.value);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isSignedIn && !isPublic) {
    return NextResponse.redirect(new URL(SIGN_IN, request.url));
  }

  // Signed in, so the landing page and the sign-in page have nothing left to offer.
  if (isSignedIn && isPublic) {
    return NextResponse.redirect(new URL(DEFAULT_LANDING, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and anything that looks like a static file, so the gate only ever
  // runs on real page navigations.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
