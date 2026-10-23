import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function decodeJwtPayload(token: string): { role?: string; email?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("whoopit_auth_token")?.value;
  const isLoginPage = pathname === "/login";

  // 1. If user is unauthenticated and attempting to access any protected application route, redirect to /login
  if (!token && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If unauthenticated and on login page, proceed
  if (!token && isLoginPage) {
    return NextResponse.next();
  }

  // 2. Decode user identity from JWT
  const payload = token ? decodeJwtPayload(token) : null;
  const isAdmin =
    payload?.role === "admin" ||
    payload?.role === "superadmin" ||
    payload?.email === "admin@whoopit.io";

  // 3. If authenticated user visits /login, redirect directly to their respective portal
  if (token && isLoginPage) {
    const targetUrl = new URL(isAdmin ? "/admin" : "/", request.url);
    return NextResponse.redirect(targetUrl);
  }

  // 4. Role-based isolation:
  // If Admin visits root `/`, route them to their Master Admin Control Room `/admin`
  // (unless previewing a store via `?preview=true`)
  const isPreview = request.nextUrl.searchParams.get("preview") === "true";
  if (token && isAdmin && pathname === "/" && !isPreview) {
    const adminUrl = new URL("/admin", request.url);
    return NextResponse.redirect(adminUrl);
  }

  // 5. If non-admin (staff / shopkeeper) attempts to visit `/admin`, block and redirect to store software `/`
  if (token && !isAdmin && pathname.startsWith("/admin")) {
    const storeUrl = new URL("/", request.url);
    return NextResponse.redirect(storeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all application routes except:
     * - api routes
     * - _next static assets & images
     * - favicon and common static file extensions
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

