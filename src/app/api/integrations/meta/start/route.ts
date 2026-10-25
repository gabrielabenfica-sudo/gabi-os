import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/server/auth/current";
import { randomToken } from "@/server/crypto";
import { metaAuthUrl, metaConfig } from "@/server/integrations/meta";

export const dynamic = "force-dynamic";

/** Inicia o OAuth da Meta. O `state` vai num cookie httpOnly para conferir no retorno (CSRF). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const base = process.env.APP_URL ?? request.nextUrl.origin;
  if (!session) return NextResponse.redirect(`${base}/login`);
  if (!metaConfig()) return NextResponse.redirect(`${base}/configuracoes/integracoes?erro=meta-nao-configurado`);
  const state = randomToken(24);
  (await cookies()).set("gabi_oauth_meta", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/meta", maxAge: 600 });
  return NextResponse.redirect(metaAuthUrl(state));
}
