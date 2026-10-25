import { Target } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { listGoals } from "@/server/goals";
import { listAreas } from "@/server/maas";
import { EmptyState } from "@/components/ui/empty-state";
import { todayYmd } from "@/lib/dates";
import { GoalsClient } from "../metas/goals-client";

export const metadata = { title: "Objetivos" };

/** Objetivos pessoais: mesmas regras das metas, marcados como objetivo e ligados às áreas do MAAS. */
export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = await listWorkspaces(user.id);
  const ids = new Set(await accessibleWorkspaceIds(user.id, "goals"));
  const workspaces = all.filter((w) => ids.has(w.id));
  if (!workspaces.length) return <EmptyState icon={Target} title="Sem acesso aos objetivos" />;
  const status = sp.status ?? "ACTIVE";
  const [goals, areas] = await Promise.all([listGoals(user.id, { status, type: sp.tipo, objectives: true }, user.timezone), listAreas(user.id)]);
  return (
    <GoalsClient
      mode="objectives"
      categories={areas.map((a) => a.name)}
      goals={goals}
      status={status}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
      defaultWorkspaceId={workspaces.find((w) => w.kind === "PESSOAL")?.id ?? workspaces[0]!.id}
      today={todayYmd(user.timezone)}
      openId={sp.meta ?? null}
      openNew={sp.nova === "1"}
    />
  );
}
