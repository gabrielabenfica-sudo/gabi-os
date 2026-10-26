"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, FileDown, Film, LayoutList, Plus, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form-controls";
import { Checkbox, EmptyState, LinkTabs, PageHeader, WsDot } from "@/components/ui/misc";
import { Kanban } from "@/components/kanban";
import { CONTENT_FORMATS, engagementRate, formatLabel } from "@/lib/content";
import { addDaysYmd, addMonthsYm, formatYm, startOfWeekYmd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ContentCard, contentReport, listReferences, profileOverview } from "@/server/content";
import { br, partsInTz, type ContentStatusOption, type ContentWs, type ProfileRow } from "./shared";
import { moveContentAction, rescheduleContentAction } from "./actions";
import { ContentDialog, StatusesDialog } from "./content-dialog";
import { ReportTab } from "./report-tab";
import { ProfilesTab } from "./profiles-tab";
import { ReferencesTab } from "./references-tab";

export type ContentTab = "producao" | "calendario" | "lista" | "relatorio" | "perfis" | "referencias";

export function ContentClient({
  tab, boardWorkspaceId, workspaces, statuses, profiles, items, report, references, overview, month, range, today, tz, openId, openNew,
}: {
  tab: ContentTab; boardWorkspaceId: string; workspaces: ContentWs[]; statuses: ContentStatusOption[]; profiles: ProfileRow[]; items: ContentCard[];
  report: Awaited<ReturnType<typeof contentReport>> | null; references: Awaited<ReturnType<typeof listReferences>>; overview: Awaited<ReturnType<typeof profileOverview>> | null;
  month: string; range: { from: string; to: string }; today: string; tz: string; openId: string | null; openNew: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const [dialog, setDialog] = React.useState<{ kind: "item"; id?: string; preset?: { statusId?: string; publishDate?: string; workspaceId?: string } } | { kind: "statuses" } | null>(
    openId ? { kind: "item", id: openId } : openNew ? { kind: "item" } : null,
  );

  // Navegar para ?c=… (busca, referências) com a página já aberta também abre o conteúdo
  React.useEffect(() => {
    if (openId) setDialog({ kind: "item", id: openId });
    else if (openNew) setDialog({ kind: "item" });
  }, [openId, openNew]);

  const href = React.useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
      const qs = p.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname],
  );
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) router.replace(href({ q: search || null }), { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabHref = (t: ContentTab) => {
    const p = new URLSearchParams();
    if (t !== "producao") p.set("aba", t);
    if (params.get("ws")) p.set("ws", params.get("ws")!);
    return p.toString() ? `${pathname}?${p}` : pathname;
  };
  const boardStatuses = statuses.filter((s) => s.workspaceId === boardWorkspaceId);
  const openItem = (id: string) => setDialog({ kind: "item", id });
  const closeDialog = () => {
    setDialog(null);
    if (params.get("c") || params.get("novo")) window.history.replaceState(null, "", href({ c: null, novo: null }));
  };
  const showFilters = tab === "producao" || tab === "lista" || tab === "calendario";

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Conteúdo"
        description="Produção, calendário editorial, perfis e resultados."
        actions={
          <>
            {tab === "producao" && <Button variant="outline" onClick={() => setDialog({ kind: "statuses" })}><Columns3 /> Etapas</Button>}
            {tab !== "lista" && <Button variant="outline" asChild><Link href={tabHref("lista")}><FileDown /> Exportar roteiros</Link></Button>}
            <Button onClick={() => setDialog({ kind: "item", preset: { workspaceId: boardWorkspaceId } })}><Plus /> Novo conteúdo</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <LinkTabs
          current={tab}
          tabs={[
            { key: "producao", label: "Produção", href: tabHref("producao") },
            { key: "calendario", label: "Calendário", href: tabHref("calendario") },
            { key: "lista", label: "Lista", href: tabHref("lista") },
            { key: "relatorio", label: "Relatório", href: tabHref("relatorio") },
            { key: "perfis", label: "Perfis", href: tabHref("perfis") },
            { key: "referencias", label: "Referências", href: tabHref("referencias") },
          ]}
        />
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {tab === "producao" && workspaces.length > 1 && (
            <Select aria-label="Ambiente do quadro" value={boardWorkspaceId} onChange={(e) => router.replace(href({ ws: e.target.value }))} className="w-48">
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" aria-label="Buscar conteúdo" className="w-52 pl-8" />
          </div>
          <Select aria-label="Perfil" value={params.get("perfil") ?? ""} onChange={(e) => router.replace(href({ perfil: e.target.value || null }))} className="w-44">
            <option value="">Todos os perfis</option>
            {profiles.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>@{p.username}</option>)}
          </Select>
          <Select aria-label="Formato" value={params.get("formato") ?? ""} onChange={(e) => router.replace(href({ formato: e.target.value || null }))} className="w-40">
            <option value="">Todos os formatos</option>
            {CONTENT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </div>
      )}

      {tab === "producao" && (
        <Kanban
          testId="content-board"
          columns={boardStatuses.map((s) => ({ id: s.id, name: s.name, tone: s.isPublished ? ("done" as const) : undefined }))}
          items={items}
          columnOf={(i) => i.statusId}
          itemLabel={(i) => i.title}
          addLabel="Novo conteúdo"
          onAdd={(statusId) => setDialog({ kind: "item", preset: { statusId, workspaceId: boardWorkspaceId } })}
          onOpen={openItem}
          onMove={async (id, statusId, index) => {
            const r = await moveContentAction(id, statusId, index);
            if (!r.ok) {
              toast.error(r.error);
              router.refresh();
            }
            return r.ok;
          }}
          renderCard={(i, { dragging }) => <ContentCardView item={i} tz={tz} dragging={dragging} />}
        />
      )}
      {tab === "lista" && <ContentList items={items} tz={tz} onOpen={openItem} />}
      {tab === "calendario" && <EditorialCalendar items={items} month={month} today={today} tz={tz} href={href} onOpen={openItem} onCreate={(day) => setDialog({ kind: "item", preset: { publishDate: day, workspaceId: boardWorkspaceId } })} />}
      {tab === "relatorio" && report && <ReportTab report={report} profiles={profiles} range={range} href={href} tz={tz} />}
      {tab === "perfis" && <ProfilesTab profiles={profiles} overview={overview} workspaces={workspaces} range={range} today={today} href={href} />}
      {tab === "referencias" && <ReferencesTab references={references} workspaces={workspaces} profiles={profiles} defaultWorkspaceId={boardWorkspaceId} href={href} />}

      {dialog?.kind === "item" && (
        <ContentDialog
          key={dialog.id ?? "new"}
          id={dialog.id}
          preset={dialog.preset}
          workspaces={workspaces}
          statuses={statuses}
          profiles={profiles.filter((p) => !p.archived)}
          today={today}
          tz={tz}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "statuses" && <StatusesDialog workspaceId={boardWorkspaceId} statuses={boardStatuses} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ContentCardView({ item, tz, dragging }: { item: ContentCard; tz: string; dragging?: boolean }) {
  const metric = item.metrics[0];
  const eng = metric ? engagementRate(metric) : null;
  return (
    <div className={cn("grid cursor-pointer gap-1.5 rounded-lg border border-border bg-card p-3 text-left shadow-[0_1px_2px_rgba(55,48,57,0.05)]", dragging ? "rotate-1 shadow-lg ring-2 ring-ring/40" : "hover:shadow-md")}>
      <p className="text-sm font-medium leading-snug">{item.title}</p>
      <div className="flex flex-wrap gap-1">
        {item.format && <Badge>{formatLabel(item.format)}</Badge>}
        {item.profile && <Badge variant="outline">@{item.profile.username}</Badge>}
      </div>
      <div className="grid gap-0.5 text-xs text-muted-foreground">
        {item.recordingDate && <span className="flex items-center gap-1"><Film className="size-3" /> Gravação {br(partsInTz(item.recordingDate, tz).ymd).slice(0, 5)} {partsInTz(item.recordingDate, tz).hm}</span>}
        {item.publishDate && !item.publishedAt && <span className="flex items-center gap-1"><Send className="size-3" /> Publicação {br(partsInTz(item.publishDate, tz).ymd).slice(0, 5)}</span>}
        {item.publishedAt && <span className="flex items-center gap-1"><Send className="size-3" /> Publicado {br(partsInTz(item.publishedAt, tz).ymd).slice(0, 5)}{eng !== null ? ` · ${eng.toLocaleString("pt-BR")}% engaj.` : ""}</span>}
      </div>
    </div>
  );
}

/** Link da página de PDF com os roteiros escolhidos, na ordem da lista. */
export function scriptsPdfHref(ids: string[]) {
  return `/imprimir/roteiros?ids=${ids.map(encodeURIComponent).join(",")}`;
}

function ContentList({ items, tz, onOpen }: { items: ContentCard[]; tz: string; onOpen: (id: string) => void }) {
  // Seleção para exportar roteiros; some sozinha quando o item sai da lista (filtro/busca)
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const visible = items.filter((i) => picked.has(i.id));
  const allOn = items.length > 0 && visible.length === items.length;
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  if (!items.length) return <EmptyState icon={LayoutList} title="Nenhum conteúdo" description="Crie ideias e acompanhe cada etapa até a publicação." />;
  return (
    <div className="grid gap-2">
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm" data-testid="scripts-export-bar">
        {visible.length ? (
          <>
            <span className="font-medium" data-testid="selected-count">{visible.length} {visible.length === 1 ? "selecionado" : "selecionados"}</span>
            <Button size="sm" asChild>
              <a href={scriptsPdfHref(visible.map((i) => i.id))} target="_blank" rel="noreferrer" data-testid="export-scripts"><FileDown /> Exportar roteiros em PDF</a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}><X /> Limpar seleção</Button>
          </>
        ) : (
          <span className="text-muted-foreground">Marque os conteúdos para exportar os roteiros juntos em um PDF.</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2">
              <Checkbox
                aria-label={allOn ? "Desmarcar todos" : "Selecionar todos"}
                checked={allOn}
                ref={(el) => {
                  if (el) el.indeterminate = visible.length > 0 && !allOn;
                }}
                onChange={() => setPicked(allOn ? new Set() : new Set(items.map((i) => i.id)))}
              />
            </th>
            <th className="px-3 py-2 font-medium">Título</th>
            <th className="px-3 py-2 font-medium">Etapa</th>
            <th className="px-3 py-2 font-medium">Formato</th>
            <th className="px-3 py-2 font-medium">Perfil</th>
            <th className="px-3 py-2 font-medium">Gravação</th>
            <th className="px-3 py-2 font-medium">Publicação</th>
            <th className="px-3 py-2 text-right font-medium">Engaj.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const m = i.metrics[0];
            const eng = m ? engagementRate(m) : null;
            const pub = i.publishedAt ?? i.publishDate;
            return (
              <tr key={i.id} className={cn("cursor-pointer border-t border-border hover:bg-accent/50", picked.has(i.id) && "bg-accent/40")} onClick={() => onOpen(i.id)} data-row={i.title}>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <Checkbox aria-label={`Selecionar ${i.title}`} checked={picked.has(i.id)} onChange={() => toggle(i.id)} />
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2"><WsDot color={i.workspace.color} /><button type="button" className="text-left font-medium hover:underline">{i.title}</button></span>
                </td>
                <td className="px-3 py-2"><Badge variant={i.status.isPublished ? "success" : "default"}>{i.status.name}</Badge></td>
                <td className="px-3 py-2">{i.format ? formatLabel(i.format) : "—"}</td>
                <td className="px-3 py-2">{i.profile ? `@${i.profile.username}` : "—"}</td>
                <td className="px-3 py-2 tabular">{i.recordingDate ? br(partsInTz(i.recordingDate, tz).ymd) : "—"}</td>
                <td className="px-3 py-2 tabular">{pub ? br(partsInTz(pub, tz).ymd) : "—"}</td>
                <td className="px-3 py-2 text-right tabular">{eng !== null ? `${eng.toLocaleString("pt-BR")}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Calendário editorial: gravações e publicações do mês; arraste para reagendar. */
function EditorialCalendar({
  items, month, today, tz, href, onOpen, onCreate,
}: { items: ContentCard[]; month: string; today: string; tz: string; href: (p: Record<string, string | null>) => string; onOpen: (id: string) => void; onCreate: (day: string) => void }) {
  const router = useRouter();
  const start = startOfWeekYmd(`${month}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDaysYmd(start, i));
  const weeks = days.slice(35).every((d) => d.slice(0, 7) !== month) ? days.slice(0, 35) : days;
  type Entry = { item: ContentCard; kind: "RECORDING" | "PUBLISH"; hm: string };
  const byDay = new Map<string, Entry[]>();
  for (const it of items) {
    const add = (date: Date | null, kind: Entry["kind"]) => {
      if (!date) return;
      const p = partsInTz(date, tz);
      byDay.set(p.ymd, [...(byDay.get(p.ymd) ?? []), { item: it, kind, hm: p.hm }]);
    };
    add(it.recordingDate, "RECORDING");
    add(it.publishedAt ?? it.publishDate, "PUBLISH");
  }
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => router.replace(href({ mes: addMonthsYm(month, -1) }))}><ChevronLeft /></Button>
        <h2 className="min-w-40 text-center font-semibold capitalize">{formatYm(month)}</h2>
        <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => router.replace(href({ mes: addMonthsYm(month, 1) }))}><ChevronRight /></Button>
        <Button variant="ghost" size="sm" onClick={() => router.replace(href({ mes: null }))}>Hoje</Button>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Film className="size-3.5" /> Gravação</span>
          <span className="flex items-center gap-1"><Send className="size-3.5" /> Publicação</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-xl border border-border" data-testid="editorial-calendar">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">{d}</div>)}
          {weeks.map((d) => {
            const entries = (byDay.get(d) ?? []).sort((a, b) => a.hm.localeCompare(b.hm));
            const out = d.slice(0, 7) !== month;
            return (
              <div
                key={d}
                data-day={d}
                className={cn("group min-h-28 border-t border-l border-border p-1.5 [&:nth-child(7n+1)]:border-l-0", out && "bg-muted/30", dragOver === d && "bg-accent")}
                onDragOver={(e) => { e.preventDefault(); setDragOver(d); }}
                onDragLeave={() => setDragOver((x) => (x === d ? null : x))}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const [id, field] = e.dataTransfer.getData("text/plain").split("|");
                  if (!id || (field !== "recordingDate" && field !== "publishDate")) return;
                  const r = await rescheduleContentAction(id, field, d);
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn("grid size-6 place-items-center rounded-full text-xs", d === today ? "bg-primary font-semibold text-primary-foreground" : out ? "text-muted-foreground" : "")}>{Number(d.slice(8, 10))}</span>
                  <button type="button" className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-card group-hover:opacity-100 focus:opacity-100" aria-label={`Novo conteúdo em ${br(d)}`} onClick={() => onCreate(d)}>
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <ul className="grid gap-1">
                  {entries.map((e) => {
                    const published = e.kind === "PUBLISH" && !!e.item.publishedAt;
                    return (
                      <li key={`${e.item.id}-${e.kind}`}>
                        <button
                          type="button"
                          draggable={!published}
                          onDragStart={(ev) => ev.dataTransfer.setData("text/plain", `${e.item.id}|${e.kind === "RECORDING" ? "recordingDate" : "publishDate"}`)}
                          onClick={() => onOpen(e.item.id)}
                          className={cn(
                            "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px]",
                            e.kind === "RECORDING" ? "bg-info-soft text-foreground" : published ? "bg-success-soft text-foreground" : "bg-brand-soft/60 text-foreground",
                          )}
                          title={`${e.kind === "RECORDING" ? "Gravação" : published ? "Publicado" : "Publicação"}: ${e.item.title}`}
                        >
                          {e.kind === "RECORDING" ? <Film className="size-3 shrink-0" /> : <Send className="size-3 shrink-0" />}
                          <span className="truncate">{e.item.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {items.length === 0 && <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" /> Nada programado neste mês. Defina datas de gravação e publicação nos conteúdos.</p>}
    </div>
  );
}

