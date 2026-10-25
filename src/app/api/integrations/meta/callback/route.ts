import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/server/auth/current";
import { completeMetaAuth } from "@/server/integrations/meta";
import { errorMessage } from "@/server/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = process.env.APP_URL ?? request.nextUrl.origin;
  const back = (q: string) => NextResponse.redirect(`${base}/configuracoes/integracoes?${q}`);
  const session = await getSession();
  if (!session) return NextResponse.redirect(`${base}/login`);
  const store = await cookies();
  const expected = store.get("gabi_oauth_meta")?.value;
  store.delete({ name: "gabi_oauth_meta", path: "/api/integrations/meta" });
  const { searchParams } = request.nextUrl;
  if (searchParams.get("error")) return back(`erro=${encodeURIComponent(searchParams.get("error_description") ?? searchParams.get("error")!)}`);
  const state = searchParams.get("state");
  const code = searchParams.get("code");
  if (!expected || !state || state !== expected || !code) return back("erro=estado-invalido");
  try {
    await completeMetaAuth(session.user.id, code);
    return back("ok=meta");
  } catch (e) {
    return back(`erro=${encodeURIComponent(errorMessage(e))}`);
  }
}
