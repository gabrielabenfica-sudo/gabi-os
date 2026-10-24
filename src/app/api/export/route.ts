import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/current";
import { exportUserData } from "@/server/export";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const data = await exportUserData(session.user.id);
  await audit({ userId: session.user.id, entity: "User", entityId: session.user.id, action: "export" });
  const date = new Date().toISOString().slice(0, 10);
  // Decimal e BigInt serializam como string
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gabi-os-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
