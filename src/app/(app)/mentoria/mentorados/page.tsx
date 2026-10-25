import { GraduationCap } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { findModuleWorkspace, requireWorkspaceAccess } from "@/server/workspaces";
import { listMentees } from "@/server/mentees";
import { listPrograms } from "@/server/finance/sales";
import { EmptyState } from "@/components/ui/misc";
import { todayYmd } from "@/lib/dates";
import { MenteesClient } from "./mentees-client";

export const metadata = { title: "Mentorados" };

export default async function MenteesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ws = await findModuleWorkspace(user.id, "MENTORIA", "mentees");
  if (!ws) return <EmptyState icon={GraduationCap} title="Sem acesso aos mentorados" description="Você não tem permissão para ver os mentorados." />;
  const canFinance = await requireWorkspaceAccess(user.id, ws.id, { module: "finance" }).then(() => true, () => false);
  const status = sp.status ?? "ACTIVE";
  const [mentees, programs] = await Promise.all([
    listMentees(user.id, ws.id, { status: status === "all" ? undefined : status, search: sp.q }, user.timezone),
    canFinance ? listPrograms(user.id, ws.id) : Promise.resolve([]),
  ]);
  return (
    <MenteesClient
      workspaceId={ws.id}
      mentees={mentees}
      status={status}
      programs={programs.map((p) => ({ id: p.id, name: p.name, durationWeeks: p.durationWeeks, priceCents: p.priceCents, active: p.active }))}
      today={todayYmd(user.timezone)}
      tz={user.timezone}
      openNew={sp.novo === "1"}
    />
  );
}
