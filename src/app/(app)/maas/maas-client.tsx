"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Compass, Pencil, Plus, Settings2, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import { ValueLine } from "@/components/value-line";
import { cn } from "@/lib/utils";
import type { maasOverview } from "@/server/maas";
import { createAreaAction, deleteAssessmentAction, objectiveFromScoreAction, renameAreaAction, reorderAreasAction, saveAssessmentAction, setAreaActiveAction } from "./actions";

const MaasRadar = dynamic(() => import("./radar").then((m) => m.MaasRadar), { ssr: false, loading: () => <div className="h-80" /> });

type Overview = Awaited<ReturnType<typeof maasOverview>>;
type Assessment = Overview["assessments"][number];
const br = (s: string) => s.split("-").reverse().join("/");
const ymd = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export function MaasClient({ overview, today, openNew }: { overview: Overview; today: string; openNew: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<{ kind: "form"; edit?: Assessment } | { kind: "areas" } | null>(openNew ? { kind: "form" } : null);
  React.useEffect(() => {
    if (openNew) setDialog({ kind: "form" });
  }, [openNew]);
  const [areaSeries, setAreaSeries] = React.useState(overview.series[0]?.key ?? "");
  const [open, setOpen] = React.useState<string | null>(null);
  const latest = overview.assessments[0];
  const scoreIdByArea = new Map(latest?.scores.map((s) => [s.areaId ?? `nome:${s.areaName}`, s]) ?? []);
  const selectedSeries = overview.series.find((s) => s.key === areaSeries);

  return (
    <div className="grid gap-5">
      <PageHeader
        title="MAAS"
        description="Mapa de Autoavaliação Sistêmica: dê uma nota de 0 a 10 para cada área da vida e acompanhe a evolução."
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog({ kind: "areas" })}><Settings2 /> Áreas</Button>
            <Button onClick={() => setDialog({ kind: "form" })}><Plus /> Nova avaliação</Button>
          </>
        }
      />

      {!overview.latest ? (
        <EmptyState
          icon={Compass}
          title="Nenhuma avaliação ainda"
          description="Faça sua primeira autoavaliação. Repita a cada mês ou trimestre para ver o que evoluiu e onde focar."
          action={<Button onClick={() => setDialog({ kind: "form" })}><Plus /> Fazer avaliação</Button>}
        />
      ) : (
        <>
          <section aria-label="Resumo do MAAS" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Média atual" value={overview.latest.average?.toLocaleString("pt-BR") ?? "—"} hint={`avaliação de ${br(overview.latest.date)}`} />
            <Stat
              label="Variação"
              value={overview.previous && overview.latest.average !== null && overview.previous.average !== null ? signed(Math.round((overview.latest.average - overview.previous.average) * 10) / 10) : "—"}
              hint={overview.previous ? `vs. ${br(overview.previous.date)}` : "primeira avaliação"}
            />
            <Stat label="Avaliações" value={String(overview.assessments.length)} />
            <Stat label="Áreas avaliadas" value={String(overview.comparison.length)} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Roda da vida</CardTitle>
                <CardDescription>Última avaliação{overview.previous ? " comparada com a anterior" : ""}.</CardDescription>
              </CardHeader>
              <CardContent>
                <MaasRadar data={overview.comparison.map((c) => ({ area: c.name, atual: c.score, anterior: c.previous }))} hasPrevious={!!overview.previous} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Notas por área</CardTitle>
                <CardDescription>Da mais baixa para a mais alta — as primeiras são as candidatas a foco.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2" data-testid="maas-areas">
                  {overview.comparison.map((c, i) => {
                    const score = scoreIdByArea.get(c.key);
                    return (
                      <li key={c.key} className="grid gap-1" data-area={c.name}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate">{c.name}</span>
                          {c.delta !== null && c.delta !== 0 && (
                            <span className={cn("flex items-center text-xs tabular", c.delta > 0 ? "text-success" : "text-danger")}>
                              {c.delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                              {Math.abs(c.delta)}
                            </span>
                          )}
                          <span className="w-10 text-right font-semibold tabular">{c.score}/10</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                          <div className={cn("h-1.5 rounded-full", c.score <= 4 ? "bg-danger" : c.score <= 6 ? "bg-warning" : "bg-[var(--chart-in)]")} style={{ width: `${c.score * 10}%` }} />
                        </div>
                        {i < 3 && score && (score.goal || score.actionPlan) && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {score.goal && <span>Meta: {score.goal}</span>}
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={async () => {
                                const r = await objectiveFromScoreAction(score.id);
                                if (!r.ok) return toast.error(r.error);
                                toast.success(r.message);
                                router.push(`/objetivos?meta=${r.data}`);
                              }}
                            >
                              Transformar em objetivo
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>

          {overview.assessments.length > 1 && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Evolução da média</CardTitle></CardHeader>
                <CardContent>
                  <ValueLine data={overview.averages.map((a) => ({ label: br(a.date).slice(0, 5), value: a.average }))} label="Média" caption="Média das notas em cada avaliação (0 a 10)." format={(v) => v.toLocaleString("pt-BR")} height={200} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Evolução por área</CardTitle>
                  <Select aria-label="Área" value={areaSeries} onChange={(e) => setAreaSeries(e.target.value)} className="h-8 w-48">
                    {overview.series.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </Select>
                </CardHeader>
                <CardContent>
                  {selectedSeries && <ValueLine data={selectedSeries.points.map((p) => ({ label: br(p.date).slice(0, 5), value: p.score }))} label={selectedSeries.name} caption={`Notas de ${selectedSeries.name}.`} height={200} />}
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
            <CardContent>
              <ul className="grid gap-2" data-testid="maas-history">
                {overview.assessments.map((a) => {
                  const avg = a.scores.length ? Math.round((a.scores.reduce((s, x) => s + x.score, 0) / a.scores.length) * 10) / 10 : null;
                  const isOpen = open === a.id;
                  return (
                    <li key={a.id} className="rounded-lg border border-border">
                      <div className="flex items-center gap-2 px-3 py-2 text-sm">
                        <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen}>
                          <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                          <span className="font-medium">{br(ymd(a.date))}</span>
                          <span className="text-muted-foreground">média {avg?.toLocaleString("pt-BR") ?? "—"} · {a.scores.length} áreas</span>
                        </button>
                        <Button size="sm" variant="ghost" aria-label="Editar avaliação" onClick={() => setDialog({ kind: "form", edit: a })}><Pencil /></Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Excluir avaliação"
                          onClick={async () => {
                            if (!(await confirm({ title: "Excluir avaliação?", danger: true, confirmLabel: "Excluir" }))) return;
                            const r = await deleteAssessmentAction(a.id);
                            if (!r.ok) return toast.error(r.error);
                            router.refresh();
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      {isOpen && (
                        <div className="grid gap-2 border-t border-border px-3 py-2 text-sm">
                          {a.notes && <p className="whitespace-pre-wrap text-muted-foreground">{a.notes}</p>}
                          {a.scores.map((s) => (
                            <div key={s.id} className="grid gap-0.5">
                              <p><span className="font-medium">{s.areaName}</span> · {s.score}/10</p>
                              {s.comment && <p className="text-muted-foreground">{s.comment}</p>}
                              {s.goal && <p className="text-xs">Meta: {s.goal}</p>}
                              {s.actionPlan && <p className="whitespace-pre-wrap text-xs text-muted-foreground">Plano: {s.actionPlan}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="size-3.5" /> Objetivos criados a partir do MAAS ficam em <Link href="/objetivos" className="underline">Objetivos</Link>.</p>
        </>
      )}

      {dialog?.kind === "form" && <AssessmentDialog areas={overview.areas} edit={dialog.edit} today={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === "areas" && <AreasDialog areas={overview.areas} onClose={() => setDialog(null)} />}
    </div>
  );
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR")}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

type Row = { areaId: string; name: string; score: number | null; comment: string; goal: string; actionPlan: string };

function AssessmentDialog({ areas, edit, today, onClose }: { areas: Overview["areas"]; edit?: Assessment; today: string; onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = React.useState(edit ? ymd(edit.date) : today);
  const [notes, setNotes] = React.useState(edit?.notes ?? "");
  const [rows, setRows] = React.useState<Row[]>(() => {
    const prev = new Map(edit?.scores.map((s) => [s.areaId, s]) ?? []);
    return areas
      .filter((a) => a.active || prev.has(a.id))
      .map((a) => {
        const s = prev.get(a.id);
        return { areaId: a.id, name: a.name, score: s?.score ?? null, comment: s?.comment ?? "", goal: s?.goal ?? "", actionPlan: s?.actionPlan ?? "" };
      });
  });
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const update = (id: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.areaId === id ? { ...x, ...patch } : x)));
  const filled = rows.filter((r) => r.score !== null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar avaliação" : "Nova avaliação"}</DialogTitle>
          <DialogDescription>Notas de 0 (muito insatisfeita) a 10 (plenamente satisfeita). Áreas sem nota ficam de fora — não contam como zero.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const r = await saveAssessmentAction({
              date,
              notes: notes || null,
              scores: filled.map((x) => ({ areaId: x.areaId, score: x.score!, comment: x.comment || null, goal: x.goal || null, actionPlan: x.actionPlan || null })),
            });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
            router.refresh();
          }}
        >
          <Field label="Data" htmlFor="ms-date" className="w-48"><Input id="ms-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.areaId} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium">{r.name}</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={r.score ?? 5}
                    onChange={(e) => update(r.areaId, { score: Number(e.target.value) })}
                    className={cn("w-40 accent-[var(--primary)]", r.score === null && "opacity-40")}
                    aria-label={`Nota de ${r.name}`}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={r.score ?? ""}
                    onChange={(e) => update(r.areaId, { score: e.target.value === "" ? null : Math.max(0, Math.min(10, Math.round(Number(e.target.value)))) })}
                    className="h-8 w-16 text-center"
                    aria-label={`Nota (número) de ${r.name}`}
                  />
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`Detalhes de ${r.name}`} aria-expanded={expanded === r.areaId} onClick={() => setExpanded(expanded === r.areaId ? null : r.areaId)}>
                    <ChevronDown className={cn("size-4 transition-transform", expanded === r.areaId && "rotate-180")} />
                  </button>
                </div>
                {expanded === r.areaId && (
                  <div className="mt-3 grid gap-2">
                    <Textarea aria-label={`Comentário sobre ${r.name}`} value={r.comment} onChange={(e) => update(r.areaId, { comment: e.target.value })} rows={2} placeholder="Por que essa nota?" />
                    <Input aria-label={`Meta para ${r.name}`} value={r.goal} onChange={(e) => update(r.areaId, { goal: e.target.value })} placeholder="Meta para esta área" maxLength={300} />
                    <Textarea aria-label={`Plano de ação para ${r.name}`} value={r.actionPlan} onChange={(e) => update(r.areaId, { actionPlan: e.target.value })} rows={3} placeholder="Ações (uma por linha)" />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Field label="Observações gerais" htmlFor="ms-notes"><Textarea id="ms-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
          <DialogFooter className="items-center justify-between">
            <span className="text-xs text-muted-foreground">{filled.length} de {rows.length} áreas com nota</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving || filled.length === 0}>Salvar avaliação</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AreasDialog({ areas, onClose }: { areas: Overview["areas"]; onClose: () => void }) {
  const router = useRouter();
  const prompt = usePrompt();
  const [order, setOrder] = React.useState(areas);
  const [name, setName] = React.useState("");
  React.useEffect(() => setOrder(areas), [areas]);
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
    const r = await reorderAreasAction(next.map((a) => a.id));
    if (!r.ok) toast.error(r.error);
    router.refresh();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Áreas do MAAS</DialogTitle>
          <DialogDescription>Renomear não altera avaliações antigas. Áreas desativadas saem das próximas avaliações.</DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-96 gap-1 overflow-y-auto">
          {order.map((a, i) => (
            <li key={a.id} className={cn("flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm", !a.active && "opacity-60")}>
              <span className="flex-1">{a.name} {!a.active && <Badge variant="outline">inativa</Badge>}</span>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`Subir ${a.name}`} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></button>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`Descer ${a.name}`} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></button>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                onClick={async () => {
                  const n = await prompt({ title: "Renomear área", label: "Nome", defaultValue: a.name, confirmLabel: "Salvar" });
                  if (!n) return;
                  const r = await renameAreaAction(a.id, n);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                Renomear
              </button>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                onClick={async () => {
                  const r = await setAreaActiveAction(a.id, !a.active);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                {a.active ? "Desativar" : "Ativar"}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await createAreaAction(name);
            if (!r.ok) return toast.error(r.error);
            setName("");
            router.refresh();
          }}
        >
          <Input aria-label="Nova área" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova área" maxLength={60} />
          <Button type="submit" variant="outline" disabled={!name.trim()}><Plus /> Criar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
