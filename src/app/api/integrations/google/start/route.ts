import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/server/auth/current";
import { randomToken } from "@/server/crypto";
import { googleAuthUrl, googleConfig } from "@/server/integrations/google-calendar";

export const dynamic = "force-dynamic";

/** Inicia o OAuth do Google. O `state` vai num cookie httpOnly para conferir no retorno (CSRF). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const base = process.env.APP_URL ?? request.nextUrl.origin;
  if (!session) return NextResponse.redirect(`${base}/login`);
  if (!googleConfig()) return NextResponse.redirect(`${base}/configuracoes/integracoes?erro=google-nao-configurado`);
  const state = randomToken(24);
  (await cookies()).set("gabi_oauth_google", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/google", maxAge: 600 });
  return NextResponse.redirect(googleAuthUrl(state));
}
