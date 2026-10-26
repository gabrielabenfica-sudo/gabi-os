import { Sunrise } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { getRoutineDay, listProcesses, listSchedules } from "@/server/routines";
import { EmptyState } from "@/components/ui/empty-state";
import { RoutineClient } from "./routine-client";

export const metadata = { title: "Rotina" };

export default async function RoutinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.aba === "processos" ? "processos" : "dia";
  const showArchived = sp.arquivadas === "1";

  const all = await listWorkspaces(user.id);
  const ids = new Set(await accessibleWorkspaceIds(user.id, "routines"));
  const workspaces = all.filter((w) => ids.has(w.id));
  if (!workspaces.length) return <EmptyState icon={Sunrise} title="Sem acesso à rotina" description="Você não tem permissão para o módulo de rotina." />;
  const filter = await getWorkspaceFilter(all);
  const date = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : undefined;

  const [day, schedules, processes] = await Promise.all([
    tab === "dia" ? getRoutineDay(user.id, { workspaceId: filter, date }, user.timezone) : null,
    tab === "dia" ? listSchedules(user.id, { workspaceId: filter, includeInactive: showArchived }) : [],
    tab === "processos" ? listProcesses(user.id, { workspaceId: filter, includeInactive: showArchived }) : [],
  ]);

  return (
    <RoutineClient
      tab={tab}
      day={day}
      schedules={schedules.filter((r) => r.active !== showArchived)}
      processes={processes.filter((r) => r.active !== showArchived)}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
      showArchived={showArchived}
      openNew={sp.novo === "1"}
    />
  );
}
