import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { listAssignees, listLabels, listProjects, listTasks, type TaskFilters } from "@/server/tasks";
import { todayYmd } from "@/lib/dates";
import { TasksClient, type TasksView } from "./tasks-client";

export const metadata = { title: "Tarefas" };

const VIEWS: TasksView[] = ["kanban", "lista", "calendario", "linha", "responsavel", "projeto"];

type SP = Record<string, string | undefined>;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const allWorkspaces = await listWorkspaces(user.id);
  const taskWsIds = new Set(await accessibleWorkspaceIds(user.id, "tasks"));
  const workspaces = allWorkspaces.filter((w) => taskWsIds.has(w.id));
  const filter = await getWorkspaceFilter(allWorkspaces);
  const view: TasksView = VIEWS.includes(sp.view as TasksView) ? (sp.view as TasksView) : "kanban";

  // O Kanban mostra um ambiente por vez (cada ambiente tem suas colunas)
  const boardWs =
    (sp.ws && workspaces.some((w) => w.id === sp.ws) && sp.ws) ||
    (filter !== "all" ? filter : undefined) ||
    workspaces[0]?.id;
  const scope = view === "kanban" ? boardWs ?? "all" : filter;

  const filters: TaskFilters = {
    workspaceId: scope,
    search: sp.q,
    projectId: sp.projeto,
    labelId: sp.etiqueta,
    assignee: sp.resp,
    priority: (["LOW", "MEDIUM", "HIGH", "URGENT"] as const).find((p) => p === sp.prioridade),
    overdue: sp.atrasadas === "1",
    includeDone: view === "kanban" ? true : sp.concluidas === "1",
    includeArchived: sp.arquivadas === "1",
    templates: sp.modelos === "1",
    topLevelOnly: view === "kanban",
  };

  const [tasks, statuses, projects, labels, assignees] = await Promise.all([
    listTasks(user.id, filters, user.timezone),
    db.taskStatus.findMany({ where: { workspaceId: { in: [...taskWsIds] } }, orderBy: { position: "asc" } }),
    listProjects(user.id),
    listLabels(user.id),
    listAssignees(user.id),
  ]);

  return (
    <TasksClient
      view={view}
      boardWorkspaceId={boardWs ?? null}
      globalFilter={filter}
      tasks={tasks}
      meta={{
        workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color })),
        statuses,
        projects: projects.map((p) => ({ id: p.id, workspaceId: p.workspaceId, name: p.name, color: p.color })),
        labels: labels.map((l) => ({ id: l.id, workspaceId: l.workspaceId, name: l.name, color: l.color })),
        assignees,
        today: todayYmd(user.timezone),
        tz: user.timezone,
      }}
      openTaskId={sp.t ?? null}
      openNew={sp.nova === "1"}
    />
  );
}
