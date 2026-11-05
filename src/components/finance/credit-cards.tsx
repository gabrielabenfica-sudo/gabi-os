import { useMemo, useState } from "react";
import { addMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, CreditCard as CardIcon, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useCardEntries, useCardInvoices, useCreditCards } from "@/lib/queries";
import { useCardEntryMutations, useCreditCardMutations, useToggleCardInvoice } from "@/lib/mutations";
import {
  centsToInput,
  firstInvoiceFromCurrent,
  invoiceDueDate,
  invoiceLines,
  lastInvoice,
  monthStart,
  parseMoney,
  remainingFrom,
  sumLines,
} from "@/lib/credit";
import { StatCard } from "@/components/common/page-parts";
import type { CardEntry, CreditCard } from "@/lib/types";

const COLORS = ["#8f5b6b", "#3d5a80", "#5b7f63", "#b07d3a", "#6b5b95", "#4a4a4a"];

const monthInput = (iso: string) => iso.slice(0, 7);
const fromMonthInput = (value: string) => (value ? `${value}-01` : "");
const monthLabel = (iso: string, pattern = "MMM/yy") => format(parseISO(iso), pattern, { locale: ptBR });

type CardForm = {
  name: string;
  bank: string;
  last4: string;
  closing_day: string;
  due_day: string;
  limit: string;
  color: string;
};

type EntryForm = {
  kind: "INSTALLMENT" | "RECURRING";
  description: string;
  category: string;
  amountMode: "PARCELA" | "TOTAL";
  amount: string;
  installments: string;
  current: string;
  invoice: string;
  endInvoice: string;
};

export function CreditCardsSection({ scope, month }: { scope: string; month: Date }) {
  const { data: allCards = [] } = useCreditCards();
  const { data: entries = [] } = useCardEntries();
  const { data: invoices = [] } = useCardInvoices();
  const cardMutations = useCreditCardMutations();
  const entryMutations = useCardEntryMutations();
  const toggleInvoice = useToggleCardInvoice();

  const current = monthStart(month);
  const cards = allCards.filter((card) => card.scope === scope && !card.archived);

  const [cardDialog, setCardDialog] = useState<{ open: boolean; card: CreditCard | null }>({ open: false, card: null });
  const [cardForm, setCardForm] = useState<CardForm>({
    name: "", bank: "", last4: "", closing_day: "", due_day: "", limit: "", color: COLORS[0],
  });
  const [confirmCardDelete, setConfirmCardDelete] = useState(false);

  const [entryDialog, setEntryDialog] = useState<{ open: boolean; cardId: string; entry: CardEntry | null }>({
    open: false, cardId: "", entry: null,
  });
  const [entryForm, setEntryForm] = useState<EntryForm>({
    kind: "INSTALLMENT", description: "", category: "", amountMode: "PARCELA", amount: "",
    installments: "1", current: "1", invoice: current, endInvoice: "",
  });
  const [confirmEntryDelete, setConfirmEntryDelete] = useState(false);

  const entriesOf = (cardId: string) => entries.filter((entry) => entry.card_id === cardId);
  const isPaid = (cardId: string) => invoices.some((inv) => inv.card_id === cardId && inv.invoice_month === current && inv.paid_at);

  const summary = useMemo(() => {
    const cardIds = new Set(cards.map((card) => card.id));
    const scoped = entries.filter((entry) => cardIds.has(entry.card_id));
    const invoiceTotal = sumLines(invoiceLines(scoped, current));
    const pending = scoped.reduce((sum, entry) => sum + remainingFrom(entry, current).cents, 0);
    const recurring = invoiceLines(scoped, current)
      .filter((line) => line.entry.kind === "RECURRING")
      .reduce((sum, line) => sum + line.amountCents, 0);
    const paidTotal = cards
      .filter((card) => isPaid(card.id))
      .reduce((sum, card) => sum + sumLines(invoiceLines(entriesOf(card.id), current)), 0);
    return { invoiceTotal, pending, recurring, paidTotal };
  }, [cards, entries, invoices, current]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- card dialog ----- */
  const openCard = (card: CreditCard | null) => {
    setCardForm(
      card
        ? {
            name: card.name,
            bank: card.bank ?? "",
            last4: card.last4 ?? "",
            closing_day: card.closing_day ? String(card.closing_day) : "",
            due_day: card.due_day ? String(card.due_day) : "",
            limit: centsToInput(card.limit_cents),
            color: card.color ?? COLORS[0],
          }
        : { name: "", bank: "", last4: "", closing_day: "", due_day: "", limit: "", color: COLORS[cards.length % COLORS.length] },
    );
    setConfirmCardDelete(false);
    setCardDialog({ open: true, card });
  };

  const dayOrNull = (value: string) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  };

  const saveCard = () => {
    if (!cardForm.name.trim()) {
      toast.error("Dê um nome ao cartão.");
      return;
    }
    const values = {
      name: cardForm.name.trim(),
      bank: cardForm.bank.trim() || null,
      last4: cardForm.last4.replace(/\D/g, "").slice(-4) || null,
      closing_day: dayOrNull(cardForm.closing_day),
      due_day: dayOrNull(cardForm.due_day),
      limit_cents: parseMoney(cardForm.limit),
      color: cardForm.color,
    };
    const done = {
      onSuccess: () => {
        toast.success(cardDialog.card ? "Cartão atualizado." : "Cartão adicionado.");
        setCardDialog({ open: false, card: null });
      },
      onError: (error: unknown) => toast.error(`Não foi possível salvar o cartão. ${error instanceof Error ? error.message : ""}`),
    };
    if (cardDialog.card) cardMutations.update.mutate({ id: cardDialog.card.id, values }, done);
    else cardMutations.create.mutate({ ...values, scope, archived: false }, done);
  };

  const deleteCard = () => {
    if (!cardDialog.card) return;
    if (!confirmCardDelete) {
      setConfirmCardDelete(true);
      return;
    }
    cardMutations.remove.mutate(cardDialog.card.id, {
      onSuccess: () => {
        toast.success("Cartão excluído com as compras dele.");
        setCardDialog({ open: false, card: null });
      },
      onError: () => toast.error("Não foi possível excluir o cartão."),
    });
  };

  /* ----- entry dialog ----- */
  const openEntry = (cardId: string, kind: EntryForm["kind"], entry: CardEntry | null = null) => {
    if (entry) {
      const offset =
        (parseISO(current).getFullYear() - parseISO(entry.first_invoice).getFullYear()) * 12 +
        (parseISO(current).getMonth() - parseISO(entry.first_invoice).getMonth());
      const inRange = entry.kind === "INSTALLMENT" && offset >= 0 && offset < entry.installments;
      setEntryForm({
        kind: entry.kind,
        description: entry.description,
        category: entry.category ?? "",
        amountMode: "PARCELA",
        amount: centsToInput(entry.amount_cents),
        installments: String(entry.installments),
        current: inRange ? String(offset + 1) : "1",
        invoice: inRange ? current : entry.first_invoice,
        endInvoice: entry.end_invoice ?? "",
      });
    } else {
      setEntryForm({
        kind, description: "", category: "", amountMode: "PARCELA", amount: "",
        installments: kind === "INSTALLMENT" ? "2" : "1", current: "1", invoice: current, endInvoice: "",
      });
    }
    setConfirmEntryDelete(false);
    setEntryDialog({ open: true, cardId, entry });
  };

  const setEntry = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) =>
    setEntryForm((prev) => ({ ...prev, [key]: value }));

  const totalInstallments = Math.max(1, Math.round(Number(entryForm.installments) || 1));
  const typedCents = parseMoney(entryForm.amount);
  const perInstallment =
    typedCents === null ? null : entryForm.amountMode === "TOTAL" ? Math.round(typedCents / totalInstallments) : typedCents;

  const saveEntry = () => {
    if (!entryForm.description.trim()) {
      toast.error("Descreva a compra.");
      return;
    }
    if (!perInstallment || perInstallment <= 0) {
      toast.error("Informe o valor.");
      return;
    }
    if (!entryForm.invoice) {
      toast.error("Escolha a fatura.");
      return;
    }
    const isInstallment = entryForm.kind === "INSTALLMENT";
    const currentNumber = Math.max(1, Math.round(Number(entryForm.current) || 1));
    if (isInstallment && currentNumber > totalInstallments) {
      toast.error("A parcela atual não pode ser maior que o total de parcelas.");
      return;
    }
    const values = {
      card_id: entryDialog.cardId,
      kind: entryForm.kind,
      description: entryForm.description.trim(),
      category: entryForm.category.trim() || null,
      amount_cents: perInstallment,
      installments: isInstallment ? totalInstallments : 1,
      first_invoice: isInstallment ? firstInvoiceFromCurrent(currentNumber, entryForm.invoice) : entryForm.invoice,
      end_invoice: isInstallment ? null : entryForm.endInvoice || null,
    };
    const done = {
      onSuccess: () => {
        toast.success(entryDialog.entry ? "Atualizado." : isInstallment ? "Parcelamento adicionado." : "Recorrência adicionada.");
        setEntryDialog({ open: false, cardId: "", entry: null });
      },
      onError: (error: unknown) => toast.error(`Não foi possível salvar. ${error instanceof Error ? error.message : ""}`),
    };
    if (entryDialog.entry) entryMutations.update.mutate({ id: entryDialog.entry.id, values }, done);
    else entryMutations.create.mutate(values, done);
  };

  const deleteEntry = () => {
    if (!entryDialog.entry) return;
    if (!confirmEntryDelete) {
      setConfirmEntryDelete(true);
      return;
    }
    entryMutations.remove.mutate(entryDialog.entry.id, {
      onSuccess: () => {
        toast.success("Excluído.");
        setEntryDialog({ open: false, cardId: "", entry: null });
      },
      onError: () => toast.error("Não foi possível excluir."),
    });
  };

  const endRecurrenceHere = () => {
    if (!entryDialog.entry) return;
    entryMutations.update.mutate(
      { id: entryDialog.entry.id, values: { end_invoice: current } },
      {
        onSuccess: () => {
          toast.success(`Recorrência encerrada na fatura de ${monthLabel(current, "MMMM")}.`);
          setEntryDialog({ open: false, cardId: "", entry: null });
        },
      },
    );
  };

  const selectedCard = allCards.find((card) => card.id === entryDialog.cardId);
  const firstPreview =
    entryForm.kind === "INSTALLMENT" && entryForm.invoice
      ? firstInvoiceFromCurrent(Math.max(1, Math.round(Number(entryForm.current) || 1)), entryForm.invoice)
      : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Faturas de ${monthLabel(current, "MMMM")}`}
          value={formatCurrency(summary.invoiceTotal)}
          hint={`${formatCurrency(summary.paidTotal)} já pago`}
          icon={<CardIcon className="size-4" />}
          accent
        />
        <StatCard
          label="Parcelas a pagar"
          value={formatCurrency(summary.pending)}
          hint={`de ${monthLabel(current, "MMM/yy")} até a última parcela`}
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Recorrências no mês"
          value={formatCurrency(summary.recurring)}
          hint="assinaturas e cobranças fixas"
          icon={<Repeat className="size-4" />}
        />
        <StatCard
          label="Cartões"
          value={String(cards.length)}
          hint={cards.length ? cards.map((card) => card.name).join(" · ") : "nenhum ainda"}
          icon={<CardIcon className="size-4" />}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => openCard(null)}>
          <Plus className="size-4" /> Novo cartão
        </Button>
      </div>

      {cards.length === 0 ? (
        <Card className="border-dashed border-border/70">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum cartão cadastrado aqui. Adicione o primeiro para lançar parcelas e recorrências.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {cards.map((card) => {
          const cardEntries = entriesOf(card.id);
          const lines = invoiceLines(cardEntries, current);
          const total = sumLines(lines);
          const paid = isPaid(card.id);
          const committed = cardEntries.reduce((sum, entry) => sum + remainingFrom(entry, current).cents, 0);
          const usage = card.limit_cents ? Math.min(100, Math.round((committed / card.limit_cents) * 100)) : null;
          const upcoming = Array.from({ length: 6 }, (_, i) => {
            const m = monthStart(addMonths(parseISO(current), i + 1));
            return { month: m, total: sumLines(invoiceLines(cardEntries, m)) };
          });
          const maxUpcoming = Math.max(1, total, ...upcoming.map((u) => u.total));
          const due = invoiceDueDate(current, card.due_day);

          return (
            <Card key={card.id} className="overflow-hidden border-border/70 shadow-card">
              <div className="h-1.5" style={{ background: card.color ?? COLORS[0] }} />
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div>
                  <CardTitle className="font-display text-lg">{card.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {[card.bank, card.last4 ? `final ${card.last4}` : null,
                      card.closing_day ? `fecha dia ${card.closing_day}` : null,
                      card.due_day ? `vence dia ${card.due_day}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="size-8" aria-label="Editar cartão" onClick={() => openCard(card)}>
                  <Pencil className="size-3.5" />
                </Button>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Fatura de {monthLabel(current, "MMMM")} · vence {format(parseISO(due), "dd/MM")}
                    </p>
                    <p className={cn("font-display text-2xl", paid ? "text-muted-foreground line-through" : "text-foreground")}>
                      {formatCurrency(total)}
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={paid}
                      disabled={total === 0 && !paid}
                      onCheckedChange={(value) =>
                        toggleInvoice.mutate({ cardId: card.id, month: current, paid: Boolean(value) })
                      }
                    />
                    fatura paga
                  </label>
                </div>

                {card.limit_cents ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Limite comprometido com parcelas</span>
                      <span className="tabular-nums">
                        {formatCurrency(committed)} de {formatCurrency(card.limit_cents)}
                      </span>
                    </div>
                    <Progress value={usage ?? 0} className="h-1.5" />
                  </div>
                ) : null}

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Nesta fatura</p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEntry(card.id, "INSTALLMENT")}>
                        <Plus className="size-3" /> parcela
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEntry(card.id, "RECURRING")}>
                        <Repeat className="size-3" /> recorrência
                      </Button>
                    </div>
                  </div>
                  {lines.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">Nada nesta fatura.</p>
                  ) : (
                    <ul className="divide-y divide-border/50">
                      {lines.map((line) => (
                        <li key={line.entry.id}>
                          <button
                            type="button"
                            onClick={() => openEntry(card.id, line.entry.kind, line.entry)}
                            className="flex w-full items-center gap-2 py-2 text-left transition hover:bg-secondary/40"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground">{line.entry.description}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {line.number !== null
                                  ? `parcela ${line.number}/${line.entry.installments} · termina ${monthLabel(lastInvoice(line.entry))}`
                                  : `todo mês${line.entry.end_invoice ? ` até ${monthLabel(line.entry.end_invoice)}` : ""}`}
                                {line.entry.category ? ` · ${line.entry.category}` : ""}
                              </p>
                            </div>
                            {line.number === null ? (
                              <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">recorrente</Badge>
                            ) : null}
                            <span className="text-sm tabular-nums text-foreground">{formatCurrency(line.amountCents)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Próximas faturas</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {upcoming.map((item) => (
                      <div key={item.month} className="flex flex-col items-center gap-1">
                        <div className="flex h-12 w-full items-end rounded-md bg-secondary/40">
                          <div
                            className="w-full rounded-md"
                            style={{
                              height: `${Math.max(4, (item.total / maxUpcoming) * 100)}%`,
                              background: card.color ?? COLORS[0],
                              opacity: item.total ? 0.75 : 0.15,
                            }}
                          />
                        </div>
                        <span className="text-[9px] capitalize text-muted-foreground">{monthLabel(item.month, "MMM")}</span>
                        <span className="text-[9px] tabular-nums text-foreground">
                          {item.total ? formatCurrency(item.total).replace(/,\d\d$/, "") : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Card dialog */}
      <Dialog open={cardDialog.open} onOpenChange={(open) => !open && setCardDialog({ open: false, card: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{cardDialog.card ? "Editar cartão" : "Novo cartão de crédito"}</DialogTitle>
            <DialogDescription>O dia de vencimento é usado para mostrar quando cada fatura vence.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-name">Nome</Label>
                <Input id="cc-name" placeholder="Ex.: Nubank" value={cardForm.name} onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-bank">Banco</Label>
                <Input id="cc-bank" placeholder="Ex.: Nu Pagamentos" value={cardForm.bank} onChange={(e) => setCardForm({ ...cardForm, bank: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-last4">Final</Label>
                <Input id="cc-last4" inputMode="numeric" maxLength={4} placeholder="1234" value={cardForm.last4} onChange={(e) => setCardForm({ ...cardForm, last4: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-close">Fecha dia</Label>
                <Input id="cc-close" inputMode="numeric" placeholder="3" value={cardForm.closing_day} onChange={(e) => setCardForm({ ...cardForm, closing_day: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-due">Vence dia</Label>
                <Input id="cc-due" inputMode="numeric" placeholder="10" value={cardForm.due_day} onChange={(e) => setCardForm({ ...cardForm, due_day: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-limit">Limite (opcional)</Label>
              <Input id="cc-limit" inputMode="decimal" placeholder="5.000,00" value={cardForm.limit} onChange={(e) => setCardForm({ ...cardForm, limit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Cor ${color}`}
                    onClick={() => setCardForm({ ...cardForm, color })}
                    className={cn("size-7 rounded-full border-2 transition", cardForm.color === color ? "border-foreground" : "border-transparent")}
                    style={{ background: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {cardDialog.card ? (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={deleteCard}>
                <Trash2 className="size-4" /> {confirmCardDelete ? "Confirmar: apaga compras também" : "Excluir"}
              </Button>
            ) : <span />}
            <Button type="button" onClick={saveCard} disabled={cardMutations.create.isPending || cardMutations.update.isPending}>
              {cardDialog.card ? "Salvar" : "Adicionar cartão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entry dialog */}
      <Dialog open={entryDialog.open} onOpenChange={(open) => !open && setEntryDialog({ open: false, cardId: "", entry: null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {entryDialog.entry ? "Editar" : entryForm.kind === "INSTALLMENT" ? "Nova compra parcelada" : "Nova recorrência"}
              {selectedCard ? ` · ${selectedCard.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {entryForm.kind === "INSTALLMENT"
                ? "Para parcelas que você já tem, diga em qual parcela ela está e em qual fatura. O app calcula o resto."
                : "Cobranças que caem todo mês no cartão: assinaturas, mensalidades, seguros."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!entryDialog.entry ? (
              <div className="grid grid-cols-2 gap-2">
                {(["INSTALLMENT", "RECURRING"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setEntry("kind", kind)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm transition",
                      entryForm.kind === kind ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {kind === "INSTALLMENT" ? "Parcelada" : "Recorrente"}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="ce-desc">Descrição</Label>
              <Input
                id="ce-desc"
                placeholder={entryForm.kind === "INSTALLMENT" ? "Ex.: Notebook" : "Ex.: Netflix"}
                value={entryForm.description}
                onChange={(e) => setEntry("description", e.target.value)}
              />
            </div>

            {entryForm.kind === "INSTALLMENT" ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ce-amount">{entryForm.amountMode === "PARCELA" ? "Valor de cada parcela" : "Valor total da compra"}</Label>
                    <button
                      type="button"
                      className="text-[11px] text-primary"
                      onClick={() => setEntry("amountMode", entryForm.amountMode === "PARCELA" ? "TOTAL" : "PARCELA")}
                    >
                      {entryForm.amountMode === "PARCELA" ? "prefiro informar o total" : "prefiro informar a parcela"}
                    </button>
                  </div>
                  <Input id="ce-amount" inputMode="decimal" placeholder="0,00" value={entryForm.amount} onChange={(e) => setEntry("amount", e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ce-current">Parcela</Label>
                    <Input id="ce-current" inputMode="numeric" value={entryForm.current} onChange={(e) => setEntry("current", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ce-total">de</Label>
                    <Input id="ce-total" inputMode="numeric" value={entryForm.installments} onChange={(e) => setEntry("installments", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ce-invoice">na fatura de</Label>
                    <Input id="ce-invoice" type="month" value={monthInput(entryForm.invoice)} onChange={(e) => setEntry("invoice", fromMonthInput(e.target.value))} />
                  </div>
                </div>
                {perInstallment && firstPreview ? (
                  <p className="rounded-lg bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
                    {totalInstallments}x de {formatCurrency(perInstallment)} = {formatCurrency(perInstallment * totalInstallments)} ·
                    da fatura de {monthLabel(firstPreview, "MMM/yy")} até {monthLabel(format(addMonths(parseISO(firstPreview), totalInstallments - 1), "yyyy-MM-dd"), "MMM/yy")}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ce-monthly">Valor por mês</Label>
                  <Input id="ce-monthly" inputMode="decimal" placeholder="0,00" value={entryForm.amount} onChange={(e) => setEntry("amount", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ce-start">Começa na fatura de</Label>
                    <Input id="ce-start" type="month" value={monthInput(entryForm.invoice)} onChange={(e) => setEntry("invoice", fromMonthInput(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ce-end">Termina em (opcional)</Label>
                    <Input id="ce-end" type="month" value={entryForm.endInvoice ? monthInput(entryForm.endInvoice) : ""} onChange={(e) => setEntry("endInvoice", fromMonthInput(e.target.value))} />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ce-cat">Categoria (opcional)</Label>
              <Input id="ce-cat" placeholder="Ex.: Casa, Assinaturas" value={entryForm.category} onChange={(e) => setEntry("category", e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {entryDialog.entry ? (
              <div className="flex flex-wrap gap-1">
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={deleteEntry}>
                  <Trash2 className="size-4" /> {confirmEntryDelete ? "Confirmar exclusão" : "Excluir"}
                </Button>
                {entryDialog.entry.kind === "RECURRING" ? (
                  <Button type="button" variant="ghost" onClick={endRecurrenceHere}>
                    Encerrar nesta fatura
                  </Button>
                ) : null}
              </div>
            ) : <span />}
            <Button type="button" onClick={saveEntry} disabled={entryMutations.create.isPending || entryMutations.update.isPending}>
              {entryDialog.entry ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
