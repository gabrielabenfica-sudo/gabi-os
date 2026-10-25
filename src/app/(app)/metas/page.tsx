import { Target } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { listGoals } from "@/server/goals";
import { EmptyState } from "@/components/ui/empty-state";
import { todayYmd } from "@/lib/dates";
import { GoalsClient } from "./goals-client";

export const metadata = { title: "Metas" };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = await listWorkspaces(user.id);
  const ids = new Set(await accessibleWorkspaceIds(user.id, "goals"));
  const workspaces = all.filter((w) => ids.has(w.id));
  if (!workspaces.length) return <EmptyState icon={Target} title="Sem acesso às metas" />;
  const filter = await getWorkspaceFilter(all);
  const status = sp.status ?? "ACTIVE";
  const goals = await listGoals(user.id, { workspace: filter, status, type: sp.tipo }, user.timezone);
  return (
    <GoalsClient
      goals={goals}
      status={status}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
      defaultWorkspaceId={filter !== "all" && ids.has(filter) ? filter : workspaces[0]!.id}
      today={todayYmd(user.timezone)}
      openId={sp.meta ?? null}
      openNew={sp.nova === "1"}
    />
  );
}
