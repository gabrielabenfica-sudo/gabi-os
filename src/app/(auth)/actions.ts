"use server";

import { redirect } from "next/navigation";
import { authenticate, registerUser } from "@/server/auth/accounts";
import { createSession, invalidateSession } from "@/server/auth/sessions";
import { clearSessionCookie, getSession, requestMeta, setSessionCookie } from "@/server/auth/current";
import { audit } from "@/server/audit";

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // Apenas caminhos internos, para evitar redirecionamento aberto
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const meta = await requestMeta();

  const result = await authenticate(email, password, meta.ip);
  if (!result.ok) return { error: result.error, fields: { email } };

  const { token, expiresAt } = await createSession(result.value.id, meta);
  await setSessionCookie(token, expiresAt);
  await audit({ userId: result.value.id, entity: "Session", entityId: result.value.id, action: "login", after: { ip: meta.ip } });
  redirect(safeNext(formData.get("next")));
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { error: "As senhas não conferem.", fields: { name, email } };

  const result = await registerUser({ name, email, password });
  if (!result.ok) return { error: result.error, fields: { name, email } };

  const meta = await requestMeta();
  const { token, expiresAt } = await createSession(result.value.id, meta);
  await setSessionCookie(token, expiresAt);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await invalidateSession(session.sessionId);
    await audit({ userId: session.user.id, entity: "Session", entityId: session.sessionId, action: "logout" });
  }
  await clearSessionCookie();
  redirect("/login");
}
