import { Clapperboard } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { contentReport, listContent, listProfiles, listReferences, profileOverview } from "@/server/content";
import { EmptyState } from "@/components/ui/empty-state";
import { addDaysYmd, endOfMonthYmd, isValidYm, startOfMonthYmd, todayYmd } from "@/lib/dates";
import { ContentClient, type ContentTab } from "./content-client";

export const metadata = { title: "Conteúdo" };

const TABS: ContentTab[] = ["producao", "calendario", "lista", "relatorio", "perfis", "referencias"];
const isYmd = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tz = user.timezone;
  const today = todayYmd(tz);
  const all = await listWorkspaces(user.id);
  const ids = new Set(await accessibleWorkspaceIds(user.id, "content"));
  const workspaces = all.filter((w) => ids.has(w.id));
  if (!workspaces.length) return <EmptyState icon={Clapperboard} title="Sem acesso ao conteúdo" description="Você não tem permissão para o módulo de conteúdo." />;

  const filter = await getWorkspaceFilter(all);
  const tab: ContentTab = TABS.includes(sp.aba as ContentTab) ? (sp.aba as ContentTab) : "producao";
  // O Kanban mostra um ambiente por vez (cada ambiente tem suas etapas); padrão: Mentoria
  const boardWs =
    (sp.ws && ids.has(sp.ws) && sp.ws) ||
    (filter !== "all" && ids.has(filter) ? filter : undefined) ||
    workspaces.find((w) => w.kind === "MENTORIA")?.id ||
    workspaces[0]!.id;
  const scope = tab === "producao" ? boardWs : filter;
  const common = { profileId: sp.perfil || undefined, format: sp.formato || undefined, search: sp.q };

  const [statuses, profiles] = await Promise.all([
    db.contentStatus.findMany({ where: { workspaceId: { in: [...ids] } }, orderBy: { position: "asc" } }),
    listProfiles(user.id, { includeArchived: tab === "perfis" }),
  ]);

  const month = sp.mes && isValidYm(sp.mes) ? sp.mes : today.slice(0, 7);
  const from = isYmd(sp.de) ? sp.de! : startOfMonthYmd(today);
  const to = isYmd(sp.ate) ? sp.ate! : today;

  let items: Awaited<ReturnType<typeof listContent>> = [];
  let report: Awaited<ReturnType<typeof contentReport>> | null = null;
  let references: Awaited<ReturnType<typeof listReferences>> = [];
  let overview: Awaited<ReturnType<typeof profileOverview>> | null = null;

  if (tab === "producao" || tab === "lista") {
    items = await listContent(user.id, { workspace: scope, ...common }, tz);
  } else if (tab === "calendario") {
    // Inclui a semana anterior e a seguinte para preencher a grade
    items = await listContent(user.id, { workspace: scope, ...common, from: addDaysYmd(`${month}-01`, -7), to: addDaysYmd(endOfMonthYmd(`${month}-01`), 7) }, tz);
  } else if (tab === "relatorio") {
    report = await contentReport(user.id, { workspace: scope, profileId: common.profileId, from, to }, tz);
  } else if (tab === "referencias") {
    references = await listReferences(user.id, { workspace: scope, search: sp.q, tag: sp.tag, format: sp.formato });
  } else if (tab === "perfis") {
    const selected = profiles.find((p) => p.id === sp.perfil) ?? profiles.find((p) => !p.archived);
    if (selected) overview = await profileOverview(user.id, selected.id, { from: isYmd(sp.de) ? sp.de! : addDaysYmd(today, -29), to }, tz);
  }

  return (
    <ContentClient
      tab={tab}
      boardWorkspaceId={boardWs}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
      statuses={statuses.map((s) => ({ id: s.id, workspaceId: s.workspaceId, name: s.name, isPublished: s.isPublished, isScheduled: s.isScheduled, isRecordingScheduled: s.isRecordingScheduled }))}
      profiles={profiles}
      items={items}
      report={report}
      references={references}
      overview={overview}
      month={month}
      range={{ from, to }}
      today={today}
      tz={tz}
      openId={sp.c ?? null}
      openNew={sp.novo === "1"}
    />
  );
}
