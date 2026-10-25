import type { listProfiles } from "@/server/content";

export type ContentWs = { id: string; name: string; color: string; kind: string };
export type ContentStatusOption = { id: string; workspaceId: string; name: string; isPublished: boolean; isScheduled: boolean; isRecordingScheduled: boolean };
export type ProfileRow = Awaited<ReturnType<typeof listProfiles>>[number];
export type Href = (patch: Record<string, string | null>) => string;

/** Data e hora de parede no fuso informado. */
export function partsInTz(date: Date | string, tz: string) {
  const d = new Date(date);
  return {
    ymd: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
    hm: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d),
  };
}

export const br = (ymd: string) => ymd.split("-").reverse().join("/");
export const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));
