import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);

/** Company Office IT pages that require company admin (not staff). */
const COMPANY_ADMIN_PREFIXES = [
  "/custody",
  "/stock-in",
  "/stock-out",
  "/adjustments",
  "/contacts",
  "/import",
  "/settings/custom-fields",
];

function isCompanyAdminPath(pathname: string) {
  return COMPANY_ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isPublic = PUBLIC_PATHS.has(pathname);
  const token = request.cookies.get("whoopit_auth_token")?.value;
  const role = request.cookies.get("whoopit_auth_role")?.value;

  if (!isPublic && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "Please sign in to continue.");
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/superadmin")) {
    if (role !== "admin") {
      const dest = role === "staff" ? "/my-assets" : "/dashboard";
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  // Legacy /companies was Admin bleed
  if (pathname.startsWith("/companies")) {
    if (role === "admin") {
      return NextResponse.redirect(new URL("/admin?tab=clients", request.url));
    }
    const dest = role === "staff" ? "/my-assets" : "/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Staff cannot open company-admin ops pages via URL
  if (role === "staff" && isCompanyAdminPath(pathname)) {
    return NextResponse.redirect(new URL("/my-assets", request.url));
  }

  if (isPublic && token) {
    const next = request.nextUrl.searchParams.get("next");
    if (
      next &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      !next.startsWith("/login") &&
      !(role === "staff" && isCompanyAdminPath(next))
    ) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    const dest =
      role === "admin" ? "/admin" : role === "staff" ? "/my-assets" : "/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
