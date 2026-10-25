"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, EmptyState } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { Money, MoneyInput } from "@/components/finance/money-input";
import { formatBRL } from "@/lib/money";
import { formatYm } from "@/lib/dates";
import { INVOICE_STATE_LABEL, invoiceForPurchase, type InvoiceState } from "@/lib/finance/card-cycle";
import { cn } from "@/lib/utils";
import type { CardSummary, InvoiceView } from "@/server/finance/cards";
import { archiveCardAction, createCardAction, createPurchaseAction, deletePurchaseAction, deleteTransferAction, payInvoiceAction, updateCardAction, updatePurchaseAction } from "../actions";
import { useFinanceHref } from "./finance-shell";
import { dateYmd, ymdBR, type FinanceBase } from "./types";

type InvoiceDetail = InvoiceView & {
  card: { id: string; name: string };
  installments: {
    id: string;
    number: number;
    amountCents: number;
    purchase: { id: string; description: string; totalCents: number; installmentsCount: number; purchaseDate: Date | string; categoryId: string | null; notes: string | null; category: { name: string } | null };
  }[];
  payments: { id: string; amountCents: number; date: Date | string; fromAccount: { name: string } | null }[];
};

type Purchase = { id: string; description: string; totalCents: number; installmentsCount: number; purchaseDate: Date | string; categoryId: string | null; notes: string | null };

const STATE_VARIANT: Record<InvoiceState, "default" | "success" | "warning" | "danger" | "outline" | "info"> = {
  OPEN: "info",
  CLOSED: "warning",
  OVERDUE: "danger",
  PARTIAL: "warning",
  PAID: "success",
  EMPTY: "outline",
};

export function CardsTab({
  cards,
  selectedId,
  invoices,
  invoice,
  purchases,
  ...base
}: FinanceBase & { cards: CardSummary[]; selectedId: string | null; invoices: InvoiceView[]; invoice: InvoiceDetail | null; purchases: Purchase[] }) {
  const href = useFinanceHref();
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<{ kind: "card"; edit?: CardSummary } | { kind: "purchase"; edit?: Purchase } | { kind: "pay" } | null>(null);
  const selected = cards.find((c) => c.id === selectedId) ?? null;

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error);
    else if (r.message) toast.success(r.message);
    return r.ok;
  };

  if (!cards.length) {
    return (
      <>
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão cadastrado"
          description="Cadastre o cartão com limite, dia de fechamento e de vencimento. As compras parceladas são distribuídas automaticamente nas faturas seguintes."
          action={<Button onClick={() => setDialog({ kind: "card" })}><Plus /> Cadastrar cartão</Button>}
        />
        {dialog?.kind === "card" && <CardDialog base={base} onClose={() => setDialog(null)} />}
      </>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="grid content-start gap-3">
        <Button onClick={() => setDialog({ kind: "card" })} variant="outline"><Plus /> Novo cartão</Button>
        <ul className="grid gap-2" aria-label="Cartões">
          {cards.map((c) => {
            const usedPct = c.limitCents ? Math.min(100, (c.usedCents / c.limitCents) * 100) : 0;
            return (
              <li key={c.id}>
                <Link
                  href={href({ cartao: c.id, fatura: null })}
                  scroll={false}
                  aria-current={c.id === selectedId ? "true" : undefined}
                  className={cn("grid gap-2 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/40", c.id === selectedId ? "border-primary/50 ring-1 ring-primary/30" : "border-border", c.archived && "opacity-60")}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{c.name}</span>
                    {c.overdue.length > 0 && <Badge variant="danger">Vencida</Badge>}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className={cn("h-full rounded-full", usedPct > 90 ? "bg-danger" : "bg-[var(--chart-out)]")} style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="flex justify-between text-xs text-muted-foreground">
                    <span>Disponível {formatBRL(c.availableCents)}</span>
                    <span>de {formatBRL(c.limitCents)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Fecha dia {c.closingDay} · vence dia {c.dueDay}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {selected && (
        <section className="grid content-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            {selected.institution && <span className="text-sm text-muted-foreground">{selected.institution}</span>}
            <div className="ml-auto flex gap-2">
              {!selected.archived && <Button onClick={() => setDialog({ kind: "purchase" })}><Plus /> Nova compra</Button>}
              <Button variant="outline" size="icon" aria-label="Editar cartão" onClick={() => setDialog({ kind: "card", edit: selected })}><Pencil /></Button>
              <Button variant="outline" size="icon" aria-label={selected.archived ? "Reativar cartão" : "Arquivar cartão"} onClick={() => act(() => archiveCardAction(selected.id, !selected.archived))}>
                {selected.archived ? <ArchiveRestore /> : <Archive />}
              </Button>
            </div>
          </div>

          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma compra lançada neste cartão.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Faturas">
              {invoices.map((i) => (
                <Link
                  key={i.id}
                  href={href({ fatura: i.id })}
                  scroll={false}
                  role="tab"
                  aria-selected={invoice?.id === i.id}
                  className={cn("grid min-w-32 gap-0.5 rounded-lg border px-3 py-2 text-left", invoice?.id === i.id ? "border-primary/50 bg-card shadow-sm" : "border-border bg-muted/40 hover:bg-card")}
                >
                  <span className="text-xs font-medium capitalize">{formatYm(i.referenceMonth.slice(0, 7), true)}</span>
                  <span className="tabular text-sm font-semibold">{formatBRL(i.totalCents)}</span>
                  <span className="text-[11px] text-muted-foreground">{INVOICE_STATE_LABEL[i.state]}</span>
                </Link>
              ))}
            </div>
          )}

          {invoice && (
            <div className="grid gap-4 rounded-xl border border-border bg-card p-4" data-testid="invoice">
              <div className="flex flex-wrap items-start gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Fatura de {formatYm(invoice.referenceMonth.slice(0, 7))}</p>
                  <p className="text-2xl font-semibold tabular">{formatBRL(invoice.totalCents)}</p>
                  <Badge variant={STATE_VARIANT[invoice.state]}>{INVOICE_STATE_LABEL[invoice.state]}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Fecha em</dt><dd className="tabular">{ymdBR(invoice.closingDate)}</dd>
                  <dt className="text-muted-foreground">Vence em</dt><dd className="tabular">{ymdBR(invoice.dueDate)}</dd>
                  <dt className="text-muted-foreground">Pago</dt><dd className="tabular">{formatBRL(invoice.paidCents)}</dd>
                  <dt className="text-muted-foreground">Falta pagar</dt><dd className="tabular font-medium">{formatBRL(invoice.remainingCents)}</dd>
                </dl>
                {invoice.remainingCents > 0 && (
                  <Button className="ml-auto" onClick={() => setDialog({ kind: "pay" })} disabled={!base.accounts.some((a) => !a.archived)}>Pagar fatura</Button>
                )}
              </div>

              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Data</th>
                    <th className="py-2 text-left font-medium">Compra</th>
                    <th className="py-2 text-left font-medium">Categoria</th>
                    <th className="py-2 text-right font-medium">Valor</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {invoice.installments.map((i) => (
                    <tr key={i.id} className="border-b border-border last:border-0">
                      <td className="py-2 tabular text-muted-foreground">{ymdBR(dateYmd(i.purchase.purchaseDate)).slice(0, 5)}</td>
                      <td className="py-2">
                        {i.purchase.description}
                        {i.purchase.installmentsCount > 1 && <span className="ml-1 text-xs text-muted-foreground">({i.number}/{i.purchase.installmentsCount})</span>}
                      </td>
                      <td className="py-2 text-muted-foreground">{i.purchase.category?.name ?? "—"}</td>
                      <td className="py-2 text-right"><Money cents={i.amountCents} tone={i.amountCents < 0 ? "in" : undefined} /></td>
                      <td className="py-2">
                        <div className="flex justify-end">
                          <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar ${i.purchase.description}`} onClick={() => setDialog({ kind: "purchase", edit: i.purchase })}><Pencil /></Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label={`Excluir ${i.purchase.description}`}
                            onClick={async () => {
                              if (await confirm({ title: "Excluir compra?", description: i.purchase.installmentsCount > 1 ? `Todas as ${i.purchase.installmentsCount} parcelas serão removidas das faturas.` : undefined, confirmLabel: "Excluir", danger: true })) await act(() => deletePurchaseAction(i.purchase.id));
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoice.installments.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sem compras nesta fatura.</td></tr>}
                </tbody>
              </table>

              {invoice.payments.length > 0 && (
                <div className="grid gap-1">
                  <h3 className="text-sm font-semibold">Pagamentos</h3>
                  {invoice.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 text-sm">
                      <span className="tabular text-muted-foreground">{ymdBR(dateYmd(p.date))}</span>
                      <span className="flex-1">{p.fromAccount?.name ?? "—"}</span>
                      <Money cents={p.amountCents} />
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Excluir pagamento" onClick={async () => { if (await confirm({ title: "Excluir pagamento?", confirmLabel: "Excluir", danger: true })) await act(() => deleteTransferAction(p.id)); }}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">O pagamento sai da conta como transferência: as compras já contam como despesa.</p>
                </div>
              )}
            </div>
          )}

          {purchases.length > 0 && (
            <details className="rounded-xl border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium">Todas as compras ({purchases.length})</summary>
              <ul className="mt-3 divide-y divide-border">
                {purchases.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <span className="tabular text-muted-foreground">{ymdBR(dateYmd(p.purchaseDate))}</span>
                    <span className="flex-1">{p.description}{p.installmentsCount > 1 ? ` · ${p.installmentsCount}x` : ""}</span>
                    <Money cents={p.totalCents} />
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar ${p.description}`} onClick={() => setDialog({ kind: "purchase", edit: p })}><Pencil /></Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {dialog?.kind === "card" && <CardDialog base={base} edit={dialog.edit} onClose={() => setDialog(null)} />}
      {dialog?.kind === "purchase" && selected && <PurchaseDialog base={base} card={selected} edit={dialog.edit} onClose={() => setDialog(null)} />}
      {dialog?.kind === "pay" && invoice && <PayInvoiceDialog base={base} invoice={invoice} defaultAccount={selected?.paymentAccountId ?? null} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CardDialog({ base, edit, onClose }: { base: FinanceBase; edit?: CardSummary; onClose: () => void }) {
  const [v, setV] = React.useState({
    name: edit?.name ?? "",
    institution: edit?.institution ?? "",
    limitCents: edit?.limitCents ?? (null as number | null),
    closingDay: edit?.closingDay ?? 1,
    dueDay: edit?.dueDay ?? 10,
    paymentAccountId: edit?.paymentAccountId ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          <DialogDescription>Compras feitas no dia do fechamento ou depois entram na fatura seguinte.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const input = { name: v.name, institution: v.institution || null, limitCents: v.limitCents ?? 0, closingDay: v.closingDay, dueDay: v.dueDay, paymentAccountId: v.paymentAccountId || null };
            const r = edit ? await updateCardAction(edit.id, input) : await createCardAction({ ...input, workspaceId: base.workspace.id });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="cd-name"><Input id="cd-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required autoFocus maxLength={60} /></Field>
            <Field label="Instituição" htmlFor="cd-inst"><Input id="cd-inst" value={v.institution} onChange={(e) => setV({ ...v, institution: e.target.value })} maxLength={60} /></Field>
            <Field label="Limite" htmlFor="cd-limit"><MoneyInput id="cd-limit" value={v.limitCents} onChange={(c) => setV({ ...v, limitCents: c })} /></Field>
            <Field label="Conta para pagamento" htmlFor="cd-acc">
              <Select id="cd-acc" value={v.paymentAccountId} onChange={(e) => setV({ ...v, paymentAccountId: e.target.value })}>
                <option value="">Escolher ao pagar</option>
                {base.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Dia de fechamento" htmlFor="cd-close"><Input id="cd-close" type="number" min={1} max={31} value={v.closingDay} onChange={(e) => setV({ ...v, closingDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
            <Field label="Dia de vencimento" htmlFor="cd-due"><Input id="cd-due" type="number" min={1} max={31} value={v.dueDay} onChange={(e) => setV({ ...v, dueDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
          </div>
          {edit && <p className="text-xs text-muted-foreground">Mudanças de fechamento/vencimento valem para compras novas; faturas existentes mantêm suas datas.</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseDialog({ base, card, edit, onClose }: { base: FinanceBase; card: CardSummary; edit?: Purchase; onClose: () => void }) {
  const [v, setV] = React.useState({
    description: edit?.description ?? "",
    totalCents: edit ? Math.abs(edit.totalCents) : (null as number | null),
    credit: edit ? edit.totalCents < 0 : false,
    installmentsCount: edit?.installmentsCount ?? 1,
    purchaseDate: edit ? dateYmd(edit.purchaseDate) : base.today,
    categoryId: edit?.categoryId ?? "",
    notes: edit?.notes ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const slot = v.purchaseDate ? invoiceForPurchase(v.purchaseDate, card.closingDay, card.dueDay) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar compra" : "Nova compra"} · {card.name}</DialogTitle>
          <DialogDescription>{slot ? `1ª parcela na fatura de ${formatYm(slot.referenceMonth.slice(0, 7))} (vence ${ymdBR(slot.dueDate)}).` : ""}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!v.totalCents) return toast.error("Informe o valor.");
            setSaving(true);
            const input = {
              description: v.description,
              totalCents: v.credit ? -v.totalCents : v.totalCents,
              installmentsCount: v.credit ? 1 : v.installmentsCount,
              purchaseDate: v.purchaseDate,
              categoryId: v.categoryId || null,
              notes: v.notes || null,
            };
            const r = edit ? await updatePurchaseAction(edit.id, input) : await createPurchaseAction({ ...input, cardId: card.id });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Descrição" htmlFor="pu-desc" className="sm:col-span-2"><Input id="pu-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} required autoFocus maxLength={200} /></Field>
            <Field label="Valor total" htmlFor="pu-total" hint={!v.credit && v.installmentsCount > 1 && v.totalCents ? `${v.installmentsCount}x de aprox. ${formatBRL(Math.floor(v.totalCents / v.installmentsCount))}` : undefined}>
              <MoneyInput id="pu-total" value={v.totalCents} onChange={(c) => setV({ ...v, totalCents: c })} required />
            </Field>
            <Field label="Parcelas" htmlFor="pu-inst">
              <Select id="pu-inst" value={v.installmentsCount} onChange={(e) => setV({ ...v, installmentsCount: Number(e.target.value) })} disabled={v.credit}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>)}
              </Select>
            </Field>
            <Field label="Data da compra" htmlFor="pu-date"><Input id="pu-date" type="date" value={v.purchaseDate} onChange={(e) => setV({ ...v, purchaseDate: e.target.value })} required /></Field>
            <Field label="Categoria" htmlFor="pu-cat">
              <Select id="pu-cat" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
                <option value="">Sem categoria</option>
                {base.categories.filter((c) => c.kind === "EXPENSE" && !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={v.credit} onChange={(e) => setV({ ...v, credit: e.target.checked })} /> Estorno ou crédito (abate da fatura)
            </label>
            <Field label="Observações" htmlFor="pu-notes" className="sm:col-span-2"><Textarea id="pu-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : edit ? "Salvar" : "Lançar compra"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayInvoiceDialog({ base, invoice, defaultAccount, onClose }: { base: FinanceBase; invoice: InvoiceDetail; defaultAccount: string | null; onClose: () => void }) {
  const accounts = base.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = React.useState(defaultAccount && accounts.some((a) => a.id === defaultAccount) ? defaultAccount : accounts[0]?.id ?? "");
  const [amount, setAmount] = React.useState<number | null>(invoice.remainingCents);
  const [date, setDate] = React.useState(base.today);
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar fatura</DialogTitle>
          <DialogDescription>{invoice.card.name} · {formatYm(invoice.referenceMonth.slice(0, 7))} · falta {formatBRL(invoice.remainingCents)}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!amount) return toast.error("Informe o valor.");
            setSaving(true);
            const r = await payInvoiceAction(invoice.id, { accountId, amountCents: amount, date });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
          }}
        >
          <Field label="Conta" htmlFor="pi-acc">
            <Select id="pi-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Valor pago" htmlFor="pi-amount" hint="Pode ser parcial.">
            <MoneyInput id="pi-amount" value={amount} onChange={setAmount} required />
          </Field>
          <Field label="Data" htmlFor="pi-date"><Input id="pi-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Registrar pagamento"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
