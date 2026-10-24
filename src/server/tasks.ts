import type { Prisma, Priority, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";
import { addDaysYmd, dateToYmd, todayYmd, ymdToDate, zonedToUtc } from "@/lib/dates";
import { isValidRRule, nextOccurrence } from "@/lib/recurrence";

// ═══════════════════════════════════════════════════════════════
// Validação
// ═══════════════════════════════════════════════════════════════

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const optionalYmd = ymd.nullable().optional();
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const linkSchema = z.object({ title: z.string().trim().max(200).default(""), url: z.string().trim().url("Link inválido.").max(2000) });
const rruleSchema = z.string().max(500).refine(isValidRRule, "Recorrência inválida.");

export const taskCreateSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1, "Informe o título.").max(300),
  description: z.string().max(20000).nullable().optional(),
  statusId: z.string().optional(),
  projectId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  assignee: z.string().trim().max(100).nullable().optional(),
  priority: priority.optional(),
  startDate: optionalYmd,
  dueDate: optionalYmd,
  rrule: rruleSchema.nullable().optional(),
  estimateMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  links: z.array(linkSchema).max(50).optional(),
  labelIds: z.array(z.string()).max(30).optional(),
  checklist: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  isTemplate: z.boolean().optional(),
});
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema
  .omit({ workspaceId: true, checklist: true, parentId: true, isTemplate: true })
  .partial();
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

// ═══════════════════════════════════════════════════════════════
// Regras de status e prazo
// ═══════════════════════════════════════════════════════════════

/** Ajusta datas de início/conclusão conforme a mudança de coluna. */
export function statusTimestamps(
  from: Pick<TaskStatus, "category" | "isDone"> | null,
  to: Pick<TaskStatus, "category" | "isDone">,
  current: { startedAt: Date | null; completedAt: Date | null },
  now = new Date(),
): { startedAt?: Date | null; completedAt?: Date | null } {
  const patch: { startedAt?: Date | null; completedAt?: Date | null } = {};
  if (to.category === "IN_PROGRESS" && !current.startedAt) patch.startedAt = now;
  if (to.isDone && !(from?.isDone ?? false)) patch.completedAt = now;
  if (!to.isDone && (from?.isDone ?? false)) patch.completedAt = null;
  if (to.isDone && !current.completedAt && patch.completedAt === undefined) patch.completedAt = now;
  return patch;
}

/** Atrasada: tem prazo anterior a hoje e não está concluída, arquivada ou excluída. */
export function isOverdue(
  task: { dueDate: Date | null; status: { isDone: boolean }; archivedAt?: Date | null; deletedAt?: Date | null },
  today: string,
): boolean {
  if (!task.dueDate || task.status.isDone || task.archivedAt || task.deletedAt) return false;
  return dateToYmd(task.dueDate) < today;
}

const POSITION_GAP = 1024;

// ═══════════════════════════════════════════════════════════════
// Leitura
// ═══════════════════════════════════════════════════════════════

export const taskCardInclude = {
  status: { select: { id: true, name: true, category: true, isDone: true } },
  project: { select: { id: true, name: true, color: true } },
  workspace: { select: { id: true, name: true, color: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
  checklist: { select: { done: true } },
  _count: { select: { subtasks: { where: { deletedAt: null } }, comments: true } },
} satisfies Prisma.TaskInclude;

export type TaskCard = Prisma.TaskGetPayload<{ include: typeof taskCardInclude }>;

export type TaskFilters = {
  workspaceId?: string | "all";
  search?: string;
  projectId?: string;
  labelId?: string;
  assignee?: string;
  priority?: Priority;
  statusCategory?: string;
  overdue?: boolean;
  includeDone?: boolean;
  includeArchived?: boolean;
  dueFrom?: string;
  dueTo?: string;
  topLevelOnly?: boolean;
  templates?: boolean;
};

export async function listTasks(userId: string, filters: TaskFilters = {}, tz = "America/Sao_Paulo"): Promise<TaskCard[]> {
  const workspaceIds = await accessibleWorkspaceIds(userId, "tasks", filters.workspaceId ?? "all");
  const today = todayYmd(tz);
  const where: Prisma.TaskWhereInput = {
    workspaceId: { in: workspaceIds },
    deletedAt: null,
    isTemplate: filters.templates ?? false,
  };
  if (!filters.includeArchived) where.archivedAt = null;
  if (filters.topLevelOnly) where.parentId = null;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.assignee) where.assignee = filters.assignee;
  if (filters.priority) where.priority = filters.priority;
  if (filters.labelId) where.labels = { some: { labelId: filters.labelId } };
  const statusWhere: Prisma.TaskStatusWhereInput = {};
  if (filters.statusCategory) statusWhere.category = filters.statusCategory;
  if (filters.includeDone === false) statusWhere.isDone = false;
  if (filters.overdue) {
    statusWhere.isDone = false;
    where.dueDate = { lt: ymdToDate(today) };
  }
  if (Object.keys(statusWhere).length) where.status = statusWhere;
  if (filters.dueFrom || filters.dueTo) {
    where.dueDate = {
      ...(typeof where.dueDate === "object" ? where.dueDate : {}),
      ...(filters.dueFrom ? { gte: ymdToDate(filters.dueFrom) } : {}),
      ...(filters.dueTo ? { lte: ymdToDate(filters.dueTo) } : {}),
    };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  return db.task.findMany({
    where,
    include: taskCardInclude,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: 2000,
  });
}

export async function getBoard(userId: string, workspaceId: string, filters: Omit<TaskFilters, "workspaceId"> = {}, tz?: string) {
  await requireWorkspaceAccess(userId, workspaceId, { module: "tasks" });
  const [statuses, tasks] = await Promise.all([
    db.taskStatus.findMany({ where: { workspaceId }, orderBy: { position: "asc" } }),
    listTasks(userId, { ...filters, workspaceId, topLevelOnly: true, includeDone: true }, tz),
  ]);
  return { statuses, tasks };
}

export const taskDetailInclude = {
  ...taskCardInclude,
  checklist: { orderBy: { position: "asc" } },
  comments: { orderBy: { createdAt: "asc" } },
  subtasks: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { status: { select: { id: true, name: true, isDone: true, category: true } } },
  },
  timeEntries: { orderBy: { date: "desc" } },
  history: { orderBy: { createdAt: "desc" }, take: 100 },
  parent: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;

export type TaskDetail = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;

export async function getTask(userId: string, taskId: string): Promise<TaskDetail> {
  const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null }, include: taskDetailInclude });
  if (!task) throw new NotFoundError("Tarefa");
  await requireWorkspaceAccess(userId, task.workspaceId, { module: "tasks" });
  return task;
}

/** Carrega a tarefa garantindo permissão de escrita. */
async function loadForWrite(userId: string, taskId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null }, include: { status: true } });
  if (!task) throw new NotFoundError("Tarefa");
  await requireWorkspaceAccess(userId, task.workspaceId, { module: "tasks", write: true });
  return task;
}

// ═══════════════════════════════════════════════════════════════
// Escrita
// ═══════════════════════════════════════════════════════════════

async function assertBelongs(workspaceId: string, refs: { statusId?: string | null; projectId?: string | null; parentId?: string | null; labelIds?: string[] }) {
  if (refs.statusId) {
    const s = await db.taskStatus.findFirst({ where: { id: refs.statusId, workspaceId } });
    if (!s) throw new AppError("Coluna inválida para este ambiente.");
  }
  if (refs.projectId) {
    const p = await db.project.findFirst({ where: { id: refs.projectId, workspaceId } });
    if (!p) throw new AppError("Projeto inválido para este ambiente.");
  }
  if (refs.parentId) {
    const t = await db.task.findFirst({ where: { id: refs.parentId, workspaceId, deletedAt: null } });
    if (!t) throw new AppError("Tarefa principal inválida.");
  }
  if (refs.labelIds?.length) {
    const count = await db.label.count({ where: { id: { in: refs.labelIds }, workspaceId } });
    if (count !== new Set(refs.labelIds).size) throw new AppError("Etiqueta inválida para este ambiente.");
  }
}

async function defaultStatus(workspaceId: string) {
  const statuses = await db.taskStatus.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  const status = statuses.find((s) => s.category === "TODO") ?? statuses.find((s) => !s.isDone) ?? statuses[0];
  if (!status) throw new AppError("Este ambiente não tem colunas de tarefas.");
  return status;
}

async function endPosition(statusId: string): Promise<number> {
  const last = await db.task.findFirst({ where: { statusId }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? 0) + POSITION_GAP;
}

export async function createTask(userId: string, input: TaskCreateInput) {
  const data = taskCreateSchema.parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "tasks", write: true });
  await assertBelongs(data.workspaceId, data);
  const status = data.statusId
    ? await db.taskStatus.findUniqueOrThrow({ where: { id: data.statusId } })
    : await defaultStatus(data.workspaceId);
  if (data.startDate && data.dueDate && data.startDate > data.dueDate) {
    throw new AppError("O início não pode ser depois do prazo.");
  }
  const now = new Date();
  return db.task.create({
    data: {
      workspaceId: data.workspaceId,
      statusId: status.id,
      title: data.title,
      description: data.description ?? null,
      projectId: data.projectId ?? null,
      parentId: data.parentId ?? null,
      assignee: data.assignee || null,
      priority: data.priority ?? "MEDIUM",
      startDate: data.startDate ? ymdToDate(data.startDate) : null,
      dueDate: data.dueDate ? ymdToDate(data.dueDate) : null,
      rrule: data.rrule ?? null,
      estimateMinutes: data.estimateMinutes ?? null,
      links: data.links ?? undefined,
      isTemplate: data.isTemplate ?? false,
      position: await endPosition(status.id),
      startedAt: status.category === "IN_PROGRESS" ? now : null,
      completedAt: status.isDone ? now : null,
      labels: data.labelIds?.length ? { create: [...new Set(data.labelIds)].map((labelId) => ({ labelId })) } : undefined,
      checklist: data.checklist?.length ? { create: data.checklist.map((text, position) => ({ text, position })) } : undefined,
      history: { create: { field: "created", toValue: status.name } },
    },
    include: taskCardInclude,
  });
}

const HISTORY_FIELDS = ["title", "priority", "assignee", "dueDate", "startDate", "projectId"] as const;

function historyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateToYmd(value);
  return String(value);
}

export async function updateTask(userId: string, taskId: string, input: TaskUpdateInput, tz?: string) {
  const data = taskUpdateSchema.parse(input);
  const task = await loadForWrite(userId, taskId);
  await assertBelongs(task.workspaceId, { statusId: data.statusId, projectId: data.projectId, labelIds: data.labelIds });

  const patch: Prisma.TaskUncheckedUpdateInput = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.projectId !== undefined) patch.projectId = data.projectId;
  if (data.assignee !== undefined) patch.assignee = data.assignee || null;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.startDate !== undefined) patch.startDate = data.startDate ? ymdToDate(data.startDate) : null;
  if (data.dueDate !== undefined) patch.dueDate = data.dueDate ? ymdToDate(data.dueDate) : null;
  if (data.rrule !== undefined) patch.rrule = data.rrule;
  if (data.estimateMinutes !== undefined) patch.estimateMinutes = data.estimateMinutes;
  if (data.links !== undefined) patch.links = data.links;

  const start = patch.startDate !== undefined ? (patch.startDate as Date | null) : task.startDate;
  const due = patch.dueDate !== undefined ? (patch.dueDate as Date | null) : task.dueDate;
  if (start && due && start > due) throw new AppError("O início não pode ser depois do prazo.");

  const history: Prisma.TaskHistoryCreateManyTaskInput[] = [];
  for (const field of HISTORY_FIELDS) {
    if (!(field in patch)) continue;
    const before = historyValue(task[field]);
    const after = historyValue(patch[field]);
    if (before !== after) history.push({ field, fromValue: before, toValue: after });
  }

  return db.$transaction(async (tx) => {
    if (data.labelIds !== undefined) {
      await tx.taskLabel.deleteMany({ where: { taskId } });
      if (data.labelIds.length) {
        await tx.taskLabel.createMany({ data: [...new Set(data.labelIds)].map((labelId) => ({ taskId, labelId })) });
      }
    }
    if (history.length) await tx.taskHistory.createMany({ data: history.map((h) => ({ ...h, taskId })) });
    await tx.task.update({ where: { id: taskId }, data: patch });
    if (data.statusId && data.statusId !== task.statusId) {
      await changeStatusTx(tx, task, data.statusId, undefined, tz);
    }
    return tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskCardInclude });
  });
}

type TaskWithStatus = Prisma.TaskGetPayload<{ include: { status: true } }>;

/** Muda a coluna, aplica datas de início/conclusão, histórico e recorrência. */
async function changeStatusTx(
  tx: Prisma.TransactionClient,
  task: TaskWithStatus,
  toStatusId: string,
  position?: number,
  tz = "America/Sao_Paulo",
) {
  const to = await tx.taskStatus.findFirst({ where: { id: toStatusId, workspaceId: task.workspaceId } });
  if (!to) throw new AppError("Coluna inválida para este ambiente.");
  const stamps = statusTimestamps(task.status, to, task);
  await tx.task.update({
    where: { id: task.id },
    data: { statusId: to.id, ...stamps, ...(position !== undefined ? { position } : {}) },
  });
  if (to.id !== task.statusId) {
    await tx.taskHistory.create({ data: { taskId: task.id, field: "status", fromValue: task.status.name, toValue: to.name } });
  }
  if (to.isDone && !task.status.isDone && task.rrule && task.dueDate) {
    await spawnNextRecurrence(tx, task, tz);
  }
}

/** Cria a próxima ocorrência de uma tarefa recorrente (sem duplicar). */
async function spawnNextRecurrence(tx: Prisma.TransactionClient, task: TaskWithStatus, tz: string) {
  const rootId = task.recurrenceParentId ?? task.id;
  const next = nextOccurrence(task.rrule!, task.dueDate!, task.dueDate!, "UTC");
  if (!next) return null;
  const nextDue = ymdToDate(dateToYmd(next));
  const existing = await tx.task.findFirst({
    where: { OR: [{ id: rootId }, { recurrenceParentId: rootId }], dueDate: nextDue, deletedAt: null },
  });
  if (existing) return existing;

  const status = await tx.taskStatus.findMany({ where: { workspaceId: task.workspaceId }, orderBy: { position: "asc" } });
  const todo = status.find((s) => s.category === "TODO") ?? status.find((s) => !s.isDone)!;
  const shift = task.startDate ? task.dueDate!.getTime() - task.startDate.getTime() : null;
  const [checklist, labels] = await Promise.all([
    tx.taskChecklistItem.findMany({ where: { taskId: task.id }, orderBy: { position: "asc" } }),
    tx.taskLabel.findMany({ where: { taskId: task.id } }),
  ]);
  const last = await tx.task.findFirst({ where: { statusId: todo.id }, orderBy: { position: "desc" } });
  void tz;
  return tx.task.create({
    data: {
      workspaceId: task.workspaceId,
      statusId: todo.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      priority: task.priority,
      dueDate: nextDue,
      startDate: shift !== null ? new Date(nextDue.getTime() - shift) : null,
      rrule: task.rrule,
      recurrenceParentId: rootId,
      estimateMinutes: task.estimateMinutes,
      links: (task.links ?? undefined) as Prisma.InputJsonValue | undefined,
      position: (last?.position ?? 0) + POSITION_GAP,
      checklist: { create: checklist.map((c) => ({ text: c.text, position: c.position })) },
      labels: { create: labels.map((l) => ({ labelId: l.labelId })) },
      history: { create: { field: "created", toValue: `Recorrência de ${dateToYmd(task.dueDate!)}` } },
    },
  });
}

/**
 * Move a tarefa para uma coluna e posição (índice na coluna de destino).
 * Usado pelo Kanban ao arrastar e soltar.
 */
export async function moveTask(userId: string, taskId: string, toStatusId: string, toIndex: number, tz?: string) {
  const task = await loadForWrite(userId, taskId);
  return db.$transaction(async (tx) => {
    const siblings = await tx.task.findMany({
      where: { statusId: toStatusId, deletedAt: null, archivedAt: null, parentId: null, isTemplate: false, NOT: { id: taskId } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });
    const index = Math.max(0, Math.min(toIndex, siblings.length));
    const before = siblings[index - 1]?.position;
    const after = siblings[index]?.position;
    let position: number;
    if (before === undefined && after === undefined) position = POSITION_GAP;
    else if (before === undefined) position = after! - POSITION_GAP;
    else if (after === undefined) position = before + POSITION_GAP;
    else position = (before + after) / 2;

    // Se as posições ficaram próximas demais, renumera a coluna
    if (before !== undefined && after !== undefined && after - before < 1e-6) {
      const ordered = [...siblings.slice(0, index).map((s) => s.id), taskId, ...siblings.slice(index).map((s) => s.id)];
      for (const [i, id] of ordered.entries()) {
        await tx.task.update({ where: { id }, data: { position: (i + 1) * POSITION_GAP } });
      }
      position = (index + 1) * POSITION_GAP;
    }

    if (toStatusId !== task.statusId) await changeStatusTx(tx, task, toStatusId, position, tz);
    else await tx.task.update({ where: { id: taskId }, data: { position } });
    return tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskCardInclude });
  });
}

/** Marca como concluída (primeira coluna "concluído") ou reabre. */
export async function setTaskDone(userId: string, taskId: string, done: boolean, tz?: string) {
  const task = await loadForWrite(userId, taskId);
  const statuses = await db.taskStatus.findMany({ where: { workspaceId: task.workspaceId }, orderBy: { position: "asc" } });
  const target = done
    ? statuses.find((s) => s.isDone)
    : statuses.find((s) => s.category === "TODO") ?? statuses.find((s) => !s.isDone);
  if (!target) throw new AppError(done ? "Não há coluna de concluídas." : "Não há coluna de pendentes.");
  if (target.id === task.statusId) return db.task.findUniqueOrThrow({ where: { id: taskId }, include: taskCardInclude });
  const position = await endPosition(target.id);
  await db.$transaction((tx) => changeStatusTx(tx, task, target.id, position, tz));
  return db.task.findUniqueOrThrow({ where: { id: taskId }, include: taskCardInclude });
}

export async function archiveTask(userId: string, taskId: string, archived = true) {
  await loadForWrite(userId, taskId);
  await db.task.update({ where: { id: taskId }, data: { archivedAt: archived ? new Date() : null } });
  await db.taskHistory.create({ data: { taskId, field: archived ? "archived" : "unarchived" } });
}

/** Exclusão lógica (inclui subtarefas). */
export async function deleteTask(userId: string, taskId: string) {
  await loadForWrite(userId, taskId);
  const now = new Date();
  await db.task.updateMany({ where: { OR: [{ id: taskId }, { parentId: taskId }] }, data: { deletedAt: now } });
}

export async function restoreTask(userId: string, taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError("Tarefa");
  await requireWorkspaceAccess(userId, task.workspaceId, { module: "tasks", write: true });
  await db.task.updateMany({ where: { OR: [{ id: taskId }, { parentId: taskId }] }, data: { deletedAt: null } });
}

/** Duplica uma tarefa (ou cria a partir de um modelo). */
export async function duplicateTask(userId: string, taskId: string, opts: { asTemplate?: boolean } = {}) {
  const source = await db.task.findFirst({
    where: { id: taskId, deletedAt: null },
    include: { checklist: true, labels: true },
  });
  if (!source) throw new NotFoundError("Tarefa");
  await requireWorkspaceAccess(userId, source.workspaceId, { module: "tasks", write: true });
  const asTemplate = opts.asTemplate ?? false;
  const status = source.isTemplate && !asTemplate ? await defaultStatus(source.workspaceId) : { id: source.statusId };
  const statusRow = await db.taskStatus.findUniqueOrThrow({ where: { id: status.id } });
  return db.task.create({
    data: {
      workspaceId: source.workspaceId,
      statusId: statusRow.id,
      projectId: source.projectId,
      title: source.isTemplate || asTemplate ? source.title : `${source.title} (cópia)`,
      description: source.description,
      assignee: source.assignee,
      priority: source.priority,
      startDate: asTemplate ? null : source.startDate,
      dueDate: asTemplate ? null : source.dueDate,
      rrule: source.rrule,
      estimateMinutes: source.estimateMinutes,
      links: (source.links ?? undefined) as Prisma.InputJsonValue | undefined,
      isTemplate: asTemplate,
      position: await endPosition(statusRow.id),
      startedAt: statusRow.category === "IN_PROGRESS" ? new Date() : null,
      completedAt: statusRow.isDone ? new Date() : null,
      checklist: { create: source.checklist.map((c) => ({ text: c.text, position: c.position, done: false })) },
      labels: { create: source.labels.map((l) => ({ labelId: l.labelId })) },
      history: { create: { field: "created", toValue: asTemplate ? "Modelo" : `Cópia de "${source.title}"` } },
    },
    include: taskCardInclude,
  });
}

// ─── Checklist, comentários, tempo ─────────────────────────────

export async function addChecklistItem(userId: string, taskId: string, text: string) {
  await loadForWrite(userId, taskId);
  const clean = z.string().trim().min(1, "Escreva o item.").max(500).parse(text);
  const last = await db.taskChecklistItem.findFirst({ where: { taskId }, orderBy: { position: "desc" } });
  return db.taskChecklistItem.create({ data: { taskId, text: clean, position: (last?.position ?? -1) + 1 } });
}

async function loadChecklistItem(userId: string, itemId: string) {
  const item = await db.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError("Item");
  await loadForWrite(userId, item.taskId);
  return item;
}

export async function updateChecklistItem(userId: string, itemId: string, patch: { text?: string; done?: boolean }) {
  await loadChecklistItem(userId, itemId);
  const data = z.object({ text: z.string().trim().min(1).max(500).optional(), done: z.boolean().optional() }).parse(patch);
  return db.taskChecklistItem.update({ where: { id: itemId }, data });
}

export async function deleteChecklistItem(userId: string, itemId: string) {
  await loadChecklistItem(userId, itemId);
  await db.taskChecklistItem.delete({ where: { id: itemId } });
}

export async function addComment(userId: string, taskId: string, content: string) {
  await loadForWrite(userId, taskId);
  const clean = z.string().trim().min(1, "Escreva o comentário.").max(5000).parse(content);
  return db.taskComment.create({ data: { taskId, authorId: userId, content: clean } });
}

export async function deleteComment(userId: string, commentId: string) {
  const comment = await db.taskComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError("Comentário");
  await loadForWrite(userId, comment.taskId);
  if (comment.authorId && comment.authorId !== userId) throw new AppError("Só quem escreveu pode excluir o comentário.");
  await db.taskComment.delete({ where: { id: commentId } });
}

export async function logTime(userId: string, taskId: string, input: { minutes: number; date: string; note?: string }) {
  await loadForWrite(userId, taskId);
  const data = z
    .object({ minutes: z.number().int().min(1, "Informe os minutos.").max(24 * 60), date: ymd, note: z.string().max(500).optional() })
    .parse(input);
  return db.timeEntry.create({ data: { taskId, minutes: data.minutes, date: ymdToDate(data.date), note: data.note || null } });
}

export async function deleteTimeEntry(userId: string, entryId: string) {
  const entry = await db.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new NotFoundError("Registro de tempo");
  await loadForWrite(userId, entry.taskId);
  await db.timeEntry.delete({ where: { id: entryId } });
}

// ─── Colunas, projetos e etiquetas ─────────────────────────────

const STATUS_CATEGORIES = ["BACKLOG", "TODO", "IN_PROGRESS", "WAITING", "REVIEW", "DONE"] as const;

export async function createStatus(userId: string, workspaceId: string, input: { name: string; category: string }) {
  await requireWorkspaceAccess(userId, workspaceId, { module: "tasks", write: true });
  const data = z.object({ name: z.string().trim().min(1, "Informe o nome.").max(60), category: z.enum(STATUS_CATEGORIES) }).parse(input);
  const last = await db.taskStatus.findFirst({ where: { workspaceId }, orderBy: { position: "desc" } });
  return db.taskStatus.create({
    data: { workspaceId, name: data.name, category: data.category, isDone: data.category === "DONE", position: (last?.position ?? -1) + 1 },
  });
}

export async function updateStatus(userId: string, statusId: string, input: { name?: string; category?: string }) {
  const status = await db.taskStatus.findUnique({ where: { id: statusId } });
  if (!status) throw new NotFoundError("Coluna");
  await requireWorkspaceAccess(userId, status.workspaceId, { module: "tasks", write: true });
  const data = z.object({ name: z.string().trim().min(1).max(60).optional(), category: z.enum(STATUS_CATEGORIES).optional() }).parse(input);
  if (data.category && data.category !== "DONE" && status.isDone) {
    const doneCount = await db.taskStatus.count({ where: { workspaceId: status.workspaceId, isDone: true } });
    if (doneCount <= 1) throw new AppError("É preciso manter ao menos uma coluna de concluídas.");
  }
  return db.taskStatus.update({
    where: { id: statusId },
    data: { ...data, ...(data.category ? { isDone: data.category === "DONE" } : {}) },
  });
}

export async function reorderStatuses(userId: string, workspaceId: string, orderedIds: string[]) {
  await requireWorkspaceAccess(userId, workspaceId, { module: "tasks", write: true });
  const existing = await db.taskStatus.findMany({ where: { workspaceId }, select: { id: true } });
  const ids = new Set(existing.map((s) => s.id));
  if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id))) throw new AppError("Lista de colunas inválida.");
  await db.$transaction(orderedIds.map((id, position) => db.taskStatus.update({ where: { id }, data: { position } })));
}

/** Exclui uma coluna movendo as tarefas dela para outra coluna. */
export async function deleteStatus(userId: string, statusId: string, moveToStatusId: string) {
  const status = await db.taskStatus.findUnique({ where: { id: statusId } });
  if (!status) throw new NotFoundError("Coluna");
  await requireWorkspaceAccess(userId, status.workspaceId, { module: "tasks", write: true });
  if (statusId === moveToStatusId) throw new AppError("Escolha outra coluna para receber as tarefas.");
  const target = await db.taskStatus.findFirst({ where: { id: moveToStatusId, workspaceId: status.workspaceId } });
  if (!target) throw new AppError("Coluna de destino inválida.");
  const all = await db.taskStatus.findMany({ where: { workspaceId: status.workspaceId } });
  if (status.isDone && all.filter((s) => s.isDone).length <= 1) throw new AppError("É preciso manter ao menos uma coluna de concluídas.");
  if (all.filter((s) => !s.isDone && s.id !== statusId).length === 0) throw new AppError("É preciso manter ao menos uma coluna de pendentes.");

  await db.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({ where: { statusId }, include: { status: true } });
    let position = await tx.task
      .findFirst({ where: { statusId: target.id }, orderBy: { position: "desc" } })
      .then((t) => t?.position ?? 0);
    for (const task of tasks) {
      position += POSITION_GAP;
      await changeStatusTx(tx, task, target.id, position);
    }
    await tx.taskStatus.delete({ where: { id: statusId } });
  });
}

export async function listProjects(userId: string, workspaceId: string | "all" = "all") {
  const ids = await accessibleWorkspaceIds(userId, "tasks", workspaceId);
  return db.project.findMany({ where: { workspaceId: { in: ids }, archived: false }, orderBy: { name: "asc" } });
}

export async function createProject(userId: string, input: { workspaceId: string; name: string; color?: string; description?: string }) {
  const data = z
    .object({
      workspaceId: z.string(),
      name: z.string().trim().min(1, "Informe o nome do projeto.").max(100),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      description: z.string().max(2000).optional(),
    })
    .parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "tasks", write: true });
  return db.project.create({ data });
}

export async function updateProject(userId: string, projectId: string, input: { name?: string; color?: string; archived?: boolean }) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Projeto");
  await requireWorkspaceAccess(userId, project.workspaceId, { module: "tasks", write: true });
  const data = z
    .object({ name: z.string().trim().min(1).max(100).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), archived: z.boolean().optional() })
    .parse(input);
  return db.project.update({ where: { id: projectId }, data });
}

export async function listLabels(userId: string, workspaceId: string | "all" = "all") {
  const ids = await accessibleWorkspaceIds(userId, "tasks", workspaceId);
  return db.label.findMany({ where: { workspaceId: { in: ids } }, orderBy: { name: "asc" } });
}

export async function createLabel(userId: string, input: { workspaceId: string; name: string; color?: string }) {
  const data = z
    .object({ workspaceId: z.string(), name: z.string().trim().min(1, "Informe o nome.").max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })
    .parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "tasks", write: true });
  const existing = await db.label.findFirst({ where: { workspaceId: data.workspaceId, name: { equals: data.name, mode: "insensitive" } } });
  return existing ?? db.label.create({ data });
}

export async function deleteLabel(userId: string, labelId: string) {
  const label = await db.label.findUnique({ where: { id: labelId } });
  if (!label) throw new NotFoundError("Etiqueta");
  await requireWorkspaceAccess(userId, label.workspaceId, { module: "tasks", write: true });
  await db.label.delete({ where: { id: labelId } });
}

/** Nomes de responsáveis já usados (para autocompletar). */
export async function listAssignees(userId: string): Promise<string[]> {
  const ids = await accessibleWorkspaceIds(userId, "tasks");
  const rows = await db.task.findMany({
    where: { workspaceId: { in: ids }, assignee: { not: null }, deletedAt: null },
    distinct: ["assignee"],
    select: { assignee: true },
    take: 200,
  });
  return rows.map((r) => r.assignee!).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Contagens para o dashboard e resumos. */
export async function taskStats(userId: string, workspaceId: string | "all", tz: string, range?: { from: string; to: string }) {
  const ids = await accessibleWorkspaceIds(userId, "tasks", workspaceId);
  const today = todayYmd(tz);
  const base: Prisma.TaskWhereInput = { workspaceId: { in: ids }, deletedAt: null, archivedAt: null, isTemplate: false };
  const [pending, inProgress, overdue, dueToday, doneInRange] = await Promise.all([
    db.task.count({ where: { ...base, status: { isDone: false } } }),
    db.task.count({ where: { ...base, status: { isDone: false, category: "IN_PROGRESS" } } }),
    db.task.count({ where: { ...base, status: { isDone: false }, dueDate: { lt: ymdToDate(today) } } }),
    db.task.count({ where: { ...base, status: { isDone: false }, dueDate: ymdToDate(today) } }),
    range
      ? db.task.count({
          where: {
            ...base,
            status: { isDone: true },
            completedAt: { gte: zonedToUtc(range.from, "00:00", tz), lt: zonedToUtc(addDaysYmd(range.to, 1), "00:00", tz) },
          },
        })
      : Promise.resolve(0),
  ]);
  return { pending, inProgress, overdue, dueToday, doneInRange };
}

export { STATUS_CATEGORIES };
