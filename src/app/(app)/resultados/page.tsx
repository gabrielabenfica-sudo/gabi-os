import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { Button } from "@/components/ui/button";
import { findFinanceWorkspace } from "@/server/finance/common";
import { compensationYear } from "@/server/finance/compensation";
import { listAccounts } from "@/server/finance/accounts";
import { mentoriaMonthly, netWorthSeries, personalMonthly } from "@/server/finance/summary";
import { receivablesOverview } from "@/server/finance/sales";
import { todayYmd } from "@/lib/dates";
import { ResultsClient } from "./results-client";

export const metadata = { title: "Empresa e Resultados" };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayYmd(user.timezone);
  const year = sp.ano && /^\d{4}$/.test(sp.ano) ? Number(sp.ano) : Number(today.slice(0, 4));
  const from = `${year}-01`;
  const to = `${year}-12`;
  const focusMonth = String(year) === today.slice(0, 4) ? today.slice(0, 7) : `${year}-12`;

  const [turbo, pessoal, mentoria] = await Promise.all([
    findFinanceWorkspace(user.id, "TURBO"),
    findFinanceWorkspace(user.id, "PESSOAL"),
    findFinanceWorkspace(user.id, "MENTORIA"),
  ]);

  const [comp, pSeries, mSeries, pAccounts, mAccounts, rec, netWorth] = await Promise.all([
    turbo ? compensationYear(user.id, turbo.id, year) : Promise.resolve(null),
    pessoal ? personalMonthly(user.id, pessoal, from, to) : Promise.resolve(null),
    mentoria ? mentoriaMonthly(mentoria.id, from, to) : Promise.resolve(null),
    pessoal ? listAccounts(user.id, pessoal.id) : Promise.resolve([]),
    mentoria ? listAccounts(user.id, mentoria.id) : Promise.resolve([]),
    mentoria ? receivablesOverview([mentoria.id], today) : Promise.resolve(null),
    netWorthSeries([pessoal?.id, mentoria?.id].filter(Boolean) as string[], Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`), today),
  ]);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresa e Resultados</h1>
          <p className="text-sm text-muted-foreground">Cada ambiente com seus próprios números, sem somar faturamento da Mentoria à renda pessoal.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild><Link href={`?ano=${year - 1}`} aria-label="Ano anterior"><ChevronLeft /></Link></Button>
          <span className="w-14 text-center font-medium tabular">{year}</span>
          <Button variant="outline" size="icon" asChild><Link href={`?ano=${year + 1}`} aria-label="Próximo ano"><ChevronRight /></Link></Button>
        </div>
      </header>
      <ResultsClient
        year={year}
        focusMonth={focusMonth}
        turbo={turbo && comp ? { name: turbo.name, color: turbo.color, monthly: comp.monthly, totals: comp.totals } : null}
        pessoal={pessoal && pSeries ? { name: pessoal.name, color: pessoal.color, series: pSeries, balanceCents: pAccounts.reduce((s, a) => s + a.balanceCents, 0), reservesCents: pAccounts.filter((a) => a.isReserve).reduce((s, a) => s + a.balanceCents, 0) } : null}
        mentoria={mentoria && mSeries ? { name: mentoria.name, color: mentoria.color, series: mSeries, balanceCents: mAccounts.reduce((s, a) => s + a.balanceCents, 0), pendingCents: rec?.pendingCents ?? 0, overdueCents: rec?.overdueCents ?? 0 } : null}
        netWorth={netWorth}
      />
    </div>
  );
}
