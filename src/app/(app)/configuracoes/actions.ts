"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/current";
import { changePassword } from "@/server/auth/accounts";
import { invalidateOtherSessions } from "@/server/auth/sessions";
import { revokeSession, updateProfile } from "@/server/settings";
import { ForbiddenError, reorderWorkspaces, updateWorkspace } from "@/server/workspaces";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function toError(error: unknown): ActionResult {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos." };
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "Não foi possível salvar. Tente novamente." };
}

export async function updateProfileAction(input: {
  name: string;
  timezone: string;
  appName: string;
  theme: "LIGHT" | "DARK" | "SYSTEM";
}): Promise<ActionResult> {
  const { user } = await requireSession();
  try {
    await updateProfile(user.id, input);
    revalidatePath("/", "layout");
    return { ok: true, message: "Perfil atualizado." };
  } catch (e) {
    return toError(e);
  }
}

export async function updateWorkspaceAction(workspaceId: string, input: { name: string; color: string }): Promise<ActionResult> {
  const { user } = await requireSession();
  try {
    await updateWorkspace(user.id, workspaceId, input);
    revalidatePath("/", "layout");
    return { ok: true, message: "Ambiente atualizado." };
  } catch (e) {
    return toError(e);
  }
}

export async function reorderWorkspacesAction(ids: string[]): Promise<ActionResult> {
  const { user } = await requireSession();
  try {
    await reorderWorkspaces(user.id, ids);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function changePasswordAction(input: {
  current: string;
  next: string;
  confirm: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  if (input.next !== input.confirm) return { ok: false, error: "As senhas não conferem." };
  const result = await changePassword(session.user.id, input.current, input.next);
  if (!result.ok) return { ok: false, error: result.error };
  // Por segurança, encerra as outras sessões ao trocar a senha
  const count = await invalidateOtherSessions(session.user.id, session.sessionId);
  revalidatePath("/configuracoes");
  return { ok: true, message: count ? `Senha alterada. ${count} outra(s) sessão(ões) encerrada(s).` : "Senha alterada." };
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (sessionId === session.sessionId) return { ok: false, error: "Use “Sair” para encerrar a sessão atual." };
  await revokeSession(session.user.id, sessionId);
  revalidatePath("/configuracoes");
  return { ok: true, message: "Sessão encerrada." };
}

export async function revokeOtherSessionsAction(): Promise<ActionResult> {
  const session = await requireSession();
  const count = await invalidateOtherSessions(session.user.id, session.sessionId);
  revalidatePath("/configuracoes");
  return { ok: true, message: count ? `${count} sessão(ões) encerrada(s).` : "Não havia outras sessões." };
}
