"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, CalendarClock, Columns3, MessageSquare, Phone, Plus, Search, Trash2, UserCheck, Users, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, PageHeader, Segmented } from "@/components/ui/misc";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import { Money, MoneyInput } from "@/components/finance/money-input";
import { Kanban } from "@/components/kanban";
import { formatBRL, splitInstallments } from "@/lib/money";
import { addMonthsYmd, formatDateTimeBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { LeadCard, getLead } from "@/server/crm";
import {
  addLeadActivityAction, convertLeadAction, createLeadAction, createStageAction, deleteLeadAction, deleteLeadActivityAction, deleteStageAction, getLeadAction,
  markLeadLostAction, moveLeadAction, renameStageAction, reorderStagesAction, updateLeadAction,
} from "../actions";

type Stage = { id: string; name: string; isWon: boolean; isLost: boolean };
type Program = { id: string; name: string; priceCents: number | null; durationWeeks: number | null; active: boolean };
type Metrics = {
  newLeads: number; won: number; lost: number; conversionRate: number | null; openLeads: number; pipelineCents: number; avgCycleDays: number | null; overdueActions: number;
  byStage: { id: string; name: string; count: number }[]; sources: { name: string; count: number }[];
};
type LeadDetail = Awaited<ReturnType<typeof getLead>>;

const ymd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const br = (s: string) => s.split("-").reverse().join("/");
const ACTIVITY = { NOTE: { label: "Anotação", icon: MessageSquare }, CALL: { label: "Ligação", icon: Phone }, MESSAGE: { label: "Mensagem", icon: MessageSquare }, MEETING: { label: "Reunião", icon: Video }, STAGE_CHANGE: { label: "Etapa", icon: Columns3 } } as const;

export function CrmClient({
  workspaceId, stages, leads, metrics, range, sources, programs, accounts, canFinance, today, openLeadId, openNew,
}: {
  workspaceId: string; stages: Stage[]; leads: LeadCard[]; metrics: Metrics; range: { from: string; to: string }; sources: string[]; programs: Program[];
  accounts: { id: string; name: string }[]; canFinance: boolean; today: string; openLeadId: string | null; openNew: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const [dialog, setDialog] = React.useState<{ kind: "lead"; id?: string; stageId?: string } | { kind: "stages" } | null>(
    openLeadId ? { kind: "lead", id: openLeadId } : openNew ? { kind: "lead" } : null,
  );

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

  const columns = React.useMemo(
    () =>
      stages.map((s) => {
        const items = leads.filter((l) => l.stageId === s.id);
        const total = items.reduce((a, l) => a + (l.potentialCents ?? 0), 0);
        return { id: s.id, name: s.name, tone: s.isWon ? ("won" as const) : s.isLost ? ("lost" as const) : undefined, footer: total ? formatBRL(total) : undefined };
      }),
    [stages, leads],
  );

  const closeDialog = () => {
    setDialog(null);
    if (params.get("lead") || params.get("novo")) window.history.replaceState(null, "", href({ lead: null, novo: null }));
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="CRM"
        description="Funil de vendas da Mentoria: do primeiro contato à venda."
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog({ kind: "stages" })}><Columns3 /> Etapas</Button>
            <Button onClick={() => setDialog({ kind: "lead" })}><Plus /> Novo lead</Button>
          </>
        }
      />

      <section aria-label="Indicadores do funil" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Período</span>
          <Input type="date" aria-label="De" value={range.from} className="h-8 w-40" onChange={(e) => e.target.value && router.replace(href({ de: e.target.value }))} />
          <span className="text-muted-foreground">a</span>
          <Input type="date" aria-label="Até" value={range.to} className="h-8 w-40" onChange={(e) => e.target.value && router.replace(href({ ate: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Novos leads" value={String(metrics.newLeads)} />
          <Stat label="Vendas" value={String(metrics.won)} hint={`${metrics.lost} perdido(s)`} />
          <Stat label="Conversão" value={metrics.conversionRate === null ? "—" : `${metrics.conversionRate.toLocaleString("pt-BR")}%`} hint="ganhos ÷ (ganhos + perdidos)" />
          <Stat label="Em negociação" value={formatBRL(metrics.pipelineCents)} hint={`${metrics.openLeads} lead(s) em aberto`} />
          <Stat label="Ciclo médio" value={metrics.avgCycleDays === null ? "—" : `${metrics.avgCycleDays} dia(s)`} hint="do cadastro à venda" />
          <Stat label="Ações atrasadas" value={String(metrics.overdueActions)} tone={metrics.overdueActions ? "danger" : undefined} />
        </div>
        {metrics.sources.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Origem dos novos leads: {metrics.sources.map((s) => `${s.name} (${s.count})`).join(" · ")}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar lead" aria-label="Buscar lead" className="w-56 pl-8" />
        </div>
        <Select aria-label="Origem" value={params.get("origem") ?? ""} onChange={(e) => router.replace(href({ origem: e.target.value || null }))} className="w-44">
          <option value="">Todas as origens</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={params.get("fechados") === "1"} onChange={(e) => router.replace(href({ fechados: e.target.checked ? "1" : null }))} /> Mostrar fechados antigos
        </label>
      </div>

      {leads.length === 0 && !search && !params.get("origem") ? (
        <Card className="grid place-items-center gap-2 p-10 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="font-medium">Nenhum lead ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">Cadastre o primeiro contato interessado na mentoria e acompanhe cada etapa até a venda.</p>
          <Button className="mt-2" onClick={() => setDialog({ kind: "lead" })}><Plus /> Novo lead</Button>
        </Card>
      ) : (
        <Kanban
          testId="crm-board"
          columns={columns}
          items={leads}
          columnOf={(l) => l.stageId}
          itemLabel={(l) => l.name}
          addLabel="Novo lead"
          onAdd={(stageId) => setDialog({ kind: "lead", stageId })}
          onOpen={(id) => setDialog({ kind: "lead", id })}
          onMove={async (id, stageId, index) => {
            const r = await moveLeadAction(id, stageId, index);
            if (!r.ok) {
              toast.error(r.error);
              router.refresh();
            }
            return r.ok;
          }}
          renderCard={(l, { dragging }) => <LeadCardView lead={l} today={today} dragging={dragging} />}
        />
      )}

      {dialog?.kind === "lead" && (
        <LeadDialog
          key={dialog.id ?? "new"}
          workspaceId={workspaceId}
          leadId={dialog.id}
          defaultStageId={dialog.stageId}
          stages={stages}
          programs={programs}
          accounts={accounts}
          sources={sources}
          canFinance={canFinance}
          today={today}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "stages" && <StagesDialog workspaceId={workspaceId} stages={stages} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function LeadCardView({ lead, today, dragging }: { lead: LeadCard; today: string; dragging?: boolean }) {
  const next = lead.nextActionDate ? ymd(lead.nextActionDate) : null;
  const overdue = next && next < today && !lead.stage.isWon && !lead.stage.isLost;
  return (
    <div className={cn("grid cursor-pointer gap-1.5 rounded-lg border border-border bg-card p-3 text-left shadow-[0_1px_2px_rgba(55,48,57,0.05)]", dragging ? "rotate-1 shadow-lg ring-2 ring-ring/40" : "hover:shadow-md")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{lead.name}</p>
        {lead.potentialCents ? <Money cents={lead.potentialCents} className="text-xs text-muted-foreground" /> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {lead.source && <Badge variant="outline">{lead.source}</Badge>}
        {lead.program && <Badge>{lead.program.name}</Badge>}
        {lead.mentee && <Badge variant="success"><UserCheck className="size-3" /> Mentorado</Badge>}
        {lead.stage.isLost && lead.lostReason && <Badge variant="outline">{lead.lostReason}</Badge>}
      </div>
      {(lead.nextAction || next) && (
        <p className={cn("flex items-center gap-1 text-xs", overdue ? "text-danger" : "text-muted-foreground")}>
          <CalendarClock className="size-3.5" />
          {lead.nextAction ?? "Próxima ação"}
          {next && ` · ${br(next).slice(0, 5)}`}
          {overdue && " (atrasada)"}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Lead: cadastro, histórico, conversão e perda
// ═══════════════════════════════════════════════════════════════

function LeadDialog({
  workspaceId, leadId, defaultStageId, stages, programs, accounts, sources, canFinance, today, onClose,
}: {
  workspaceId: string; leadId?: string; defaultStageId?: string; stages: Stage[]; programs: Program[]; accounts: { id: string; name: string }[];
  sources: string[]; canFinance: boolean; today: string; onClose: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [lead, setLead] = React.useState<LeadDetail | null>(null);
  const [loading, setLoading] = React.useState(Boolean(leadId));
  const [tab, setTab] = React.useState<"dados" | "historico">("dados");
  const [converting, setConverting] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!leadId) return;
    const r = await getLeadAction(leadId);
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      onClose();
      return;
    }
    setLead(r.data);
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return null;
  const stage = lead ? stages.find((s) => s.id === lead.stageId) : null;
  const activeSale = lead?.sales.find((s) => s.status === "ACTIVE");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? lead.name : "Novo lead"}</DialogTitle>
          <DialogDescription>{lead ? `Etapa: ${stage?.name ?? "—"} · cadastrado em ${br(ymd(lead.createdAt))}` : "Quem demonstrou interesse na mentoria."}</DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented ariaLabel="Seções do lead" size="sm" value={tab} onChange={setTab} options={[{ value: "dados", label: "Dados" }, { value: "historico", label: `Histórico (${lead.activities.length})` }]} />
            <div className="ml-auto flex flex-wrap gap-2">
              {lead.mentee && <Button size="sm" variant="outline" asChild><Link href={`/mentoria/mentorados/${lead.mentee.id}`}><UserCheck /> Ver mentorado</Link></Button>}
              {!activeSale && canFinance && <Button size="sm" onClick={() => setConverting(true)}><UserCheck /> Registrar venda</Button>}
              {!stage?.isLost && !activeSale && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const reason = await prompt({ title: "Marcar como perdido", label: "Motivo (opcional)", placeholder: "Ex.: sem orçamento agora", confirmLabel: "Marcar como perdido" });
                    if (reason === null) return;
                    const r = await markLeadLostAction(lead.id, reason);
                    if (!r.ok) return toast.error(r.error);
                    toast.success(r.message);
                    onClose();
                  }}
                >
                  <XCircle /> Perdido
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label="Excluir lead"
                onClick={async () => {
                  if (!(await confirm({ title: "Excluir lead?", description: "O lead sai do funil. Vendas já registradas continuam no financeiro.", danger: true, confirmLabel: "Excluir" }))) return;
                  const r = await deleteLeadAction(lead.id);
                  if (!r.ok) return toast.error(r.error);
                  toast.success(r.message);
                  onClose();
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        )}

        {activeSale && (
          <p className="rounded-lg bg-success-soft/50 px-3 py-2 text-sm">
            Venda de {formatBRL(activeSale.totalCents)} registrada em {br(ymd(activeSale.saleDate))}.{" "}
            <Link className="underline" href={`/financas/mentoria?aba=vendas&venda=${activeSale.id}`}>Ver no financeiro</Link>
          </p>
        )}

        {tab === "dados" ? (
          <LeadForm
            workspaceId={workspaceId}
            lead={lead}
            defaultStageId={defaultStageId}
            stages={stages}
            programs={programs}
            sources={sources}
            onSaved={async (id) => {
              if (!lead) {
                onClose();
                router.refresh();
              } else {
                await load();
              }
              void id;
            }}
            onCancel={onClose}
          />
        ) : (
          lead && <Activities lead={lead} onChange={load} />
        )}

        {converting && lead && (
          <ConvertDialog lead={lead} programs={programs} accounts={accounts} today={today} onClose={() => setConverting(false)} onDone={() => { setConverting(false); onClose(); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LeadForm({
  workspaceId, lead, defaultStageId, stages, programs, sources, onSaved, onCancel,
}: {
  workspaceId: string; lead: LeadDetail | null; defaultStageId?: string; stages: Stage[]; programs: Program[]; sources: string[]; onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [v, setV] = React.useState({
    name: lead?.name ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    instagram: lead?.instagram ?? "",
    source: lead?.source ?? "",
    interest: lead?.interest ?? "",
    programId: lead?.programId ?? "",
    potentialCents: lead?.potentialCents ?? (null as number | null),
    stageId: lead?.stageId ?? defaultStageId ?? stages[0]?.id ?? "",
    nextAction: lead?.nextAction ?? "",
    nextActionDate: ymd(lead?.nextActionDate),
    owner: lead?.owner ?? "",
    notes: lead?.notes ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const openStages = stages.filter((s) => !s.isWon || s.id === v.stageId);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const input = {
          ...v,
          programId: v.programId || null,
          nextActionDate: v.nextActionDate || null,
        };
        const r = lead ? await updateLeadAction(lead.id, input) : await createLeadAction({ ...input, workspaceId });
        setSaving(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        onSaved(lead?.id ?? (r.data as string));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="ld-name" className="sm:col-span-2"><Input id="ld-name" value={v.name} onChange={(e) => set("name", e.target.value)} required autoFocus={!lead} maxLength={120} /></Field>
        <Field label="Instagram" htmlFor="ld-ig"><Input id="ld-ig" value={v.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@usuario" maxLength={60} /></Field>
        <Field label="WhatsApp / telefone" htmlFor="ld-phone"><Input id="ld-phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} inputMode="tel" /></Field>
        <Field label="E-mail" htmlFor="ld-email"><Input id="ld-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} maxLength={200} /></Field>
        <Field label="Origem" htmlFor="ld-source">
          <Input id="ld-source" list="ld-sources" value={v.source} onChange={(e) => set("source", e.target.value)} placeholder="Instagram, indicação, live…" maxLength={60} />
          <datalist id="ld-sources">{[...new Set(["Instagram", "Indicação", "Live", "Anúncio", "WhatsApp", ...sources])].map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Produto de interesse" htmlFor="ld-program">
          <Select
            id="ld-program"
            value={v.programId}
            onChange={(e) => {
              const p = programs.find((x) => x.id === e.target.value);
              setV((prev) => ({ ...prev, programId: e.target.value, potentialCents: prev.potentialCents ?? p?.priceCents ?? null }));
            }}
          >
            <option value="">Não definido</option>
            {programs.filter((p) => p.active || p.id === v.programId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Valor potencial" htmlFor="ld-potential"><MoneyInput id="ld-potential" value={v.potentialCents} onChange={(c) => set("potentialCents", c)} /></Field>
        <Field label="Etapa" htmlFor="ld-stage">
          <Select id="ld-stage" value={v.stageId} onChange={(e) => set("stageId", e.target.value)}>
            {openStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Responsável" htmlFor="ld-owner"><Input id="ld-owner" value={v.owner} onChange={(e) => set("owner", e.target.value)} maxLength={100} /></Field>
        <Field label="Próxima ação" htmlFor="ld-next"><Input id="ld-next" value={v.nextAction} onChange={(e) => set("nextAction", e.target.value)} placeholder="Ex.: enviar proposta" maxLength={300} /></Field>
        <Field label="Data da próxima ação" htmlFor="ld-next-date"><Input id="ld-next-date" type="date" value={v.nextActionDate} onChange={(e) => set("nextActionDate", e.target.value)} /></Field>
        <Field label="Interesse / dor principal" htmlFor="ld-interest" className="sm:col-span-2"><Input id="ld-interest" value={v.interest} onChange={(e) => set("interest", e.target.value)} maxLength={500} /></Field>
        <Field label="Observações" htmlFor="ld-notes" className="sm:col-span-2"><Textarea id="ld-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={5000} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Para fechar a venda use “Registrar venda”: ela cria a venda no financeiro e move o lead para “Venda realizada”.</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{lead ? "Salvar" : "Criar lead"}</Button>
      </DialogFooter>
    </form>
  );
}

function Activities({ lead, onChange }: { lead: LeadDetail; onChange: () => void }) {
  const [type, setType] = React.useState<"NOTE" | "CALL" | "MESSAGE" | "MEETING">("NOTE");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-2 rounded-lg border border-border p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const r = await addLeadActivityAction(lead.id, { type, content });
          setSaving(false);
          if (!r.ok) return toast.error(r.error);
          setContent("");
          onChange();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Tipo de registro" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="h-8 w-36">
            <option value="NOTE">Anotação</option>
            <option value="CALL">Ligação</option>
            <option value="MESSAGE">Mensagem</option>
            <option value="MEETING">Reunião</option>
          </Select>
        </div>
        <Textarea aria-label="Registro" value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="O que aconteceu neste contato?" required maxLength={5000} />
        <div className="flex justify-end"><Button size="sm" type="submit" disabled={saving || !content.trim()}>Registrar</Button></div>
      </form>
      <ol className="grid gap-2" data-testid="lead-history">
        {lead.activities.map((a) => {
          const meta = ACTIVITY[a.type as keyof typeof ACTIVITY] ?? ACTIVITY.NOTE;
          const Icon = meta.icon;
          return (
            <li key={a.id} className="flex gap-3 rounded-lg px-1 py-1.5 text-sm">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-secondary"><Icon className="size-3.5 text-muted-foreground" /></span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap">{a.content}</p>
                <p className="text-xs text-muted-foreground">{meta.label} · {formatDateTimeBR(new Date(a.createdAt))}</p>
              </div>
              {a.type !== "STAGE_CHANGE" && (
                <button
                  type="button"
                  className="self-start rounded p-1 text-muted-foreground hover:text-danger"
                  aria-label="Excluir registro"
                  onClick={async () => {
                    const r = await deleteLeadActivityAction(a.id);
                    if (!r.ok) return toast.error(r.error);
                    onChange();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ConvertDialog({ lead, programs, accounts, today, onClose, onDone }: { lead: LeadDetail; programs: Program[]; accounts: { id: string; name: string }[]; today: string; onClose: () => void; onDone: () => void }) {
  const program = programs.find((p) => p.id === lead.programId);
  const [v, setV] = React.useState({
    programId: lead.programId ?? "",
    description: program?.name ?? lead.interest ?? "Mentoria",
    totalCents: lead.potentialCents ?? program?.priceCents ?? (null as number | null),
    saleDate: today,
    paymentType: "CASH" as "CASH" | "INSTALLMENTS",
    installmentsCount: 1,
    firstDueDate: today,
    commissionCents: 0,
    receivedNow: false,
    accountId: accounts[0]?.id ?? "",
    createMentee: !lead.mentee,
    menteeStartDate: today,
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const preview = v.totalCents && v.installmentsCount > 1 ? splitInstallments(v.totalCents, v.installmentsCount) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar venda — {lead.name}</DialogTitle>
          <DialogDescription>Cria a venda no financeiro da Mentoria (faturamento na data da venda, recebimento por parcela) e move o lead para “Venda realizada”.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!v.totalCents) return toast.error("Informe o valor.");
            setSaving(true);
            const r = await convertLeadAction(lead.id, {
              sale: {
                programId: v.programId || null,
                description: v.description || "Mentoria",
                totalCents: v.totalCents,
                saleDate: v.saleDate,
                paymentType: v.paymentType,
                installmentsCount: v.paymentType === "CASH" ? 1 : v.installmentsCount,
                firstDueDate: v.firstDueDate,
                commissionCents: v.commissionCents,
                receivedNow: v.receivedNow && v.paymentType === "CASH" ? { accountId: v.accountId, date: v.saleDate } : null,
              },
              createMentee: v.createMentee,
              menteeStartDate: v.menteeStartDate,
            });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.data.menteeId && v.createMentee ? "Venda registrada e mentorado cadastrado." : r.message);
            onDone();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Produto / mentoria" htmlFor="cv-program">
              <Select
                id="cv-program"
                value={v.programId}
                onChange={(e) => {
                  const p = programs.find((x) => x.id === e.target.value);
                  setV((prev) => ({ ...prev, programId: e.target.value, description: p?.name ?? prev.description, totalCents: prev.totalCents ?? p?.priceCents ?? null }));
                }}
              >
                <option value="">Outro</option>
                {programs.filter((p) => p.active || p.id === v.programId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Descrição" htmlFor="cv-desc"><Input id="cv-desc" value={v.description} onChange={(e) => set("description", e.target.value)} required maxLength={200} /></Field>
            <Field label="Valor total" htmlFor="cv-total"><MoneyInput id="cv-total" value={v.totalCents} onChange={(c) => set("totalCents", c)} required /></Field>
            <Field label="Data da venda" htmlFor="cv-date"><Input id="cv-date" type="date" value={v.saleDate} onChange={(e) => set("saleDate", e.target.value)} required /></Field>
            <Field label="Pagamento" htmlFor="cv-paytype">
              <Select id="cv-paytype" value={v.paymentType} onChange={(e) => { const t = e.target.value as "CASH" | "INSTALLMENTS"; setV((p) => ({ ...p, paymentType: t, installmentsCount: t === "CASH" ? 1 : Math.max(2, p.installmentsCount) })); }}>
                <option value="CASH">À vista</option>
                <option value="INSTALLMENTS">Parcelado</option>
              </Select>
            </Field>
            {v.paymentType === "INSTALLMENTS" && (
              <Field label="Parcelas" htmlFor="cv-inst"><Input id="cv-inst" type="number" min={2} max={36} value={v.installmentsCount} onChange={(e) => set("installmentsCount", Math.min(36, Math.max(2, Number(e.target.value) || 2)))} /></Field>
            )}
            <Field label={v.paymentType === "CASH" ? "Data de recebimento prevista" : "Vencimento da 1ª parcela"} htmlFor="cv-first"><Input id="cv-first" type="date" value={v.firstDueDate} onChange={(e) => set("firstDueDate", e.target.value)} required /></Field>
            <Field label="Comissão" htmlFor="cv-comm"><MoneyInput id="cv-comm" value={v.commissionCents} onChange={(c) => set("commissionCents", c ?? 0)} /></Field>
          </div>
          {preview.length > 1 && (
            <p className="text-xs text-muted-foreground">{preview.map((p, i) => `${i + 1}ª ${formatBRL(p)} em ${br(addMonthsYmd(v.firstDueDate, i)).slice(0, 5)}`).slice(0, 6).join(" · ")}{preview.length > 6 ? " …" : ""}</p>
          )}
          {v.paymentType === "CASH" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <label className="flex items-center gap-2"><Checkbox checked={v.receivedNow} onChange={(e) => set("receivedNow", e.target.checked)} /> Já recebido na data da venda</label>
              {v.receivedNow && (
                <Select value={v.accountId} onChange={(e) => set("accountId", e.target.value)} className="h-8 w-48" aria-label="Conta que recebeu">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              )}
              {v.receivedNow && !accounts.length && <span className="text-xs text-danger">Cadastre uma conta da Mentoria primeiro.</span>}
            </div>
          )}
          {!lead.mentee && (
            <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
              <label className="flex items-center gap-2"><Checkbox checked={v.createMentee} onChange={(e) => set("createMentee", e.target.checked)} /> Cadastrar como mentorado</label>
              {v.createMentee && (
                <Field label="Início da mentoria" htmlFor="cv-start"><Input id="cv-start" type="date" value={v.menteeStartDate} onChange={(e) => set("menteeStartDate", e.target.value)} className="w-44" /></Field>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Confirmar venda</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StagesDialog({ workspaceId, stages, onClose }: { workspaceId: string; stages: Stage[]; onClose: () => void }) {
  const router = useRouter();
  const prompt = usePrompt();
  const [order, setOrder] = React.useState(stages);
  const [name, setName] = React.useState("");
  const [removing, setRemoving] = React.useState<Stage | null>(null);
  const [moveTo, setMoveTo] = React.useState("");
  React.useEffect(() => setOrder(stages), [stages]);

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
    const r = await reorderStagesAction(workspaceId, next.map((s) => s.id));
    if (!r.ok) {
      toast.error(r.error);
      setOrder(stages);
    }
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Etapas do funil</DialogTitle>
          <DialogDescription>Renomeie, reordene ou crie etapas. “Venda realizada” e “Perdido” são usadas nos indicadores.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1">
          {order.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
              <span className="flex-1">{s.name} {s.isWon && <Badge variant="success">venda</Badge>} {s.isLost && <Badge variant="outline">perdido</Badge>}</span>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`Subir ${s.name}`} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></button>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`Descer ${s.name}`} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></button>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                onClick={async () => {
                  const n = await prompt({ title: "Renomear etapa", label: "Nome", defaultValue: s.name, confirmLabel: "Salvar" });
                  if (!n) return;
                  const r = await renameStageAction(s.id, n);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                Renomear
              </button>
              {!s.isWon && !s.isLost && (
                <button type="button" className="rounded p-1 text-muted-foreground hover:text-danger" aria-label={`Excluir ${s.name}`} onClick={() => { setRemoving(s); setMoveTo(order.find((o) => o.id !== s.id && !o.isWon && !o.isLost)?.id ?? ""); }}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {removing && (
          <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
            <p>Excluir “{removing.name}”. Mover os leads desta etapa para:</p>
            <div className="flex gap-2">
              <Select aria-label="Mover leads para" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-8">
                {order.filter((o) => o.id !== removing.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Button size="sm" variant="danger" onClick={async () => {
                const r = await deleteStageAction(removing.id, moveTo);
                if (!r.ok) return toast.error(r.error);
                toast.success(r.message);
                setRemoving(null);
                router.refresh();
              }}>Excluir</Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancelar</Button>
            </div>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await createStageAction(workspaceId, name);
            if (!r.ok) return toast.error(r.error);
            setName("");
            router.refresh();
          }}
        >
          <Input aria-label="Nova etapa" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova etapa" maxLength={60} />
          <Button type="submit" variant="outline" disabled={!name.trim()}><Plus /> Criar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
