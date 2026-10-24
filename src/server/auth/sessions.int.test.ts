import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import {
  createSession,
  invalidateOtherSessions,
  invalidateSession,
  SESSION_TTL_MS,
  validateSessionToken,
} from "./sessions";
import { createTestUser } from "../../../tests/factories";

describe("sessões", () => {
  it("guarda só o hash do token e valida o token original", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id, { userAgent: "Vitest", ip: "127.0.0.1" });
    const stored = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(sha256(token));
    expect(stored.tokenHash).not.toBe(token);

    const session = await validateSessionToken(token);
    expect(session?.user.id).toBe(user.id);
    expect(session?.user).not.toHaveProperty("passwordHash");
  });

  it("rejeita token desconhecido", async () => {
    expect(await validateSessionToken("token-inexistente")).toBeNull();
    expect(await validateSessionToken("")).toBeNull();
  });

  it("remove sessão expirada", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    await db.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("renova sessão perto do vencimento", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    await db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    const session = await validateSessionToken(token);
    expect(session?.renewed).toBe(true);
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
  });

  it("encerra a sessão atual e as demais", async () => {
    const user = await createTestUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);
    const c = await createSession(user.id);
    const sa = (await validateSessionToken(a.token))!;
    expect(await invalidateOtherSessions(user.id, sa.sessionId)).toBe(2);
    expect(await validateSessionToken(b.token)).toBeNull();
    expect(await validateSessionToken(c.token)).toBeNull();
    await invalidateSession(sa.sessionId);
    expect(await validateSessionToken(a.token)).toBeNull();
  });

  it("não aceita sessão de usuária excluída", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    expect(await validateSessionToken(token)).toBeNull();
  });
});
