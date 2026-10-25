"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Ban, ChevronDown, MoreHorizontal, Package, Pencil, Plus, Receipt, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, EmptyState, Segmented } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { Money, MoneyInput } from "@/components/finance/money-input";
import { formatBRL, splitInstallments } from "@/lib/money";
import { addMonthsYmd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SaleRow } from "@/server/finance/sales";
import {
  cancelSaleAction, createProgramAction, createSaleAction, deleteSaleAction, receiveReceivableAction, refundSaleAction, unreceiveReceivableAction, updateProgramAction, updateSaleAction,
} from "../actions";
import { useFinanceHref } from "./finance-shell";
import { dateYmd, ymdBR, type FinanceBase } from "./types";

type Program = { id: string; name: string; priceCents: number | null; durationWeeks: number | null; active: boolean };
type Overdue = { id: string; saleId: string; customer: string; number: number; total: number; dueDate: string; amountCents: number };

const STATUS_LABEL = { ACTIVE: "Ativa", CANCELLED: "Cancelada", REFUNDED: "Reembolsada" } as const;

export function SalesTab({
  sales,
  programs,
  allPeriods,
  overdue,
  pendingCents,
  overdueCents,
  openSaleId,
  ...base
}: FinanceBase & { sales: SaleRow[]; programs: Program[]; allPeriods: boolean; overdue: Overdue[]; pendingCents: number; overdueCents: number; openSaleId: string | null }) {
  const router = useRouter();
  const href = useFinanceHref();
  const params = useSearchParams();
  const confirm = useConfirm();
  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const [expanded, setExpanded] = React.useState<string | null>(openSaleId);
  const [dialog, setDialog] = React.useState<{ kind: "sale"; edit?: SaleRow } | { kind: "receive"; sale: SaleRow; receivable: SaleRow["receivables"][number] } | { kind: "refund"; sale: SaleRow } | { kind: "programs" } | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) router.replace(href({ q: search || null }), { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (openSaleId) setExpanded(openSaleId);
  }, [openSaleId]);
  const novo = params.get("novo");
  React.useEffect(() => {
    if (novo === "venda") {
      setDialog({ kind: "sale" });
      router.replace(href({ novo: null }), { scroll: false });
    }
  }, [novo]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error);
    else if (r.message) toast.success(r.message);
    return r.ok;
  };

  const visible = sales.filter((s) => s.status !== "CANCELLED" || params.get("situacao") === "CANCELLED");
  const soldCents = visible.filter((s) => s.status !== "CANCELLED").reduce((t, s) => t + s.totalCents, 0);
  const receivedCents = visible.reduce((t, s) => t + s.receivedCents, 0);

  return (
    <div className="grid gap-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo de vendas">
        <Kpi label={allPeriods ? "Vendido (filtro)" : "Vendido no mês"} value={<Money cents={soldCents} className="text-lg font-semibold" />} hint={`${visible.filter((s) => s.status !== "CANCELLED").length} venda(s)`} />
        <Kpi label="Recebido destas vendas" value={<Money cents={receivedCents} tone="in" className="text-lg font-semibold" />} />
        <Kpi label="Total a receber" value={<Money cents={pendingCents} className="text-lg font-semibold" />} hint="todas as parcelas pendentes" />
        <Kpi label="Inadimplência" value={<Money cents={overdueCents} tone={overdueCents ? "out" : "muted"} className="text-lg font-semibold" />} hint={`${overdue.length} parcela(s) vencida(s)`} />
      </section>

      {overdue.length > 0 && (
        <section className="rounded-xl border border-danger/30 bg-danger-soft/40 p-4" aria-label="Parcelas vencidas">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger"><AlertTriangle className="size-4" /> Parcelas vencidas</h2>
          <ul className="grid gap-1 text-sm">
            {overdue.slice(0, 8).map((o) => (
              <li key={o.id} className="flex items-center gap-3">
                <span className="tabular text-muted-foreground">{ymdBR(o.dueDate)}</span>
                <Link href={href({ venda: o.saleId, periodo: "todas" })} scroll={false} className="flex-1 hover:underline">{o.customer} · {o.number}/{o.total}</Link>
                <Money cents={o.amountCents} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialog({ kind: "sale" })}><Plus /> Nova venda</Button>
        <Button variant="outline" onClick={() => setDialog({ kind: "programs" })}><Package /> Produtos</Button>
        <Segmented
          ariaLabel="Período"
          size="sm"
          value={allPeriods ? "todas" : "mes"}
          options={[{ value: "mes", label: "Vendas do mês" }, { value: "todas", label: "Todas" }]}
          onChange={(v) => router.replace(href({ periodo: v === "todas" ? "todas" : null }), { scroll: false })}
        />
        <div className="relative ml-auto min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente ou produto…" className="pl-8" aria-label="Buscar vendas" />
        </div>
        <Select aria-label="Situação" value={params.get("situacao") ?? ""} onChange={(e) => router.replace(href({ situacao: e.target.value }), { scroll: false })} className="w-36">
          <option value="">Ativas e reembolsadas</option>
          <option value="ACTIVE">Ativas</option>
          <option value="REFUNDED">Reembolsadas</option>
          <option value="CANCELLED">Canceladas</option>
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhuma venda" description={allPeriods ? "Registre a primeira venda da Mentoria." : "Nenhuma venda neste mês. Veja “Todas” para o histórico."} />
      ) : (
        <ul className="grid gap-2" data-testid="sales">
          {visible.map((s) => {
            const open = expanded === s.id;
            return (
              <li key={s.id} className={cn("rounded-xl border border-border bg-card", s.status === "CANCELLED" && "opacity-60")} data-sale={s.customerName ?? s.description}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setExpanded(open ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.customerName ?? "Cliente"} · {s.program?.name ?? s.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {ymdBR(dateYmd(s.saleDate))} · {s.paymentType === "CASH" ? "À vista" : `${s.installmentsCount}x`}
                        {s.commissionCents > 0 && ` · comissão ${formatBRL(s.commissionCents)}`}
                      </p>
                    </div>
                  </button>
                  {s.status !== "ACTIVE" && <Badge variant={s.status === "CANCELLED" ? "outline" : "warning"}>{STATUS_LABEL[s.status]}</Badge>}
                  {s.overdueCount > 0 && <Badge variant="danger">{s.overdueCount} vencida(s)</Badge>}
                  <div className="text-right">
                    <Money cents={s.totalCents} className="font-semibold" />
                    <p className="text-[11px] text-muted-foreground">recebido {formatBRL(s.receivedCents)}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label={`Ações da venda de ${s.customerName ?? s.description}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {s.status !== "CANCELLED" && <DropdownMenuItem onSelect={() => setDialog({ kind: "sale", edit: s })}><Pencil /> Editar</DropdownMenuItem>}
                      {s.receivedCents > s.refundedCents && <DropdownMenuItem onSelect={() => setDialog({ kind: "refund", sale: s })}><Undo2 /> Registrar reembolso</DropdownMenuItem>}
                      {s.status === "ACTIVE" && (
                        <DropdownMenuItem onSelect={async () => { if (await confirm({ title: "Cancelar venda?", description: "Parcelas pendentes deixam de ser cobradas. O que já foi recebido continua registrado.", confirmLabel: "Cancelar venda", cancelLabel: "Voltar", danger: true })) await act(() => cancelSaleAction(s.id)); }}>
                          <Ban /> Cancelar venda
                        </DropdownMenuItem>
                      )}
                      {s.receivedCents === 0 && (
                        <DropdownMenuItem className="text-danger" onSelect={async () => { if (await confirm({ title: "Excluir venda?", description: "Use excluir para corrigir um lançamento errado. Para venda desfeita, prefira cancelar.", confirmLabel: "Excluir", danger: true })) await act(() => deleteSaleAction(s.id)); }}>
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {open && (
                  <div className="border-t border-border px-4 py-3">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr><th className="py-1 text-left font-medium">Parcela</th><th className="py-1 text-left font-medium">Vencimento</th><th className="py-1 text-left font-medium">Situação</th><th className="py-1 text-right font-medium">Valor</th><th className="w-32" /></tr>
                      </thead>
                      <tbody>
                        {s.receivables.map((r) => {
                          const due = dateYmd(r.dueDate);
                          const late = r.status === "PENDING" && due < base.today;
                          return (
                            <tr key={r.id} className="border-t border-border">
                              <td className="py-1.5">{r.number}/{s.installmentsCount}</td>
                              <td className={cn("py-1.5 tabular", late && "font-medium text-danger")}>{ymdBR(due)}</td>
                              <td className="py-1.5">
                                {r.status === "RECEIVED" ? <Badge variant="success">Recebida {r.receivedAt ? ymdBR(dateYmd(r.receivedAt)).slice(0, 5) : ""}{r.account ? ` · ${r.account.name}` : ""}</Badge>
                                  : r.status === "CANCELLED" ? <Badge variant="outline">Cancelada</Badge>
                                  : late ? <Badge variant="danger">Vencida</Badge> : <Badge variant="outline">A receber</Badge>}
                              </td>
                              <td className="py-1.5 text-right"><Money cents={r.status === "RECEIVED" ? r.receivedCents ?? r.amountCents : r.amountCents} /></td>
                              <td className="py-1.5 text-right">
                                {r.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "receive", sale: s, receivable: r })}>Receber</Button>}
                                {r.status === "RECEIVED" && <Button size="sm" variant="ghost" onClick={() => act(() => unreceiveReceivableAction(r.id))}>Desfazer</Button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {s.refundedCents > 0 && <p className="mt-2 text-xs text-muted-foreground">Reembolsado: {formatBRL(s.refundedCents)}</p>}
                    {s.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{s.notes}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === "sale" && <SaleDialog base={base} programs={programs} edit={dialog.edit} onClose={() => setDialog(null)} />}
      {dialog?.kind === "receive" && <ReceiveDialog base={base} sale={dialog.sale} receivable={dialog.receivable} onClose={() => setDialog(null)} />}
      {dialog?.kind === "refund" && <RefundDialog base={base} sale={dialog.sale} onClose={() => setDialog(null)} />}
      {dialog?.kind === "programs" && <ProgramsDialog base={base} programs={programs} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SaleDialog({ base, programs, edit, onClose }: { base: FinanceBase; programs: Program[]; edit?: SaleRow; onClose: () => void }) {
  const accounts = base.accounts.filter((a) => !a.archived);
  const [v, setV] = React.useState({
    customerName: edit?.customerName ?? "",
    programId: edit?.programId ?? "",
    description: edit?.description ?? "",
    totalCents: edit?.totalCents ?? (null as number | null),
    saleDate: edit ? dateYmd(edit.saleDate) : base.today,
    paymentType: (edit?.paymentType ?? "CASH") as "CASH" | "INSTALLMENTS",
    installmentsCount: edit?.installmentsCount ?? 1,
    firstDueDate: edit ? dateYmd(edit.receivables[0]?.dueDate ?? edit.saleDate) : base.today,
    commissionCents: edit?.commissionCents ?? 0,
    receivedNow: false,
    accountId: accounts[0]?.id ?? "",
    notes: edit?.notes ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const preview = v.totalCents && v.installmentsCount > 0 ? splitInstallments(v.totalCents, v.installmentsCount) : [];
  const locked = Boolean(edit?.receivables.some((r) => r.status === "RECEIVED"));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar venda" : "Nova venda"}</DialogTitle>
          <DialogDescription>O faturamento conta na data da venda; cada parcela conta como recebimento quando for paga.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!v.totalCents) return toast.error("Informe o valor.");
            setSaving(true);
            const input = {
              customerName: v.customerName,
              programId: v.programId || null,
              description: v.description || programs.find((p) => p.id === v.programId)?.name || "Mentoria",
              totalCents: v.totalCents,
              saleDate: v.saleDate,
              paymentType: v.paymentType,
              installmentsCount: v.paymentType === "CASH" ? 1 : v.installmentsCount,
              firstDueDate: v.firstDueDate,
              commissionCents: v.commissionCents,
              notes: v.notes || null,
            };
            const r = edit
              ? await updateSaleAction(edit.id, input)
              : await createSaleAction({ ...input, workspaceId: base.workspace.id, receivedNow: v.receivedNow && v.paymentType === "CASH" ? { accountId: v.accountId, date: v.saleDate } : null });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente" htmlFor="sl-customer"><Input id="sl-customer" value={v.customerName} onChange={(e) => set("customerName", e.target.value)} required autoFocus maxLength={120} /></Field>
            <Field label="Produto / mentoria" htmlFor="sl-program">
              <Select
                id="sl-program"
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
            <Field label="Descrição" htmlFor="sl-desc" className="sm:col-span-2"><Input id="sl-desc" value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={200} placeholder="Ex.: Mentoria individual 3 meses" /></Field>
            <Field label="Valor total" htmlFor="sl-total"><MoneyInput id="sl-total" value={v.totalCents} onChange={(c) => set("totalCents", c)} required /></Field>
            <Field label="Data da venda" htmlFor="sl-date"><Input id="sl-date" type="date" value={v.saleDate} onChange={(e) => set("saleDate", e.target.value)} required /></Field>
            <Field label="Pagamento" htmlFor="sl-paytype">
              <Select id="sl-paytype" value={v.paymentType} onChange={(e) => { const t = e.target.value as "CASH" | "INSTALLMENTS"; setV((p) => ({ ...p, paymentType: t, installmentsCount: t === "CASH" ? 1 : Math.max(2, p.installmentsCount) })); }} disabled={locked}>
                <option value="CASH">À vista</option>
                <option value="INSTALLMENTS">Parcelado</option>
              </Select>
            </Field>
            {v.paymentType === "INSTALLMENTS" && (
              <Field label="Parcelas" htmlFor="sl-inst"><Input id="sl-inst" type="number" min={2} max={36} value={v.installmentsCount} onChange={(e) => set("installmentsCount", Math.min(36, Math.max(2, Number(e.target.value) || 2)))} disabled={locked} /></Field>
            )}
            <Field label={v.paymentType === "CASH" ? "Data de recebimento prevista" : "Vencimento da 1ª parcela"} htmlFor="sl-first">
              <Input id="sl-first" type="date" value={v.firstDueDate} onChange={(e) => set("firstDueDate", e.target.value)} required disabled={locked} />
            </Field>
            <Field label="Comissão" htmlFor="sl-comm" hint="Gera uma despesa prevista (categoria Comissões).">
              <MoneyInput id="sl-comm" value={v.commissionCents} onChange={(c) => set("commissionCents", c ?? 0)} />
            </Field>
          </div>
          {locked && <p className="text-xs text-muted-foreground">Já há parcelas recebidas: valor e parcelamento ficam travados.</p>}
          {preview.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {preview.map((p, i) => `${i + 1}ª ${formatBRL(p)} em ${ymdBR(addMonthsYmd(v.firstDueDate, i)).slice(0, 5)}`).slice(0, 6).join(" · ")}{preview.length > 6 ? " …" : ""}
            </p>
          )}
          {!edit && v.paymentType === "CASH" && (
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
          <Field label="Observações" htmlFor="sl-notes"><Textarea id="sl-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || (v.receivedNow && !accounts.length)}>{saving ? "Salvando…" : edit ? "Salvar" : "Registrar venda"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ base, sale, receivable, onClose }: { base: FinanceBase; sale: SaleRow; receivable: SaleRow["receivables"][number]; onClose: () => void }) {
  const accounts = base.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [date, setDate] = React.useState(base.today);
  const [amount, setAmount] = React.useState<number | null>(receivable.amountCents);
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription>{sale.customerName} · parcela {receivable.number}/{sale.installmentsCount}</DialogDescription>
        </DialogHeader>
        {!accounts.length ? (
          <p className="text-sm text-muted-foreground">Cadastre uma conta da Mentoria na aba Contas.</p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!amount) return toast.error("Informe o valor.");
              setSaving(true);
              const r = await receiveReceivableAction(receivable.id, { accountId, date, amountCents: amount });
              setSaving(false);
              if (!r.ok) return toast.error(r.error);
              toast.success(r.message);
              onClose();
            }}
          >
            <Field label="Conta" htmlFor="rc-acc"><Select id="rc-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="Data" htmlFor="rc-date"><Input id="rc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field label="Valor recebido" htmlFor="rc-amount" hint="Altere se recebeu valor diferente (juros, desconto)."><MoneyInput id="rc-amount" value={amount} onChange={setAmount} required /></Field>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ base, sale, onClose }: { base: FinanceBase; sale: SaleRow; onClose: () => void }) {
  const accounts = base.accounts.filter((a) => !a.archived);
  const max = sale.receivedCents - sale.refundedCents;
  const [amount, setAmount] = React.useState<number | null>(max);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [date, setDate] = React.useState(base.today);
  const [cancelPending, setCancelPending] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar reembolso</DialogTitle>
          <DialogDescription>{sale.customerName} · até {formatBRL(max)}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!amount) return toast.error("Informe o valor.");
            setSaving(true);
            const r = await refundSaleAction(sale.id, { amountCents: amount, accountId, date, cancelPending });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
          }}
        >
          <Field label="Valor" htmlFor="rf-amount"><MoneyInput id="rf-amount" value={amount} onChange={setAmount} required /></Field>
          <Field label="Conta de saída" htmlFor="rf-acc"><Select id="rf-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Data" htmlFor="rf-date"><Input id="rf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={cancelPending} onChange={(e) => setCancelPending(e.target.checked)} /> Cancelar parcelas pendentes</label>
          <p className="text-xs text-muted-foreground">O reembolso entra como despesa (Reembolsos) e reduz o lucro do mês.</p>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProgramsDialog({ base, programs, onClose }: { base: FinanceBase; programs: Program[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState<number | null>(null);
  const [weeks, setWeeks] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Produtos e mentorias</DialogTitle>
          <DialogDescription>Cadastre o que você vende para agilizar o registro das vendas.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {programs.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span className={cn("flex-1", !p.active && "text-muted-foreground line-through")}>{p.name}</span>
              {p.priceCents !== null && <Money cents={p.priceCents} tone="muted" />}
              {p.durationWeeks && <span className="text-xs text-muted-foreground">{p.durationWeeks} sem.</span>}
              <Button size="sm" variant="ghost" onClick={async () => { const r = await updateProgramAction(p.id, { name: p.name, priceCents: p.priceCents, durationWeeks: p.durationWeeks, active: !p.active }); if (!r.ok) toast.error(r.error); else router.refresh(); }}>
                {p.active ? "Desativar" : "Ativar"}
              </Button>
            </li>
          ))}
          {programs.length === 0 && <li className="text-sm text-muted-foreground">Nenhum produto ainda.</li>}
        </ul>
        <form
          className="grid gap-2 border-t border-border pt-4 sm:grid-cols-[1fr_140px_90px_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await createProgramAction(base.workspace.id, { name, priceCents: price, durationWeeks: weeks ? Number(weeks) : null });
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            setName("");
            setPrice(null);
            setWeeks("");
            router.refresh();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" aria-label="Nome do produto" required />
          <MoneyInput value={price} onChange={setPrice} aria-label="Preço" />
          <Input type="number" min={1} value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="Semanas" aria-label="Duração em semanas" />
          <Button type="submit" disabled={!name.trim()}>Adicionar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
