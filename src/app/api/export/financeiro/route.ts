import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/current";
import { listTransactions, transactionsToCsv } from "@/server/finance/transactions";
import { errorMessage } from "@/server/errors";
import { audit } from "@/server/audit";
import { isValidYm } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Exporta os lançamentos de um mês em CSV (Excel em português). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const ws = request.nextUrl.searchParams.get("ws") ?? "";
  const month = request.nextUrl.searchParams.get("mes") ?? "";
  if (!ws || !isValidYm(month)) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  try {
    const rows = await listTransactions(session.user.id, ws, { month }, session.user.timezone);
    await audit({ userId: session.user.id, workspaceId: ws, entity: "FinancialTransaction", entityId: month, action: "export_csv" });
    return new NextResponse(transactionsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lancamentos-${month}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 403 });
  }
}
