import type { MemberRole } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { audit } from "@/server/audit";
import { randomToken, sha256 } from "@/server/crypto";
import { ForbiddenError, MODULES, requireWorkspaceAccess } from "@/server/workspaces";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";

/**
 * Equipe: a dona (ou admin) de um ambiente convida colaboradores com um papel
 * e os módulos liberados. Financeiro e mentorados só aparecem se marcados.
 * O convite é um link de uso único válido por 7 dias; só o hash do token é salvo.
 * Colaboradores convidados não ganham ambientes próprios.
 */

const INVITE_DAYS = 7;
const roleSchema = z.enum(["ADMIN", "EDITOR", "VIEWER"]);
const modulesSchema = z.array(z.enum(MODULES)).max(MODULES.length);

async function requireManager(userId: string, workspaceId: string) {
  const m = await requireWorkspaceAccess(userId, workspaceId);
  if (m.role !== "OWNER" && m.role !== "ADMIN") throw new ForbiddenError("Só a dona ou administradores gerenciam a equipe.");
  return m;
}

export async function listTeam(userId: string, workspaceId: string) {
  await requireManager(userId, workspaceId);
  const [members, invitations] = await Promise.all([
    db.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  return { members, invitations };
}

export const inviteSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  role: roleSchema,
  modules: modulesSchema,
});

/** Cria o convite e devolve o link (para copiar e enviar). Quem já faz parte não é convidado de novo. */
export async function inviteMember(userId: string, input: z.input<typeof inviteSchema>, appUrl: string) {
  const data = inviteSchema.parse(input);
  await requireManager(userId, data.workspaceId);
  const existingUser = await db.user.findUnique({ where: { email: data.email } });
  if (existingUser && (await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: data.workspaceId, userId: existingUser.id } } }))) {
    throw new AppError("Essa pessoa já faz parte deste ambiente.");
  }
  const token = randomToken(32);
  await db.invitation.deleteMany({ where: { workspaceId: data.workspaceId, email: data.email, acceptedAt: null } });
  const inv = await db.invitation.create({
    data: { workspaceId: data.workspaceId, email: data.email, role: data.role, modules: data.modules, tokenHash: sha256(token), invitedById: userId, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  });
  await audit({ userId, workspaceId: data.workspaceId, entity: "Invitation", entityId: inv.id, action: "invite", after: { email: data.email, role: data.role, modules: data.modules } });
  return { id: inv.id, link: `${appUrl.replace(/\/$/, "")}/convite/${token}`, expiresAt: inv.expiresAt };
}

export async function revokeInvitation(userId: string, invitationId: string) {
  const inv = await db.invitation.findUnique({ where: { id: invitationId } });
  if (!inv) throw new NotFoundError("Convite");
  await requireManager(userId, inv.workspaceId);
  await db.invitation.delete({ where: { id: invitationId } });
}

export async function updateMember(userId: string, memberId: string, input: { role: string; modules: string[] }) {
  const m = await db.workspaceMember.findUnique({ where: { id: memberId } });
  if (!m) throw new NotFoundError("Membro");
  await requireManager(userId, m.workspaceId);
  if (m.role === "OWNER") throw new AppError("O papel da dona do ambiente não pode ser alterado.");
  const data = z.object({ role: roleSchema, modules: modulesSchema }).parse(input);
  const after = await db.workspaceMember.update({ where: { id: memberId }, data: { role: data.role as MemberRole, modules: data.modules } });
  await audit({ userId, workspaceId: m.workspaceId, entity: "WorkspaceMember", entityId: memberId, action: "update", before: { role: m.role, modules: m.modules }, after: data });
  return after;
}

export async function removeMember(userId: string, memberId: string) {
  const m = await db.workspaceMember.findUnique({ where: { id: memberId } });
  if (!m) throw new NotFoundError("Membro");
  await requireManager(userId, m.workspaceId);
  if (m.role === "OWNER") throw new AppError("A dona do ambiente não pode ser removida.");
  await db.workspaceMember.delete({ where: { id: memberId } });
  // Encerra o acesso imediatamente: sessões continuam válidas, mas a permissão é checada a cada requisição
  await audit({ userId, workspaceId: m.workspaceId, entity: "WorkspaceMember", entityId: memberId, action: "remove", before: { userId: m.userId, role: m.role } });
}

async function findValidInvitation(token: string) {
  const inv = await db.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { workspace: { select: { id: true, name: true } }, invitedBy: { select: { name: true } } } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

export async function getInvitation(token: string) {
  const inv = await findValidInvitation(token);
  if (!inv) return null;
  const hasAccount = !!(await db.user.findUnique({ where: { email: inv.email }, select: { id: true } }));
  return { email: inv.email, workspace: inv.workspace.name, invitedBy: inv.invitedBy.name, role: inv.role, modules: inv.modules, hasAccount };
}

/** Aceite por quem já tem conta (precisa estar logada com o e-mail convidado). */
export async function acceptInvitation(userId: string, token: string) {
  const inv = await findValidInvitation(token);
  if (!inv) throw new AppError("Convite inválido ou expirado.");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.email !== inv.email) throw new AppError(`Este convite é para ${inv.email}. Entre com essa conta para aceitar.`);
  await db.$transaction([
    db.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
      create: { workspaceId: inv.workspaceId, userId, role: inv.role, modules: inv.modules },
      update: {},
    }),
    db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
  ]);
  await audit({ userId, workspaceId: inv.workspaceId, entity: "Invitation", entityId: inv.id, action: "accept" });
  return inv.workspaceId;
}

/** Cria a conta de quem foi convidado (mesmo com cadastro fechado) e já aceita o convite. */
export async function registerFromInvitation(token: string, input: { name: string; password: string }) {
  const inv = await findValidInvitation(token);
  if (!inv) throw new AppError("Convite inválido ou expirado.");
  const data = z.object({ name: z.string().trim().min(2, "Informe seu nome.").max(100), password: z.string().max(200) }).parse(input);
  const weak = validatePasswordStrength(data.password);
  if (weak) throw new AppError(weak);
  if (await db.user.findUnique({ where: { email: inv.email } })) throw new AppError("Já existe uma conta com este e-mail. Entre e aceite o convite.");
  const passwordHash = await hashPassword(data.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name: data.name, email: inv.email, passwordHash } });
    await tx.workspaceMember.create({ data: { workspaceId: inv.workspaceId, userId: u.id, role: inv.role, modules: inv.modules } });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await tx.notificationPreference.create({ data: { userId: u.id } });
    return u;
  });
  await audit({ userId: user.id, workspaceId: inv.workspaceId, entity: "User", entityId: user.id, action: "register_invited" });
  return user;
}
