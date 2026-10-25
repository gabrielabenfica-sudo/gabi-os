"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Calculator, CalendarPlus, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Target, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, EmptyState, WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { Money, MoneyInput } from "@/components/finance/money-input";
import { formatBRL } from "@/lib/money";
import { addMonthsYm, formatYm } from "@/lib/dates";
import { achievementPercent, bonusForPercent, type BonusTier } from "@/lib/finance/bonus";
import { cn } from "@/lib/utils";
import {
  cancelCompensationAction, createBonusRuleAction, createCompensationAction, deleteBonusRuleAction, deleteCompensationAction, generateSalariesAction,
  receiveCompensationAction, unreceiveCompensationAction, updateBonusRuleAction, updateCompensationAction,
} from "../../financas/actions";

const InOutBars = dynamic(() => import("@/components/finance/charts").then((m) => m.InOutBars), { ssr: false, loading: () => <div className="h-60 animate-pulse rounded-lg bg-muted" /> });

type Record_ = {
  id: string;
  kind: "SALARY" | "BONUS" | "OTHER";
  referenceMonth: string;
  description: string | null;
  expectedCents: number;
  receivedCents: number | null;
  expectedDate: string | null;
  receivedDate: string | null;
  status: "EXPECTED" | "RECEIVED" | "CANCELLED";
  notes: string | null;
  bonusRule: { id: string; title: string } | null;
  transaction: { account: { name: string } | null } | null;
};
type Rule = {
  id: string;
  referenceMonth: string;
  title: string;
  criteria: string | null;
  targetValue: number | null;
  achievedValue: number | null;
  tiers: BonusTier[];
  expectedCents: number | null;
  computed: { percent: number | null; cents: number; source: "manual" | "tiers" | "none" };
};
type Monthly = { month: string; salaryExpected: number; bonusExpected: number; otherExpected: number; salaryReceived: number; bonusReceived: number; otherReceived: number; totalExpected: number; totalReceived: number; pendingCents: number };
type Data = { year: number; records: Record_[]; rules: Rule[]; monthly: Monthly[]; totals: { expected: number; received: number; pending: number; bonusReceived: number; salaryReceived: number } };

const KIND = { SALARY: "Salário", BONUS: "Bonificação", OTHER: "Outro" } as const;
const ymd = (s: string | null) => (s ? s.slice(0, 10) : "");
const br = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

export function CompensationClient({ workspace, data, accounts, today }: { workspace: { id: string; name: string; color: string }; data: Data; accounts: { id: string; name: string }[]; today: string }) {
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<
    { kind: "record"; edit?: Record_; month?: string } | { kind: "receive"; record: Record_ } | { kind: "salaries" } | { kind: "rule"; edit?: Rule } | { kind: "simulate" } | null
  >(null);
  const currentMonth = today.slice(0, 7);
  const byMonth = new Map<string, Record_[]>();
  for (const r of data.records) byMonth.set(r.referenceMonth.slice(0, 7), [...(byMonth.get(r.referenceMonth.slice(0, 7)) ?? []), r]);
  const months = data.monthly.map((m) => m.month).filter((m) => byMonth.has(m) || m === currentMonth).reverse();
  const elapsed = data.monthly.filter((m) => m.month <= currentMonth);
  const avgReceived = elapsed.filter((m) => m.totalReceived > 0);
  const projection = data.totals.received + data.monthly.filter((m) => m.month >= currentMonth).reduce((s, m) => s + m.pendingCents, 0);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error);
    else if (r.message) toast.success(r.message);
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><WsDot color={workspace.color} /> {workspace.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Remuneração TURBO</h1>
          <p className="text-sm text-muted-foreground">Somente a sua remuneração. Valor previsto nunca conta como recebido.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" asChild><Link href={`?ano=${data.year - 1}`} aria-label="Ano anterior"><ChevronLeft /></Link></Button>
          <span className="w-14 text-center font-medium tabular">{data.year}</span>
          <Button variant="outline" size="icon" asChild><Link href={`?ano=${data.year + 1}`} aria-label="Próximo ano"><ChevronRight /></Link></Button>
          <Button variant="outline" onClick={() => setDialog({ kind: "simulate" })}><Calculator /> Simular</Button>
          <Button variant="outline" onClick={() => setDialog({ kind: "salaries" })}><CalendarPlus /> Gerar salários</Button>
          <Button onClick={() => setDialog({ kind: "record" })}><Plus /> Registro</Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Totais do ano">
        <Kpi label={`Recebido em ${data.year}`}><Money cents={data.totals.received} tone="in" className="text-xl font-semibold" /></Kpi>
        <Kpi label="Salários recebidos"><Money cents={data.totals.salaryReceived} className="text-xl font-semibold" /></Kpi>
        <Kpi label="Bonificações recebidas"><Money cents={data.totals.bonusReceived} className="text-xl font-semibold" /></Kpi>
        <Kpi label="Previsto a receber" hint="ainda não recebido"><Money cents={data.totals.pending} tone="muted" className="text-xl font-semibold" /></Kpi>
        <Kpi label="Projeção do ano" hint={avgReceived.length ? `média mensal recebida ${formatBRL(Math.round(data.totals.received / avgReceived.length))}` : "recebido + previsto"}>
          <Money cents={projection} className="text-xl font-semibold" />
        </Kpi>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Evolução da remuneração</CardTitle>
          <CardDescription>Por mês de referência (mês trabalhado).</CardDescription>
        </CardHeader>
        <CardContent>
          {data.monthly.every((m) => !m.totalExpected && !m.totalReceived) ? (
            <p className="text-sm text-muted-foreground">Sem registros neste ano. Use “Gerar salários” para criar os salários previstos.</p>
          ) : (
            <InOutBars data={data.monthly.map((m) => ({ month: m.month, inCents: m.totalReceived, outCents: m.totalExpected }))} inLabel="Recebido" outLabel="Previsto" showResult={false} caption="Remuneração prevista e recebida por mês" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="grid content-start gap-3" aria-label="Registros por mês">
          <h2 className="text-lg font-semibold">Mês a mês</h2>
          {months.length === 0 ? (
            <EmptyState title="Nenhum registro" description="Cadastre o salário e as bonificações de cada mês." />
          ) : (
            months.map((m) => {
              const rows = byMonth.get(m) ?? [];
              const t = data.monthly.find((x) => x.month === m)!;
              return (
                <div key={m} className="rounded-xl border border-border bg-card" data-month={m}>
                  <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                    <h3 className="flex-1 font-medium capitalize">{formatYm(m)}</h3>
                    <span className="text-xs text-muted-foreground">previsto {formatBRL(t.totalExpected)} · recebido</span>
                    <Money cents={t.totalReceived} tone="in" className="font-semibold" />
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Novo registro em ${formatYm(m)}`} onClick={() => setDialog({ kind: "record", month: m })}><Plus /></Button>
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Nada registrado.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {rows.map((r) => (
                        <li key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm", r.status === "CANCELLED" && "opacity-50")}>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{KIND[r.kind]}{r.description && r.kind !== "SALARY" ? ` · ${r.description}` : ""}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.status === "RECEIVED" ? `Recebido em ${br(r.receivedDate)}${r.transaction?.account ? ` · ${r.transaction.account.name}` : ""}` : `Previsto para ${br(r.expectedDate)}`}
                              {r.bonusRule && " · por regra"}
                            </p>
                          </div>
                          {r.status === "RECEIVED" ? <Badge variant="success">Recebido</Badge> : r.status === "CANCELLED" ? <Badge variant="outline">Cancelado</Badge> : <Badge variant="outline">Previsto</Badge>}
                          <div className="w-28 text-right">
                            {r.status === "RECEIVED" ? (
                              <>
                                <Money cents={r.receivedCents ?? 0} tone="in" className="font-medium" />
                                {r.receivedCents !== r.expectedCents && <p className="text-[11px] text-muted-foreground">previsto {formatBRL(r.expectedCents)}</p>}
                              </>
                            ) : (
                              <Money cents={r.expectedCents} tone="muted" />
                            )}
                          </div>
                          {r.status === "EXPECTED" && <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "receive", record: r })}>Receber</Button>}
                          <DropdownMenu>
                            <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label={`Ações de ${KIND[r.kind]} ${formatYm(m)}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setDialog({ kind: "record", edit: r })}><Pencil /> Editar</DropdownMenuItem>
                              {r.status === "RECEIVED" && <DropdownMenuItem onSelect={() => act(() => unreceiveCompensationAction(r.id))}><Undo2 /> Desfazer recebimento</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => act(() => cancelCompensationAction(r.id, r.status !== "CANCELLED"))}><X /> {r.status === "CANCELLED" ? "Reativar" : "Cancelar"}</DropdownMenuItem>
                              <DropdownMenuItem className="text-danger" onSelect={async () => { if (await confirm({ title: "Excluir registro?", description: r.status === "RECEIVED" ? "A receita lançada no financeiro pessoal também será removida." : undefined, confirmLabel: "Excluir", danger: true })) await act(() => deleteCompensationAction(r.id)); }}>
                                <Trash2 /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </section>

        <section className="grid content-start gap-3" aria-label="Regras de bonificação">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Regras de bonificação</h2>
            <Button size="sm" onClick={() => setDialog({ kind: "rule" })}><Target /> Nova regra</Button>
          </div>
          <p className="text-xs text-muted-foreground">Cada mês pode ter metas e faixas diferentes. A bonificação prevista do mês é atualizada pela regra até ser recebida.</p>
          {data.rules.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma regra neste ano.</p>
          ) : (
            data.rules.map((r) => (
              <Card key={r.id}>
                <CardContent className="grid gap-2 pt-5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-xs capitalize text-muted-foreground">{formatYm(r.referenceMonth.slice(0, 7))}</p>
                      <p className="font-medium">{r.title}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar ${r.title}`} onClick={() => setDialog({ kind: "rule", edit: r })}><Pencil /></Button>
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Excluir ${r.title}`} onClick={async () => { if (await confirm({ title: "Excluir regra?", description: "A bonificação prevista vinculada também será removida.", confirmLabel: "Excluir", danger: true })) await act(() => deleteBonusRuleAction(r.id)); }}>
                      <Trash2 />
                    </Button>
                  </div>
                  {r.targetValue !== null && (
                    <div className="grid gap-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Atingido {r.achievedValue ?? 0} de {r.targetValue}</span>
                        <span className="font-medium text-foreground">{r.computed.percent === null ? "—" : `${r.computed.percent}%`}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-[var(--chart-in)]" style={{ width: `${Math.min(100, r.computed.percent ?? 0)}%` }} />
                      </div>
                    </div>
                  )}
                  {r.tiers.length > 0 && (
                    <p className="text-xs text-muted-foreground">Faixas: {r.tiers.map((t) => `${t.minPercent}% → ${formatBRL(t.amountCents)}`).join(" · ")}</p>
                  )}
                  <p className="text-sm">
                    Bonificação prevista: <strong className="tabular">{formatBRL(r.computed.cents)}</strong>
                    <span className="text-xs text-muted-foreground"> {r.computed.source === "manual" ? "(valor manual)" : r.computed.source === "tiers" ? "(pelas faixas)" : ""}</span>
                  </p>
                  {r.criteria && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{r.criteria}</p>}
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </div>

      {dialog?.kind === "record" && <RecordDialog workspaceId={workspace.id} edit={dialog.edit} month={dialog.month ?? currentMonth} onClose={() => setDialog(null)} />}
      {dialog?.kind === "receive" && <ReceiveDialog record={dialog.record} accounts={accounts} today={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === "salaries" && <SalariesDialog workspaceId={workspace.id} currentMonth={currentMonth} onClose={() => setDialog(null)} />}
      {dialog?.kind === "rule" && <RuleDialog workspaceId={workspace.id} edit={dialog.edit} currentMonth={currentMonth} onClose={() => setDialog(null)} />}
      {dialog?.kind === "simulate" && <SimulatorDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function Kpi({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Footer({ saving, onCancel, label = "Salvar" }: { saving: boolean; onCancel: () => void; label?: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={saving}>{saving ? "Salvando…" : label}</Button>
    </div>
  );
}

function RecordDialog({ workspaceId, edit, month, onClose }: { workspaceId: string; edit?: Record_; month: string; onClose: () => void }) {
  const [v, setV] = React.useState({
    kind: edit?.kind ?? "SALARY",
    referenceMonth: edit?.referenceMonth.slice(0, 7) ?? month,
    description: edit?.description ?? "",
    expectedCents: edit?.expectedCents ?? (null as number | null),
    expectedDate: ymd(edit?.expectedDate ?? null),
    notes: edit?.notes ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar registro" : "Novo registro de remuneração"}</DialogTitle>
          <DialogDescription>Registre o valor previsto. O recebimento é confirmado depois, com o valor efetivo.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (v.expectedCents === null) return toast.error("Informe o valor previsto.");
            setSaving(true);
            const input = { kind: v.kind, referenceMonth: v.referenceMonth, description: v.description || null, expectedCents: v.expectedCents, expectedDate: v.expectedDate || null, notes: v.notes || null };
            const r = edit ? await updateCompensationAction(edit.id, input) : await createCompensationAction({ ...input, workspaceId });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="cp-kind">
              <Select id="cp-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })} disabled={Boolean(edit?.bonusRule)}>
                <option value="SALARY">Salário fixo</option>
                <option value="BONUS">Bonificação</option>
                <option value="OTHER">Outro (PLR, 13º, férias…)</option>
              </Select>
            </Field>
            <Field label="Mês de referência" htmlFor="cp-month"><Input id="cp-month" type="month" value={v.referenceMonth} onChange={(e) => setV({ ...v, referenceMonth: e.target.value })} required /></Field>
            <Field label="Valor previsto" htmlFor="cp-expected"><MoneyInput id="cp-expected" value={v.expectedCents} onChange={(c) => setV({ ...v, expectedCents: c })} required /></Field>
            <Field label="Data prevista de pagamento" htmlFor="cp-date"><Input id="cp-date" type="date" value={v.expectedDate} onChange={(e) => setV({ ...v, expectedDate: e.target.value })} /></Field>
            <Field label="Descrição" htmlFor="cp-desc" className="sm:col-span-2"><Input id="cp-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={200} /></Field>
            <Field label="Observações / critérios" htmlFor="cp-notes" className="sm:col-span-2"><Textarea id="cp-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} /></Field>
          </div>
          {edit?.bonusRule && <p className="text-xs text-muted-foreground">O valor previsto desta bonificação é atualizado pela regra “{edit.bonusRule.title}”.</p>}
          <Footer saving={saving} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ record, accounts, today, onClose }: { record: Record_; accounts: { id: string; name: string }[]; today: string; onClose: () => void }) {
  const [amount, setAmount] = React.useState<number | null>(record.expectedCents);
  const [date, setDate] = React.useState(today);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar recebimento</DialogTitle>
          <DialogDescription>{KIND[record.kind]} de {formatYm(record.referenceMonth.slice(0, 7))} · previsto {formatBRL(record.expectedCents)}</DialogDescription>
        </DialogHeader>
        {!accounts.length ? (
          <p className="text-sm text-muted-foreground">Cadastre uma conta em <Link href="/financas/pessoal?aba=contas" className="text-primary underline">Finanças pessoais → Contas</Link> para receber a remuneração.</p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!amount) return toast.error("Informe o valor recebido.");
              setSaving(true);
              const r = await receiveCompensationAction(record.id, { receivedCents: amount, receivedDate: date, accountId });
              setSaving(false);
              if (!r.ok) return toast.error(r.error);
              toast.success(r.message);
              onClose();
            }}
          >
            <Field label="Valor recebido (líquido)" htmlFor="rv-amount"><MoneyInput id="rv-amount" value={amount} onChange={setAmount} required /></Field>
            <Field label="Data de recebimento" htmlFor="rv-date"><Input id="rv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field label="Conta pessoal que recebeu" htmlFor="rv-acc"><Select id="rv-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <p className="text-xs text-muted-foreground">Uma receita realizada é lançada automaticamente nas suas finanças pessoais (uma só, mesmo que você edite depois).</p>
            <Footer saving={saving} onCancel={onClose} label="Confirmar" />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SalariesDialog({ workspaceId, currentMonth, onClose }: { workspaceId: string; currentMonth: string; onClose: () => void }) {
  const [v, setV] = React.useState({ amountCents: null as number | null, payDay: 5, fromMonth: currentMonth, months: 12, paidNextMonth: true });
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar salários previstos</DialogTitle>
          <DialogDescription>Cria um registro de salário por mês. Meses que já têm salário são mantidos.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!v.amountCents) return toast.error("Informe o salário.");
            setSaving(true);
            const r = await generateSalariesAction({ workspaceId, ...v, amountCents: v.amountCents });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(`${r.data.created} salário(s) criado(s)${r.data.skipped ? `, ${r.data.skipped} mês(es) já tinham registro` : ""}.`);
            onClose();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Salário (valor previsto)" htmlFor="gs-amount"><MoneyInput id="gs-amount" value={v.amountCents} onChange={(c) => setV({ ...v, amountCents: c })} required autoFocus /></Field>
            <Field label="Dia do pagamento" htmlFor="gs-day"><Input id="gs-day" type="number" min={1} max={31} value={v.payDay} onChange={(e) => setV({ ...v, payDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
            <Field label="A partir de" htmlFor="gs-from"><Input id="gs-from" type="month" value={v.fromMonth} onChange={(e) => setV({ ...v, fromMonth: e.target.value })} required /></Field>
            <Field label="Quantos meses" htmlFor="gs-months"><Input id="gs-months" type="number" min={1} max={24} value={v.months} onChange={(e) => setV({ ...v, months: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.paidNextMonth} onChange={(e) => setV({ ...v, paidNextMonth: e.target.checked })} /> Pago no mês seguinte ao trabalhado</label>
          <p className="text-xs text-muted-foreground">Ex.: salário de {formatYm(v.fromMonth, true)} previsto para {v.paidNextMonth ? formatYm(addMonthsYm(v.fromMonth, 1), true) : formatYm(v.fromMonth, true)}, dia {v.payDay}.</p>
          <Footer saving={saving} onCancel={onClose} label="Gerar" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TiersEditor({ tiers, onChange }: { tiers: BonusTier[]; onChange: (t: BonusTier[]) => void }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Faixas de bonificação</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...tiers, { minPercent: tiers.length ? Math.min(200, (tiers[tiers.length - 1]!.minPercent ?? 80) + 10) : 80, amountCents: 0 }])}><Plus /> Faixa</Button>
      </div>
      {tiers.length === 0 && <p className="text-xs text-muted-foreground">Sem faixas: informe um valor manual, se houver.</p>}
      {tiers.map((t, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">A partir de</span>
          <Input type="number" min={0} max={1000} step="0.1" value={t.minPercent} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, minPercent: Number(e.target.value) || 0 } : x)))} className="w-20" aria-label="Percentual mínimo" />
          <span className="text-muted-foreground">% →</span>
          <div className="w-36"><MoneyInput value={t.amountCents} onChange={(c) => onChange(tiers.map((x, j) => (j === i ? { ...x, amountCents: c ?? 0 } : x)))} aria-label="Valor da faixa" /></div>
          <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => onChange(tiers.filter((_, j) => j !== i))} aria-label="Remover faixa"><X /></Button>
        </div>
      ))}
    </div>
  );
}

function RuleDialog({ workspaceId, edit, currentMonth, onClose }: { workspaceId: string; edit?: Rule; currentMonth: string; onClose: () => void }) {
  const [v, setV] = React.useState({
    referenceMonth: edit?.referenceMonth.slice(0, 7) ?? currentMonth,
    title: edit?.title ?? "",
    criteria: edit?.criteria ?? "",
    targetValue: edit?.targetValue?.toString() ?? "",
    achievedValue: edit?.achievedValue?.toString() ?? "",
    tiers: edit?.tiers ?? ([{ minPercent: 80, amountCents: 0 }, { minPercent: 100, amountCents: 0 }] as BonusTier[]),
    manual: edit?.expectedCents ?? (null as number | null),
  });
  const [saving, setSaving] = React.useState(false);
  const pct = achievementPercent(v.targetValue ? Number(v.targetValue) : null, v.achievedValue ? Number(v.achievedValue) : null);
  const preview = v.manual ?? bonusForPercent(v.tiers, pct);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar regra" : "Nova regra de bonificação"}</DialogTitle>
          <DialogDescription>Defina a meta do mês e quanto você recebe em cada faixa de atingimento.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const input = {
              referenceMonth: v.referenceMonth,
              title: v.title,
              criteria: v.criteria || null,
              targetValue: v.targetValue ? Number(v.targetValue) : null,
              achievedValue: v.achievedValue ? Number(v.achievedValue) : null,
              tiers: v.tiers.filter((t) => t.amountCents > 0 || t.minPercent > 0),
              expectedCents: v.manual,
            };
            const r = edit ? await updateBonusRuleAction(edit.id, input) : await createBonusRuleAction({ ...input, workspaceId });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meta / nome" htmlFor="rl-title" className="sm:col-span-2"><Input id="rl-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required autoFocus maxLength={120} placeholder="Ex.: Meta de vendas de outubro" /></Field>
            <Field label="Mês" htmlFor="rl-month"><Input id="rl-month" type="month" value={v.referenceMonth} onChange={(e) => setV({ ...v, referenceMonth: e.target.value })} required /></Field>
            <div />
            <Field label="Meta (valor-alvo)" htmlFor="rl-target"><Input id="rl-target" type="number" min={0} step="any" value={v.targetValue} onChange={(e) => setV({ ...v, targetValue: e.target.value })} placeholder="Ex.: 100" /></Field>
            <Field label="Atingido até agora" htmlFor="rl-achieved"><Input id="rl-achieved" type="number" min={0} step="any" value={v.achievedValue} onChange={(e) => setV({ ...v, achievedValue: e.target.value })} /></Field>
          </div>
          <TiersEditor tiers={v.tiers} onChange={(tiers) => setV({ ...v, tiers })} />
          <Field label="Valor manual (opcional)" htmlFor="rl-manual" hint="Se preenchido, substitui o cálculo pelas faixas.">
            <MoneyInput id="rl-manual" value={v.manual} onChange={(c) => setV({ ...v, manual: c })} />
          </Field>
          <Field label="Critérios" htmlFor="rl-criteria"><Textarea id="rl-criteria" value={v.criteria} onChange={(e) => setV({ ...v, criteria: e.target.value })} rows={2} /></Field>
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            Atingimento: <strong>{pct === null ? "—" : `${pct}%`}</strong> · bonificação prevista: <strong className="tabular">{formatBRL(preview)}</strong>
          </p>
          <Footer saving={saving} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SimulatorDialog({ onClose }: { onClose: () => void }) {
  const [salary, setSalary] = React.useState<number | null>(null);
  const [target, setTarget] = React.useState("100");
  const [tiers, setTiers] = React.useState<BonusTier[]>([{ minPercent: 80, amountCents: 0 }, { minPercent: 100, amountCents: 0 }, { minPercent: 120, amountCents: 0 }]);
  const scenarios = [70, 80, 90, 100, 110, 120, 130];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Simular metas futuras</DialogTitle>
          <DialogDescription>Nada é salvo: use para comparar cenários de atingimento.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Salário fixo" htmlFor="sm-salary"><MoneyInput id="sm-salary" value={salary} onChange={setSalary} /></Field>
            <Field label="Meta" htmlFor="sm-target"><Input id="sm-target" type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          </div>
          <TiersEditor tiers={tiers} onChange={setTiers} />
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-1 text-left font-medium">Atingimento</th><th className="py-1 text-right font-medium">Resultado</th><th className="py-1 text-right font-medium">Bonificação</th><th className="py-1 text-right font-medium">Total do mês</th></tr>
            </thead>
            <tbody>
              {scenarios.map((p) => {
                const bonus = bonusForPercent(tiers, p);
                return (
                  <tr key={p} className="border-t border-border">
                    <td className="py-1">{p}%</td>
                    <td className="py-1 text-right tabular">{target ? Math.round((Number(target) * p) / 100) : "—"}</td>
                    <td className="py-1 text-right tabular">{formatBRL(bonus)}</td>
                    <td className="py-1 text-right font-medium tabular">{formatBRL((salary ?? 0) + bonus)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">Em 12 meses a 100% da meta: {formatBRL(((salary ?? 0) + bonusForPercent(tiers, 100)) * 12)}.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
