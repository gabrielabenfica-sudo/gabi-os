"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as google from "@/server/integrations/google-calendar";
import * as meta from "@/server/integrations/meta";

async function act<T>(fn: (userId: string, tz: string) => Promise<T>, message?: string) {
  const u = await requireUser();
  const r = await run(() => fn(u.id, u.timezone), message);
  revalidatePath("/", "layout");
  return r;
}

export const updateCalendarAction = async (id: string, input: { selected?: boolean; workspaceId?: string | null }) => act((u) => google.updateExternalCalendar(u, id, input).then(() => null), "Calendário atualizado.");
export const refreshCalendarsAction = async (connectionId: string) => act((u) => google.refreshCalendarList(u, connectionId), "Lista de calendários atualizada.");
export const syncGoogleAction = async (connectionId: string) => act((u, tz) => google.syncGoogleConnection(u, connectionId, tz), "Sincronização concluída.");
export const disconnectGoogleAction = async (connectionId: string) => act((u) => google.disconnectGoogle(u, connectionId), "Google Calendar desconectado.");
export const linkProfileAction = async (profileId: string, igUserId: string | null) => act((u) => meta.linkProfile(u, profileId, igUserId).then(() => null), igUserId ? "Perfil ligado ao Instagram." : "Perfil desligado.");
export const syncInstagramAction = async () => act((u, tz) => meta.syncAllInstagram(u, tz), "Instagram sincronizado.");
export const disconnectMetaAction = async () => act((u) => meta.disconnectMeta(u), "Meta desconectada.");

/** Chamada ao abrir a agenda: sincroniza o Google se a última vez foi há mais de 10 min. */
export async function syncCalendarsIfStaleAction() {
  const u = await requireUser();
  const r = await run(() => google.syncGoogleIfStale(u.id, u.timezone));
  return r.ok ? r.data : { synced: false, changed: false };
}
