import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ForbiddenError, listWorkspaces } from "@/server/workspaces";
import { createTestUser } from "../../tests/factories";
import { acceptInvitation, getInvitation, inviteMember, listTeam, registerFromInvitation, removeMember, updateMember } from "./team";
import { listLeads, createLead } from "./crm";
import { listAccounts } from "./finance/accounts";

const URL_BASE = "https://app.exemplo.com";
const tokenOf = (link: string) => link.split("/convite/")[1]!;

describe("equipe e convites", () => {
  it("convite cria conta de colaboradora com os módulos escolhidos (sem ambientes próprios)", async () => {
    const owner = await createTestUser({ name: "Gabriela" });
    const mentoria = (await listWorkspaces(owner.id)).find((w) => w.kind === "MENTORIA")!;
    await createLead(owner.id, { workspaceId: mentoria.id, name: "Lead X" });
    const inv = await inviteMember(owner.id, { workspaceId: mentoria.id, email: "Assistente@Exemplo.com", role: "EDITOR", modules: ["crm"] }, URL_BASE);
    expect(inv.link).toMatch(/^https:\/\/app\.exemplo\.com\/convite\/.{20,}/);
    // Só o hash fica salvo
    expect(await db.invitation.count({ where: { tokenHash: tokenOf(inv.link) } })).toBe(0);
    expect(await getInvitation(tokenOf(inv.link))).toMatchObject({ email: "assistente@exemplo.com", hasAccount: false, modules: ["crm"] });

    await expect(registerFromInvitation(tokenOf(inv.link), { name: "Ana", password: "curta" })).rejects.toThrow();
    const ana = await registerFromInvitation(tokenOf(inv.link), { name: "Ana", password: "SenhaForte#2026" });
    expect(ana.isAdmin).toBe(false);
    expect((await listWorkspaces(ana.id)).map((w) => w.id)).toEqual([mentoria.id]);
    expect((await listLeads(ana.id, mentoria.id)).map((l) => l.name)).toEqual(["Lead X"]);
    await expect(listAccounts(ana.id, mentoria.id)).rejects.toBeInstanceOf(ForbiddenError);
    // Link de uso único
    expect(await getInvitation(tokenOf(inv.link))).toBeNull();
    await expect(registerFromInvitation(tokenOf(inv.link), { name: "Ana", password: "SenhaForte#2026" })).rejects.toThrow(/inválido/);

    // Ajuste de permissões e remoção
    const team = await listTeam(owner.id, mentoria.id);
    const member = team.members.find((m) => m.userId === ana.id)!;
    await updateMember(owner.id, member.id, { role: "VIEWER", modules: ["crm", "finance"] });
    expect((await listAccounts(ana.id, mentoria.id)).length).toBeGreaterThanOrEqual(0);
    await expect(createLead(ana.id, { workspaceId: mentoria.id, name: "Y" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteMember(ana.id, { workspaceId: mentoria.id, email: "z@x.com", role: "EDITOR", modules: [] }, URL_BASE)).rejects.toBeInstanceOf(ForbiddenError);
    const ownerMember = team.members.find((m) => m.role === "OWNER")!;
    await expect(removeMember(owner.id, ownerMember.id)).rejects.toThrow(/dona/);
    await removeMember(owner.id, member.id);
    await expect(listLeads(ana.id, mentoria.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("quem já tem conta aceita logada com o e-mail convidado; convite expirado não vale", async () => {
    const owner = await createTestUser({ name: "Gabriela" });
    const other = await createTestUser({ name: "Bia" });
    const turbo = (await listWorkspaces(owner.id)).find((w) => w.kind === "TURBO")!;
    const inv = await inviteMember(owner.id, { workspaceId: turbo.id, email: other.email, role: "EDITOR", modules: ["tasks"] }, URL_BASE);
    expect((await getInvitation(tokenOf(inv.link)))!.hasAccount).toBe(true);
    await expect(acceptInvitation(owner.id, tokenOf(inv.link))).rejects.toThrow(/Este convite é para/);
    await acceptInvitation(other.id, tokenOf(inv.link));
    expect((await listWorkspaces(other.id)).some((w) => w.id === turbo.id)).toBe(true);
    await expect(inviteMember(owner.id, { workspaceId: turbo.id, email: other.email, role: "EDITOR", modules: [] }, URL_BASE)).rejects.toThrow(/já faz parte/);

    const late = await inviteMember(owner.id, { workspaceId: turbo.id, email: "tarde@x.com", role: "VIEWER", modules: [] }, URL_BASE);
    await db.invitation.updateMany({ where: { email: "tarde@x.com" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getInvitation(tokenOf(late.link))).toBeNull();
  });
});
