import type { TaskCard } from "@/server/tasks";

export type { TaskCard };

export type WsOption = { id: string; name: string; color: string };
export type StatusOption = { id: string; workspaceId: string; name: string; category: string; isDone: boolean; position: number };
export type ProjectOption = { id: string; workspaceId: string; name: string; color: string | null };
export type LabelOption = { id: string; workspaceId: string; name: string; color: string };

export type TaskMeta = {
  workspaces: WsOption[];
  statuses: StatusOption[];
  projects: ProjectOption[];
  labels: LabelOption[];
  assignees: string[];
  today: string;
  tz: string;
};

export const STATUS_CATEGORY_LABEL: Record<string, string> = {
  BACKLOG: "Ideias / Backlog",
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando",
  REVIEW: "Em revisão",
  DONE: "Concluído",
};

export function dueInfo(due: Date | string | null, today: string, done: boolean) {
  if (!due) return null;
  const ymd = (typeof due === "string" ? due : due.toISOString()).slice(0, 10);
  const label = `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
  if (done) return { label, tone: "muted" as const };
  if (ymd < today) return { label, tone: "overdue" as const };
  if (ymd === today) return { label: "Hoje", tone: "today" as const };
  return { label, tone: "muted" as const };
}
