import type { MemberRole, WorkspaceKind } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

/** Módulos que exigem permissão explícita para quem não é dona do ambiente. */
export const MODULES = [
  "tasks",
  "calendar",
  "notes",
  "goals",
  "habits",
  "finance",
  "crm",
  "mentees",
  "content",
] as const;
export type ModuleKey = (typeof MODULES)[number];

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para acessar este recurso.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  color: string;
  position: number;
  role: MemberRole;
};

export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { workspace: { position: "asc" } },
  });
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    kind: m.workspace.kind,
    color: m.workspace.color,
    position: m.workspace.position,
    role: m.role,
  }));
}

const WRITE_ROLES: MemberRole[] = ["OWNER", "ADMIN", "EDITOR"];

/**
 * Autorização no servidor. Deve ser chamada antes de qualquer leitura ou
 * escrita de dados de um ambiente. OWNER e ADMIN acessam todos os módulos;
 * EDITOR e VIEWER só os módulos listados explicitamente em `modules`.
 */
export async function requireWorkspaceAccess(
  userId: string,
  workspaceId: string,
  opts: { module?: ModuleKey; write?: boolean } = {},
) {
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
  if (!member) throw new ForbiddenError();
  const fullAccess = member.role === "OWNER" || member.role === "ADMIN";
  if (opts.module && !fullAccess && !member.modules.includes(opts.module)) throw new ForbiddenError();
  if (opts.write && !WRITE_ROLES.includes(member.role)) throw new ForbiddenError();
  return member;
}

/** Ambientes que a usuária pode ver para um módulo, opcionalmente filtrados. */
export async function accessibleWorkspaceIds(
  userId: string,
  module: ModuleKey,
  filter: string | "all" = "all",
): Promise<string[]> {
  const memberships = await db.workspaceMember.findMany({ where: { userId } });
  return memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN" || m.modules.includes(module))
    .map((m) => m.workspaceId)
    .filter((id) => filter === "all" || id === filter);
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome.").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
});

export async function updateWorkspace(userId: string, workspaceId: string, input: unknown) {
  const member = await requireWorkspaceAccess(userId, workspaceId, { write: true });
  if (member.role !== "OWNER" && member.role !== "ADMIN") throw new ForbiddenError();
  const data = updateSchema.parse(input);
  const updated = await db.workspace.update({ where: { id: workspaceId }, data });
  await audit({
    userId,
    workspaceId,
    entity: "Workspace",
    entityId: workspaceId,
    action: "update",
    before: { name: member.workspace.name, color: member.workspace.color },
    after: data,
  });
  return updated;
}

export async function reorderWorkspaces(userId: string, orderedIds: string[]) {
  const owned = await db.workspace.findMany({ where: { ownerId: userId }, select: { id: true } });
  const ownedIds = new Set(owned.map((w) => w.id));
  if (orderedIds.length !== ownedIds.size || !orderedIds.every((id) => ownedIds.has(id))) {
    throw new ForbiddenError("Lista de ambientes inválida.");
  }
  await db.$transaction(orderedIds.map((id, position) => db.workspace.update({ where: { id }, data: { position } })));
}

export const WORKSPACE_FILTER_COOKIE = "gabi_ws";
