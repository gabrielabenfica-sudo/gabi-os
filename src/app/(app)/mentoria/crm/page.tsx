import { Target } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { findModuleWorkspace, requireWorkspaceAccess } from "@/server/workspaces";
import { crmMetrics, listLeads, listSources, listStages } from "@/server/crm";
import { listAccounts } from "@/server/finance/accounts";
import { listPrograms } from "@/server/finance/sales";
import { EmptyState } from "@/components/ui/empty-state";
import { startOfMonthYmd, todayYmd } from "@/lib/dates";
import { CrmClient } from "./crm-client";

export const metadata = { title: "CRM" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ws = await findModuleWorkspace(user.id, "MENTORIA", "crm");
  if (!ws) return <EmptyState icon={Target} title="Sem acesso ao CRM" description="Você não tem permissão para o CRM da Mentoria." />;

  const tz = user.timezone;
  const today = todayYmd(tz);
  const from = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : startOfMonthYmd(today);
  const to = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : today;

  // Produtos e contas vêm do financeiro; sem essa permissão, a conversão em venda fica indisponível
  const canFinance = await requireWorkspaceAccess(user.id, ws.id, { module: "finance", write: true }).then(() => true, () => false);
  const [stages, leads, metrics, sources, programs, accounts] = await Promise.all([
    listStages(user.id, ws.id),
    listLeads(user.id, ws.id, { search: sp.q, source: sp.origem, includeClosed: sp.fechados === "1" }),
    crmMetrics(user.id, ws.id, { from, to }, tz),
    listSources(user.id, ws.id),
    canFinance ? listPrograms(user.id, ws.id) : Promise.resolve([]),
    canFinance ? listAccounts(user.id, ws.id) : Promise.resolve([]),
  ]);

  return (
    <CrmClient
      workspaceId={ws.id}
      stages={stages.map((s) => ({ id: s.id, name: s.name, isWon: s.isWon, isLost: s.isLost }))}
      leads={leads}
      metrics={metrics}
      range={{ from, to }}
      sources={sources}
      programs={programs.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, durationWeeks: p.durationWeeks, active: p.active }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      canFinance={canFinance}
      today={today}
      openLeadId={sp.lead ?? null}
      openNew={sp.novo === "1"}
    />
  );
}
