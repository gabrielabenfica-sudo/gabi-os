import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { listProjects } from "@/server/tasks";
import { todayYmd } from "@/lib/dates";
import { AgendaClient } from "./agenda-client";

export const metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = await listWorkspaces(user.id);
  const ids = new Set(await accessibleWorkspaceIds(user.id, "calendar"));
  const workspaces = all.filter((w) => ids.has(w.id));
  const filter = await getWorkspaceFilter(all);
  const taskWs = await accessibleWorkspaceIds(user.id, "tasks");
  const [tasks, projects] = await Promise.all([
    db.task.findMany({
      where: { workspaceId: { in: taskWs }, deletedAt: null, archivedAt: null, isTemplate: false, status: { isDone: false } },
      select: { id: true, title: true, workspaceId: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    listProjects(user.id),
  ]);

  return (
    <AgendaClient
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color }))}
      initialVisible={filter === "all" ? workspaces.map((w) => w.id) : [filter]}
      tz={user.timezone}
      today={todayYmd(user.timezone)}
      tasks={tasks}
      projects={projects.map((p) => ({ id: p.id, name: p.name, workspaceId: p.workspaceId }))}
      openEventId={sp.e ?? null}
      openNew={sp.novo === "1"}
    />
  );
}
