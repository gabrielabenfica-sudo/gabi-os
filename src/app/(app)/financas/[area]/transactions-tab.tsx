"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, CheckCircle2, CreditCard, Lock, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/form-controls";
import { EmptyState } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { Money } from "@/components/finance/money-input";
import { INVOICE_STATE_LABEL } from "@/lib/finance/card-cycle";
import { cn } from "@/lib/utils";
import type { TransactionRow } from "@/server/finance/transactions";
import type { InvoiceView } from "@/server/finance/cards";
import type { MentoriaMonth, PersonalMonth } from "@/server/finance/summary";
import { deleteTransactionAction, deleteTransferAction, restoreTransactionAction, setTransactionPaidAction } from "../actions";
import { PayDialog, TransactionDialog, TransferDialog } from "./dialogs";
import { useFinanceHref } from "./finance-shell";
import { dateYmd, ymdBR, type FinanceBase, type TransferTarget } from "./types";

type TransferRow = {
  id: string;
  kind: string;
  amountCents: number;
  date: Date | string;
  description: string | null;
  fromWorkspaceId: string;
  toWorkspaceId: string;
  fromAccount: { name: string } | null;
  toAccount: { name: string } | null;
  fromWorkspace: { name: string };
  toWorkspace: { name: string };
  cardInvoice: { card: { name: string } } | null;
};

const KIND_LABEL: Record<string, string> = { INTERNAL: "Transferência", DISTRIBUTION: "Retirada da Mentoria", CARD_PAYMENT: "Pagamento de fatura", INVESTMENT: "Aplicação/resgate" };

function isPersonal(t: PersonalMonth | MentoriaMonth): t is PersonalMonth {
  return "incomeRealized" in t;
}

export function TransactionsTab({
  rows,
  transfers,
  invoices,
  totals,
  targets,
  ...base
}: FinanceBase & {
  rows: TransactionRow[];
  transfers: TransferRow[];
  invoices: (InvoiceView & { cardId: string; cardName: string })[];
  totals: PersonalMonth | MentoriaMonth;
  targets: TransferTarget[];
}) {
  const router = useRouter();
  const href = useFinanceHref();
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<{ kind: "new"; type: "INCOME" | "EXPENSE" } | { kind: "edit"; row: TransactionRow } | { kind: "pay"; row: TransactionRow } | { kind: "transfer" } | null>(null);
  const params = useSearchParams();
  const [search, setSearch] = React.useState(() => params.get("q") ?? "");
  const novo = params.get("novo");
  React.useEffect(() => {
    if (novo === "despesa" || novo === "receita") {
      setDialog({ kind: "new", type: novo === "receita" ? "INCOME" : "EXPENSE" });
      router.replace(href({ novo: null }), { scroll: false });
    }
  }, [novo]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) router.replace(href({ q: search || null }), { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = isPersonal(totals)
    ? [
        { label: "Receitas recebidas", value: totals.incomeRealized + totals.distributions, tone: "in" as const },
        { label: "Receitas previstas", value: totals.incomePlanned + totals.compensationExpected, tone: "muted" as const, hint: totals.compensationExpected ? "inclui remuneração TURBO prevista" : undefined },
        { label: "Despesas pagas", value: totals.expenseRealized, tone: "out" as const },
        { label: "Despesas previstas", value: totals.expensePlanned, tone: "muted" as const },
        { label: "Cartões (faturas do mês)", value: totals.cardExpense, tone: "out" as const },
        { label: "Resultado do mês", value: totals.result, tone: "auto" as const, hint: `Realizado: ${(totals.resultRealized / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` },
      ]
    : [
        { label: "Faturamento", value: totals.revenueCents, tone: "in" as const, hint: `${totals.salesCount} venda(s)` },
        { label: "Recebimentos", value: totals.receiptsCents, tone: "in" as const },
        { label: "Despesas", value: totals.expensesCents, tone: "out" as const },
        { label: "Lucro", value: totals.profitCents, tone: "auto" as const },
        { label: "Fluxo de caixa", value: totals.cashFlowCents, tone: "auto" as const },
      ];

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error);
    else if (r.message) toast.success(r.message);
  };

  const remove = async (row: TransactionRow) => {
    let scope: "one" | "following" = "one";
    if (row.recurrenceGroupId) {
      const following = await confirm({
        title: "Excluir lançamento da série",
        description: `Este lançamento é ${row.seriesIndex}/${row.seriesTotal} de uma série. Excluir também os próximos ainda não pagos?`,
        confirmLabel: "Este e os próximos",
        cancelLabel: "Só este",
      });
      scope = following ? "following" : "one";
      if (!following && !(await confirm({ title: "Excluir só este lançamento?", confirmLabel: "Excluir", danger: true }))) return;
    } else if (!(await confirm({ title: "Excluir lançamento?", description: row.label, confirmLabel: "Excluir", danger: true }))) return;
    const r = await deleteTransactionAction(row.id, scope);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message, { action: scope === "one" ? { label: "Desfazer", onClick: () => act(() => restoreTransactionAction(row.id)) } : undefined });
  };

  const sp = (k: string) => params.get(k) ?? "";
  const activeCats = base.categories.filter((c) => !c.archived);

  return (
    <div className="grid gap-5">
      <section className={cn("grid gap-3", kpis.length === 6 ? "grid-cols-2 lg:grid-cols-6" : "grid-cols-2 lg:grid-cols-5")} aria-label="Totais do mês">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <Money cents={k.value} tone={k.tone} className="text-lg font-semibold" />
            {"hint" in k && k.hint && <p className="text-[11px] text-muted-foreground">{k.hint}</p>}
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialog({ kind: "new", type: "EXPENSE" })}><Plus /> Despesa</Button>
        <Button variant="outline" onClick={() => setDialog({ kind: "new", type: "INCOME" })}><Plus /> Receita</Button>
        <Button variant="outline" onClick={() => setDialog({ kind: "transfer" })} disabled={!base.accounts.length}><ArrowLeftRight /> Transferência</Button>
        <div className="relative ml-auto min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="pl-8" aria-label="Buscar lançamentos" />
        </div>
        <Select aria-label="Tipo" value={sp("tipo")} onChange={(e) => router.replace(href({ tipo: e.target.value }), { scroll: false })} className="w-32">
          <option value="">Tudo</option>
          <option value="INCOME">Receitas</option>
          <option value="EXPENSE">Despesas</option>
        </Select>
        <Select aria-label="Situação" value={sp("situacao")} onChange={(e) => router.replace(href({ situacao: e.target.value }), { scroll: false })} className="w-36">
          <option value="">Qualquer situação</option>
          <option value="PLANNED">Previstos</option>
          <option value="REALIZED">Pagos/recebidos</option>
          <option value="OVERDUE">Vencidos</option>
        </Select>
        <Select aria-label="Categoria" value={sp("categoria")} onChange={(e) => router.replace(href({ categoria: e.target.value }), { scroll: false })} className="w-40">
          <option value="">Categorias</option>
          {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Conta" value={sp("conta")} onChange={(e) => router.replace(href({ conta: e.target.value }), { scroll: false })} className="w-36">
          <option value="">Contas</option>
          {base.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum lançamento neste mês" description="Registre receitas e despesas, avulsas, fixas, recorrentes ou parceladas." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm" data-testid="transactions">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-3 py-2 text-left font-medium">Descrição</th>
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                <th className="px-3 py-2 text-left font-medium">Conta</th>
                <th className="px-3 py-2 text-left font-medium">Situação</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/30" data-row={r.label}>
                  <td className="whitespace-nowrap px-4 py-2 tabular text-muted-foreground">
                    {ymdBR(dateYmd(r.competenceDate)).slice(0, 5)}
                    {r.dueDate && dateYmd(r.dueDate) !== dateYmd(r.competenceDate) && <span className="block text-[11px]">vence {ymdBR(dateYmd(r.dueDate)).slice(0, 5)}</span>}
                  </td>
                  <td className="max-w-72 px-3 py-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      {r.locked && <Lock className="size-3.5 text-muted-foreground" aria-label="Gerado automaticamente" />}
                      <span className="truncate">{r.label}</span>
                    </span>
                    {r.nature !== "ONE_OFF" && r.nature !== "INSTALLMENT" && <span className="text-[11px] text-muted-foreground">{r.nature === "FIXED" ? "Fixa" : r.nature === "VARIABLE" ? "Variável" : "Recorrente"}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.category?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.account?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.status === "REALIZED" ? (
                      <Badge variant="success">{r.type === "INCOME" ? "Recebido" : "Pago"} {r.paidAt ? ymdBR(dateYmd(r.paidAt)).slice(0, 5) : ""}</Badge>
                    ) : r.overdue ? (
                      <Badge variant="danger">Vencido</Badge>
                    ) : (
                      <Badge variant="outline">Previsto</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    <Money cents={r.type === "INCOME" ? r.amountCents : -r.amountCents} tone={r.type === "INCOME" ? "in" : "out"} signed />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      {!r.locked && r.status === "PLANNED" && (
                        <Button size="icon" variant="ghost" aria-label={`Marcar ${r.label} como ${r.type === "INCOME" ? "recebido" : "pago"}`} title={r.type === "INCOME" ? "Recebido" : "Pago"} onClick={() => setDialog({ kind: "pay", row: r })}>
                          <CheckCircle2 />
                        </Button>
                      )}
                      {r.locked ? (
                        <Button size="icon" variant="ghost" asChild title="Abrir origem">
                          <Link href={r.compensationRecordId ? "/turbo/remuneracao" : href({ aba: "vendas", venda: r.saleId })} aria-label="Abrir origem"><RotateCcw /></Link>
                        </Button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="grid size-9 place-items-center rounded-md hover:bg-accent" aria-label={`Ações de ${r.label}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", row: r })}><Pencil /> Editar</DropdownMenuItem>
                            {r.status === "REALIZED" && <DropdownMenuItem onSelect={() => act(() => setTransactionPaidAction(r.id, { paid: false }))}><Undo2 /> Voltar para previsto</DropdownMenuItem>}
                            <DropdownMenuItem className="text-danger" onSelect={() => void remove(r)}><Trash2 /> Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoices.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">Faturas de cartão deste mês</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link href={href({ aba: "cartoes", cartao: i.cardId, fatura: i.id })} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40">
                  <CreditCard className="size-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{i.cardName}</p>
                    <p className="text-xs text-muted-foreground">Vence {ymdBR(i.dueDate)} · {INVOICE_STATE_LABEL[i.state]}</p>
                  </div>
                  <Money cents={i.totalCents} tone="out" className="font-medium" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">As compras do cartão contam como despesa no mês de vencimento da fatura. O pagamento da fatura só movimenta a conta.</p>
        </section>
      )}

      {transfers.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">Transferências do mês</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {transfers.map((t) => {
              const incoming = t.toWorkspaceId === base.workspace.id && t.fromWorkspaceId !== base.workspace.id;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <ArrowLeftRight className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.kind === "CARD_PAYMENT" ? `Pagamento da fatura ${t.cardInvoice?.card.name ?? ""}` : t.description || KIND_LABEL[t.kind]}</p>
                    <p className="text-xs text-muted-foreground">
                      {ymdBR(dateYmd(t.date))} · {t.fromAccount?.name ?? "—"}{t.fromWorkspaceId !== base.workspace.id ? ` (${t.fromWorkspace.name})` : ""} → {t.kind === "CARD_PAYMENT" ? "cartão" : `${t.toAccount?.name ?? "—"}${t.toWorkspaceId !== base.workspace.id ? ` (${t.toWorkspace.name})` : ""}`} · {KIND_LABEL[t.kind]}
                    </p>
                  </div>
                  <Money cents={incoming ? t.amountCents : -t.amountCents} tone={incoming ? "in" : "muted"} signed />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Excluir transferência"
                    onClick={async () => {
                      if (await confirm({ title: "Excluir transferência?", confirmLabel: "Excluir", danger: true })) await act(() => deleteTransferAction(t.id));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dialog?.kind === "new" && <TransactionDialog base={base} initialType={dialog.type} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <TransactionDialog base={base} edit={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "pay" && <PayDialog base={base} row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "transfer" && <TransferDialog base={base} targets={targets} onClose={() => setDialog(null)} />}
    </div>
  );
}
