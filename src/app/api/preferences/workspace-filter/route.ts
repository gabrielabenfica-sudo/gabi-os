import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/current";
import { listWorkspaces, WORKSPACE_FILTER_COOKIE } from "@/server/workspaces";

export const dynamic = "force-dynamic";

/** Define o filtro de ambiente ativo (cookie). Aceita apenas requisições da própria origem. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
  const value = typeof body?.value === "string" ? body.value : "all";
  const workspaces = await listWorkspaces(session.user.id);
  if (value !== "all" && !workspaces.some((w) => w.id === value)) {
    return NextResponse.json({ error: "Ambiente inválido" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, value });
  response.cookies.set(WORKSPACE_FILTER_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
