import { db } from "@/server/db";
import { accessibleWorkspaceIds } from "@/server/workspaces";

export type SearchResult = { type: "task" | "event" | "note" | "habit" | "project"; id: string; title: string; subtitle?: string; href: string };

/** Busca universal nos módulos acessíveis. */
export async function searchAll(userId: string, query: string, tz: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const [taskWs, calWs, noteWs, habitWs] = await Promise.all([
    accessibleWorkspaceIds(userId, "tasks"),
    accessibleWorkspaceIds(userId, "calendar"),
    accessibleWorkspaceIds(userId, "notes"),
    accessibleWorkspaceIds(userId, "habits"),
  ]);
  const ws = { select: { name: true } };
  const [tasks, events, notes, habits, projects] = await Promise.all([
    db.task.findMany({
      where: { workspaceId: { in: taskWs }, deletedAt: null, OR: [{ title: contains }, { description: contains }] },
      select: { id: true, title: true, workspace: ws, status: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.calendarEvent.findMany({
      where: { workspaceId: { in: calWs }, deletedAt: null, OR: [{ title: contains }, { location: contains }, { description: contains }] },
      select: { id: true, title: true, start: true, allDay: true, workspace: ws },
      orderBy: { start: "desc" },
      take: 6,
    }),
    db.note.findMany({
      where: { workspaceId: { in: noteWs }, deletedAt: null, OR: [{ title: contains }, { plainText: contains }] },
      select: { id: true, title: true, workspace: ws },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.habit.findMany({ where: { workspaceId: { in: habitWs }, name: contains }, select: { id: true, name: true, workspace: ws }, take: 4 }),
    db.project.findMany({ where: { workspaceId: { in: taskWs }, name: contains }, select: { id: true, name: true, workspace: ws }, take: 4 }),
  ]);
  const date = (d: Date, allDay: boolean) =>
    allDay ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : d.toLocaleString("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" });
  return [
    ...tasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, subtitle: `${t.status.name} · ${t.workspace.name}`, href: `/tarefas?view=lista&t=${t.id}` })),
    ...events.map((e) => ({ type: "event" as const, id: e.id, title: e.title, subtitle: `${date(e.start, e.allDay)} · ${e.workspace.name}`, href: `/agenda?v=timeline&e=${e.id}` })),
    ...notes.map((n) => ({ type: "note" as const, id: n.id, title: n.title, subtitle: n.workspace.name, href: `/anotacoes?n=${n.id}` })),
    ...habits.map((h) => ({ type: "habit" as const, id: h.id, title: h.name, subtitle: h.workspace.name, href: "/habitos" })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, title: p.name, subtitle: p.workspace.name, href: `/tarefas?view=lista&projeto=${p.id}` })),
  ];
}
