"use server";

import { redirect } from "next/navigation";
import { acceptInvitation, registerFromInvitation } from "@/server/team";
import { createSession } from "@/server/auth/sessions";
import { getSession, requestMeta, setSessionCookie } from "@/server/auth/current";
import { errorMessage } from "@/server/errors";

export type InviteState = { error?: string } | undefined;

export async function acceptInviteAction(token: string): Promise<InviteState> {
  const session = await getSession();
  if (!session) redirect(`/login?next=/convite/${token}`);
  try {
    await acceptInvitation(session.user.id, token);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/");
}

export async function registerInviteAction(token: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  let userId: string;
  try {
    userId = (await registerFromInvitation(token, { name: String(formData.get("name") ?? ""), password })).id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  const meta = await requestMeta();
  const { token: sessionToken, expiresAt } = await createSession(userId, meta);
  await setSessionCookie(sessionToken, expiresAt);
  redirect("/");
}
