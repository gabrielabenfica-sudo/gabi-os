import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces, ForbiddenError } from "@/server/workspaces";
import {
  addChecklistItem, addComment, archiveTask, createLabel, createProject, createStatus, createTask, deleteStatus,
  deleteTask, duplicateTask, getBoard, getTask, isOverdue, listTasks, logTime, moveTask, setTaskDone, taskStats, updateTask,
} from "./tasks";
import { createTestUser } from "../../tests/factories";
import { addDaysYmd, todayYmd } from "@/lib/dates";

const TZ = "America/Sao_Paulo";

async function setup() {
  const user = await createTestUser();
  const [turbo, pessoal] = await listWorkspaces(user.id);
  const statuses = await db.taskStatus.findMany({ where: { workspaceId: turbo!.id }, orderBy: { position: "asc" } });
  const byCat = (c: string) => statuses.find((s) => s.category === c)!;
  return { user, turbo: turbo!, pessoal: pessoal!, statuses, byCat };
}

describe("tarefas: CRUD e regras de status", () => {
  it("cria na coluna A fazer, edita com histórico e exclui logicamente", async () => {
    const { user, turbo, byCat } = await setup();
    const task = await createTask(user.id, { workspaceId: turbo.id, title: "Roteiro do Reels", checklist: ["Gancho", "CTA"] });
    expect(task.statusId).toBe(byCat("TODO").id);
    expect(task.startedAt).toBeNull();

    await updateTask(user.id, task.id, { title: "Roteiro do Reels v2", priority: "HIGH", dueDate: "2026-11-10" });
    const detail = await getTask(user.id, task.id);
    expect(detail.title).toBe("Roteiro do Reels v2");
    expect(detail.checklist).toHaveLength(2);
    expect(detail.history.map((h) => h.field)).toEqual(expect.arrayContaining(["title", "priority", "dueDate", "created"]));

    await deleteTask(user.id, task.id);
    expect(await listTasks(user.id, { workspaceId: turbo.id })).toHaveLength(0);
    expect(await db.task.count({ where: { id: task.id } })).toBe(1);
  });

  it("registra início e conclusão; reabrir limpa a conclusão; concluída não conta como pendente", async () => {
    const { user, turbo, byCat } = await setup();
    const task = await createTask(user.id, { workspaceId: turbo.id, title: "Editar vídeo" });
    const started = await moveTask(user.id, task.id, byCat("IN_PROGRESS").id, 0);
    expect(started.startedAt).not.toBeNull();
    expect(started.completedAt).toBeNull();

    const done = await setTaskDone(user.id, task.id, true);
    expect(done.status.isDone).toBe(true);
    expect(done.completedAt).not.toBeNull();
    expect(done.startedAt).toEqual(started.startedAt);
    expect((await taskStats(user.id, turbo.id, TZ)).pending).toBe(0);

    const reopened = await setTaskDone(user.id, task.id, false);
    expect(reopened.completedAt).toBeNull();
    expect((await taskStats(user.id, turbo.id, TZ)).pending).toBe(1);
  });

  it("identifica atraso pelo prazo e status, nunca para concluídas", async () => {
    const { user, turbo } = await setup();
    const today = todayYmd(TZ);
    const late = await createTask(user.id, { workspaceId: turbo.id, title: "Atrasada", dueDate: addDaysYmd(today, -2) });
    await createTask(user.id, { workspaceId: turbo.id, title: "Hoje", dueDate: today });
    const doneLate = await createTask(user.id, { workspaceId: turbo.id, title: "Feita", dueDate: addDaysYmd(today, -5) });
    await setTaskDone(user.id, doneLate.id, true);

    const overdue = await listTasks(user.id, { workspaceId: turbo.id, overdue: true }, TZ);
    expect(overdue.map((t) => t.id)).toEqual([late.id]);
    const stats = await taskStats(user.id, turbo.id, TZ);
    expect(stats.overdue).toBe(1);
    expect(stats.dueToday).toBe(1);
    const all = await listTasks(user.id, { workspaceId: turbo.id }, TZ);
    expect(all.filter((t) => isOverdue(t, today)).map((t) => t.title)).toEqual(["Atrasada"]);
  });

  it("valida início depois do prazo e referências de outro ambiente", async () => {
    const { user, turbo, pessoal } = await setup();
    await expect(createTask(user.id, { workspaceId: turbo.id, title: "X", startDate: "2026-11-10", dueDate: "2026-11-01" })).rejects.toThrow(/início/);
    const project = await createProject(user.id, { workspaceId: pessoal.id, name: "Casa" });
    await expect(createTask(user.id, { workspaceId: turbo.id, title: "X", projectId: project.id })).rejects.toThrow(/Projeto inválido/);
  });

  it("outra usuária não lê nem altera", async () => {
    const { user, turbo } = await setup();
    const intruder = await createTestUser();
    const task = await createTask(user.id, { workspaceId: turbo.id, title: "Privada" });
    await expect(getTask(intruder.id, task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateTask(intruder.id, task.id, { title: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTask(intruder.id, { workspaceId: turbo.id, title: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listTasks(intruder.id, {})).toHaveLength(0);
  });
});

describe("tarefas: Kanban", () => {
  it("reordena dentro da coluna e entre colunas", async () => {
    const { user, turbo, byCat } = await setup();
    const a = await createTask(user.id, { workspaceId: turbo.id, title: "A" });
    const b = await createTask(user.id, { workspaceId: turbo.id, title: "B" });
    const c = await createTask(user.id, { workspaceId: turbo.id, title: "C" });
    const todo = byCat("TODO").id;

    await moveTask(user.id, c.id, todo, 0);
    let board = await getBoard(user.id, turbo.id);
    expect(board.tasks.filter((t) => t.statusId === todo).map((t) => t.title)).toEqual(["C", "A", "B"]);

    await moveTask(user.id, a.id, todo, 2);
    board = await getBoard(user.id, turbo.id);
    expect(board.tasks.filter((t) => t.statusId === todo).map((t) => t.title)).toEqual(["C", "B", "A"]);

    await moveTask(user.id, b.id, byCat("REVIEW").id, 0);
    board = await getBoard(user.id, turbo.id);
    expect(board.tasks.find((t) => t.id === b.id)!.statusId).toBe(byCat("REVIEW").id);
    const hist = await db.taskHistory.findMany({ where: { taskId: b.id, field: "status" } });
    expect(hist[0]).toMatchObject({ fromValue: "A fazer", toValue: "Em revisão" });
  });

  it("renumera quando as posições ficam muito próximas", async () => {
    const { user, turbo, byCat } = await setup();
    const todo = byCat("TODO").id;
    for (const t of ["1", "2", "3"]) await createTask(user.id, { workspaceId: turbo.id, title: t });
    // Sempre move o último para a posição 1: as posições se aproximam pela metade a cada vez
    const model = ["1", "2", "3"];
    for (let i = 0; i < 45; i++) {
      const board = await getBoard(user.id, turbo.id);
      const col = board.tasks.filter((t) => t.statusId === todo);
      const last = col[col.length - 1]!;
      await moveTask(user.id, last.id, todo, 1);
      model.splice(1, 0, model.pop()!);
    }
    const board = await getBoard(user.id, turbo.id);
    expect(board.tasks.filter((t) => t.statusId === todo).map((t) => t.title)).toEqual(model);
  });

  it("colunas personalizáveis: criar e excluir movendo tarefas", async () => {
    const { user, turbo, byCat } = await setup();
    const col = await createStatus(user.id, turbo.id, { name: "Bloqueado", category: "WAITING" });
    const t = await createTask(user.id, { workspaceId: turbo.id, title: "X", statusId: col.id });
    await deleteStatus(user.id, col.id, byCat("TODO").id);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).statusId).toBe(byCat("TODO").id);
    await expect(deleteStatus(user.id, byCat("DONE").id, byCat("TODO").id)).rejects.toThrow(/concluídas/);
  });
});

describe("tarefas: recorrência, modelos e detalhes", () => {
  it("ao concluir uma tarefa recorrente cria a próxima, sem duplicar", async () => {
    const { user, turbo } = await setup();
    const t = await createTask(user.id, {
      workspaceId: turbo.id, title: "Reunião de pauta", dueDate: "2026-11-02", startDate: "2026-11-01",
      rrule: "FREQ=WEEKLY;INTERVAL=1", checklist: ["Pauta"],
    });
    await setTaskDone(user.id, t.id, true);
    await setTaskDone(user.id, t.id, false);
    await setTaskDone(user.id, t.id, true);
    const next = await db.task.findMany({ where: { recurrenceParentId: t.id }, include: { checklist: true, status: true } });
    expect(next).toHaveLength(1);
    expect(next[0]!.dueDate!.toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(next[0]!.startDate!.toISOString().slice(0, 10)).toBe("2026-11-08");
    expect(next[0]!.status.isDone).toBe(false);
    expect(next[0]!.checklist.map((c) => c.done)).toEqual([false]);
  });

  it("duplica, cria modelo, arquiva e registra detalhes", async () => {
    const { user, turbo } = await setup();
    const label = await createLabel(user.id, { workspaceId: turbo.id, name: "Reels" });
    const t = await createTask(user.id, { workspaceId: turbo.id, title: "Base", labelIds: [label.id], checklist: ["a"] });
    const copy = await duplicateTask(user.id, t.id);
    expect(copy.title).toBe("Base (cópia)");
    expect(copy.labels).toHaveLength(1);
    const tpl = await duplicateTask(user.id, t.id, { asTemplate: true });
    expect(tpl.isTemplate).toBe(true);
    expect((await listTasks(user.id, { workspaceId: turbo.id })).map((x) => x.id)).not.toContain(tpl.id);
    expect((await listTasks(user.id, { workspaceId: turbo.id, templates: true })).map((x) => x.id)).toEqual([tpl.id]);
    const fromTpl = await duplicateTask(user.id, tpl.id);
    expect(fromTpl.isTemplate).toBe(false);
    expect(fromTpl.title).toBe("Base");

    await addChecklistItem(user.id, t.id, "b");
    await addComment(user.id, t.id, "Ok!");
    await logTime(user.id, t.id, { minutes: 45, date: "2026-10-20" });
    const detail = await getTask(user.id, t.id);
    expect(detail.checklist).toHaveLength(2);
    expect(detail.comments[0]!.content).toBe("Ok!");
    expect(detail.timeEntries[0]!.minutes).toBe(45);

    await archiveTask(user.id, t.id);
    expect((await listTasks(user.id, { workspaceId: turbo.id })).map((x) => x.id)).not.toContain(t.id);
    expect((await listTasks(user.id, { workspaceId: turbo.id, includeArchived: true })).map((x) => x.id)).toContain(t.id);
  });

  it("subtarefas ficam fora do quadro principal e são excluídas com a principal", async () => {
    const { user, turbo } = await setup();
    const parent = await createTask(user.id, { workspaceId: turbo.id, title: "Campanha" });
    await createTask(user.id, { workspaceId: turbo.id, title: "Peça 1", parentId: parent.id });
    const board = await getBoard(user.id, turbo.id);
    expect(board.tasks.map((t) => t.title)).toEqual(["Campanha"]);
    expect(board.tasks[0]!._count.subtasks).toBe(1);
    await deleteTask(user.id, parent.id);
    expect(await db.task.count({ where: { deletedAt: null } })).toBe(0);
  });
});
