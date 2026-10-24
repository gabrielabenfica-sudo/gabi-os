import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  accessibleWorkspaceIds,
  ForbiddenError,
  listWorkspaces,
  reorderWorkspaces,
  requireWorkspaceAccess,
  updateWorkspace,
} from "./workspaces";
import { exportUserData } from "./export";
import { createTestUser } from "../../tests/factories";

describe("autorização por ambiente", () => {
  it("dona acessa seus ambientes; outra usuária não", async () => {
    const gabi = await createTestUser({ name: "Gabriela" });
    const other = await createTestUser({ name: "Outra" });
    const [turbo] = await listWorkspaces(gabi.id);

    await expect(requireWorkspaceAccess(gabi.id, turbo!.id, { module: "finance", write: true })).resolves.toBeTruthy();
    await expect(requireWorkspaceAccess(other.id, turbo!.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWorkspace(other.id, turbo!.id, { name: "Invadido", color: "#000000" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("colaboradora só vê módulos liberados e não acessa financeiro por padrão", async () => {
    const gabi = await createTestUser({ name: "Gabriela" });
    const colab = await createTestUser({ name: "Colaboradora" });
    const [turbo] = await listWorkspaces(gabi.id);
    await db.workspaceMember.create({
      data: { workspaceId: turbo!.id, userId: colab.id, role: "EDITOR", modules: ["tasks", "content"] },
    });

    await expect(requireWorkspaceAccess(colab.id, turbo!.id, { module: "tasks", write: true })).resolves.toBeTruthy();
    await expect(requireWorkspaceAccess(colab.id, turbo!.id, { module: "finance" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireWorkspaceAccess(colab.id, turbo!.id, { module: "mentees" })).rejects.toBeInstanceOf(ForbiddenError);
    // EDITOR não pode renomear o ambiente
    await expect(updateWorkspace(colab.id, turbo!.id, { name: "X", color: "#000000" })).rejects.toBeInstanceOf(ForbiddenError);

    expect(await accessibleWorkspaceIds(colab.id, "finance")).not.toContain(turbo!.id);
    expect(await accessibleWorkspaceIds(colab.id, "tasks")).toContain(turbo!.id);
  });

  it("leitora não escreve", async () => {
    const gabi = await createTestUser();
    const viewer = await createTestUser();
    const [turbo] = await listWorkspaces(gabi.id);
    await db.workspaceMember.create({ data: { workspaceId: turbo!.id, userId: viewer.id, role: "VIEWER", modules: ["tasks"] } });
    await expect(requireWorkspaceAccess(viewer.id, turbo!.id, { module: "tasks" })).resolves.toBeTruthy();
    await expect(requireWorkspaceAccess(viewer.id, turbo!.id, { module: "tasks", write: true })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("edição de ambientes", () => {
  it("renomeia, valida cor e registra auditoria", async () => {
    const gabi = await createTestUser();
    const [turbo] = await listWorkspaces(gabi.id);
    await updateWorkspace(gabi.id, turbo!.id, { name: "TURBO", color: "#112233" });
    const updated = await db.workspace.findUniqueOrThrow({ where: { id: turbo!.id } });
    expect(updated.name).toBe("TURBO");
    expect(await db.auditLog.count({ where: { entity: "Workspace", entityId: turbo!.id } })).toBe(1);
    await expect(updateWorkspace(gabi.id, turbo!.id, { name: "X", color: "vermelho" })).rejects.toThrow();
  });

  it("reordena apenas os próprios ambientes", async () => {
    const gabi = await createTestUser();
    const other = await createTestUser();
    const ws = await listWorkspaces(gabi.id);
    const otherWs = await listWorkspaces(other.id);
    const reversed = ws.map((w) => w.id).reverse();
    await reorderWorkspaces(gabi.id, reversed);
    expect((await listWorkspaces(gabi.id)).map((w) => w.id)).toEqual(reversed);
    await expect(reorderWorkspaces(gabi.id, [ws[0]!.id, ws[1]!.id, otherWs[0]!.id])).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("exportação", () => {
  it("inclui os dados da usuária e nunca segredos", async () => {
    const gabi = await createTestUser();
    const other = await createTestUser();
    const data = await exportUserData(gabi.id);
    const json = JSON.stringify(data);
    expect(data.workspaces).toHaveLength(3);
    expect(data.data.maasAreas.length).toBeGreaterThan(0);
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("argon2");
    expect(json).not.toContain("tokenHash");
    const otherIds = (await listWorkspaces(other.id)).map((w) => w.id);
    for (const id of otherIds) expect(json).not.toContain(id);
  });
});
