import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { authenticate, changePassword, isRegistrationOpen, registerUser } from "./accounts";
import { MAX_FAILED_ATTEMPTS } from "./rate-limit";
import { createTestUser, TEST_PASSWORD } from "../../../tests/factories";
import { DEFAULT_MAAS_AREAS, DEFAULT_PIPELINE_STAGES, DEFAULT_TASK_STATUSES, DEFAULT_CONTENT_STATUSES } from "@/server/bootstrap";

describe("cadastro", () => {
  it("primeira conta vira administradora com os três ambientes e estruturas padrão", async () => {
    expect(await isRegistrationOpen()).toBe(true);
    const result = await registerUser({ name: "Gabriela Benfica", email: "Gabi@Exemplo.com", password: TEST_PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const user = await db.user.findUniqueOrThrow({ where: { id: result.value.id } });
    expect(user.email).toBe("gabi@exemplo.com");
    expect(user.isAdmin).toBe(true);
    expect(user.passwordHash).not.toContain(TEST_PASSWORD);

    const workspaces = await db.workspace.findMany({ where: { ownerId: user.id }, orderBy: { position: "asc" } });
    expect(workspaces.map((w) => w.kind)).toEqual(["TURBO", "PESSOAL", "MENTORIA"]);
    expect(workspaces[1]!.name).toBe("Pessoal Gabriela");

    for (const ws of workspaces) {
      const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } } });
      expect(member?.role).toBe("OWNER");
      expect(await db.taskStatus.count({ where: { workspaceId: ws.id } })).toBe(DEFAULT_TASK_STATUSES.length);
      expect(await db.contentStatus.count({ where: { workspaceId: ws.id } })).toBe(DEFAULT_CONTENT_STATUSES.length);
    }
    const mentoria = workspaces.find((w) => w.kind === "MENTORIA")!;
    expect(await db.pipelineStage.count({ where: { workspaceId: mentoria.id } })).toBe(DEFAULT_PIPELINE_STAGES.length);
    expect(await db.maasArea.count({ where: { userId: user.id } })).toBe(DEFAULT_MAAS_AREAS.length);
    const pessoal = workspaces.find((w) => w.kind === "PESSOAL")!;
    expect(await db.financialCategory.count({ where: { workspaceId: pessoal.id, kind: "EXPENSE" } })).toBeGreaterThan(5);
  });

  it("fecha o cadastro depois da primeira conta, salvo com ALLOW_REGISTRATION", async () => {
    await registerUser({ name: "Gabriela", email: "a@exemplo.com", password: TEST_PASSWORD });
    expect(await isRegistrationOpen()).toBe(false);
    const second = await registerUser({ name: "Outra", email: "b@exemplo.com", password: TEST_PASSWORD });
    expect(second).toEqual({ ok: false, error: "Novos cadastros estão desativados." });
  });

  it("rejeita e-mail duplicado e senha fraca", async () => {
    await createTestUser({ email: "dup@exemplo.com" });
    process.env.ALLOW_REGISTRATION = "true";
    try {
      const dup = await registerUser({ name: "Outra", email: "DUP@exemplo.com", password: TEST_PASSWORD });
      expect(dup.ok).toBe(false);
      const weak = await registerUser({ name: "Outra", email: "nova@exemplo.com", password: "123" });
      expect(weak.ok).toBe(false);
    } finally {
      delete process.env.ALLOW_REGISTRATION;
    }
  });
});

describe("login", () => {
  it("autentica com a senha correta (e-mail sem diferenciar maiúsculas)", async () => {
    const user = await createTestUser({ email: "login@exemplo.com" });
    const ok = await authenticate("LOGIN@exemplo.com", TEST_PASSWORD, "1.1.1.1");
    expect(ok).toEqual({ ok: true, value: { id: user.id } });
  });

  it("mensagem genérica para senha errada e e-mail inexistente", async () => {
    await createTestUser({ email: "x@exemplo.com" });
    const wrong = await authenticate("x@exemplo.com", "errada123!", null);
    const missing = await authenticate("ninguem@exemplo.com", TEST_PASSWORD, null);
    expect(wrong.ok).toBe(false);
    expect(missing.ok).toBe(false);
    if (!wrong.ok && !missing.ok) expect(wrong.error).toBe(missing.error);
  });

  it("bloqueia após tentativas falhas repetidas, mesmo com a senha certa", async () => {
    await createTestUser({ email: "lock@exemplo.com" });
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await authenticate("lock@exemplo.com", "errada123!", "2.2.2.2");
    }
    const blocked = await authenticate("lock@exemplo.com", TEST_PASSWORD, "2.2.2.2");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/Muitas tentativas/);
  });

  it("troca de senha exige a senha atual", async () => {
    const user = await createTestUser();
    expect((await changePassword(user.id, "errada", "NovaSenha#2026")).ok).toBe(false);
    expect((await changePassword(user.id, TEST_PASSWORD, "NovaSenha#2026")).ok).toBe(true);
    expect((await authenticate(user.email, "NovaSenha#2026", null)).ok).toBe(true);
    const audit = await db.auditLog.findFirst({ where: { userId: user.id, action: "change_password" } });
    expect(audit).not.toBeNull();
  });
});
