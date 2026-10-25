import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/current";
import { consolidatedReport, reportRows } from "@/server/reports";
import { errorMessage } from "@/server/errors";

export const dynamic = "force-dynamic";

const isYmd = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Relatório consolidado em CSV (separador ";" e BOM, para abrir direto no Excel em português). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const from = request.nextUrl.searchParams.get("de");
  const to = request.nextUrl.searchParams.get("ate");
  if (!isYmd(from) || !isYmd(to)) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  try {
    const report = await consolidatedReport(session.user.id, { from, to }, session.user.timezone);
    const csv = "﻿" + [["Seção", "Indicador", "Valor"], ...reportRows(report)].map((r) => r.map(cell).join(";")).join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorio-${from}-a-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
