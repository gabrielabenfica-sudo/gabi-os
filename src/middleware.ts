import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "gabi_session";
const PUBLIC_PATHS = ["/login", "/cadastro", "/api/health", "/api/cron"];

/**
 * Proteção de rotas na borda: sem cookie de sessão → /login.
 * A validação real da sessão acontece no servidor (getSession), em cada página e ação.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|.*\\.(?:png|svg|ico|webp)$).*)"],
};
