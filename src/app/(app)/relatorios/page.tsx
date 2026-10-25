import { requireUser } from "@/server/auth/current";
import { consolidatedReport } from "@/server/reports";
import { errorMessage } from "@/server/errors";
import { EmptyState } from "@/components/ui/misc";
import { addMonthsYmd, endOfMonthYmd, startOfMonthYmd, todayYmd } from "@/lib/dates";
import { ReportsClient, type Preset } from "./reports-client";

export const metadata = { title: "Relatórios" };

const isYmd = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const month = startOfMonthYmd(today);
  switch (preset) {
    case "mes-anterior": {
      const s = addMonthsYmd(month, -1);
      return { from: s, to: endOfMonthYmd(s) };
    }
    case "trimestre": {
      const m = Number(today.slice(5, 7));
      const q = `${today.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
      return { from: q, to: today };
    }
    case "ano":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: month, to: today };
  }
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayYmd(user.timezone);
  const custom = isYmd(sp.de) && isYmd(sp.ate);
  const preset: Preset = custom ? "personalizado" : (["mes", "mes-anterior", "trimestre", "ano"] as const).find((p) => p === sp.periodo) ?? "mes";
  const range = custom ? { from: sp.de!, to: sp.ate! } : presetRange(preset, today);
  try {
    const report = await consolidatedReport(user.id, range, user.timezone);
    return <ReportsClient report={report} preset={preset} />;
  } catch (e) {
    return <EmptyState title="Não foi possível gerar o relatório" description={errorMessage(e)} />;
  }
}
