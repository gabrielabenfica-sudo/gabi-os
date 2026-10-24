import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/current";
import { searchAll } from "@/server/search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchAll(session.user.id, q.slice(0, 100), session.user.timezone);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
