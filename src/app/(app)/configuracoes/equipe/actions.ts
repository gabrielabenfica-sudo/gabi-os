"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as team from "@/server/team";

async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function act<T>(fn: (userId: string) => Promise<T>, message?: string) {
  const u = await requireUser();
  const r = await run(() => fn(u.id), message);
  if (r.ok) revalidatePath("/configuracoes/equipe");
  return r;
}

export const inviteAction = async (input: { workspaceId: string; email: string; role: string; modules: string[] }) => {
  const url = await appUrl();
  return act((u) => team.inviteMember(u, input as Parameters<typeof team.inviteMember>[1], url), "Convite criado.");
};
export const revokeInviteAction = async (id: string) => act((u) => team.revokeInvitation(u, id), "Convite cancelado.");
export const updateMemberAction = async (id: string, input: { role: string; modules: string[] }) => act((u) => team.updateMember(u, id, input).then(() => null), "Permissões salvas.");
export const removeMemberAction = async (id: string) => act((u) => team.removeMember(u, id), "Acesso removido.");
