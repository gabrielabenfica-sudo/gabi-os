import { useMemo, useState } from "react";
import { addMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, CalendarClock, ChevronDown, ChevronUp, HandCoins, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency, todayISO } from "@/lib/format";
import { useLoans } from "@/lib/queries";
import { useLoanMutations } from "@/lib/mutations";
import { centsToInput, loanDueInMonth, loanStatus, parseMoney } from "@/lib/credit";
import { StatCard } from "@/components/common/page-parts";
import type { Account, Loan } from "@/lib/types";

const NO_ACCOUNT = "none";
const dateLabel = (iso: string, pattern = "dd/MM/yyyy") => format(parseISO(iso), pattern, { locale: ptBR });

type LoanForm = {
  description: string;
  lender: string;
  account_id: string;
  installment: string;
  total: string;
  paidCount: string;
  nextDue: string;
  principal: string;
  interest: string;
  notes: string;
};

export function LoansSection({
  scope,
  month,
  accounts,
  onAddAccount,
}: {
  scope: string;
  month: Date;
  /** Bank accounts of the current scope. */
  accounts: Account[];
  onAddAccount: () => void;
}) {
  const { data: allLoans = [] } = useLoans();
  const mutations = useLoanMutations();
  const loans = allLoans.filter((loan) => loan.scope === scope);
  const monthKey = format(month, "yyyy-MM");

  const [dialog, setDialog] = useState<{ open: boolean; loan: Loan | null }>({ open: false, loan: null });
  const [form, setForm] = useState<LoanForm>({
    description: "", lender: "", account_id: NO_ACCOUNT, installment: "", total: "", paidCount: "0",
    nextDue: todayISO(), principal: "", interest: "", notes: "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);

  const accountName = (id: string | null) => accounts.find((account) => account.id === id)?.name ?? "Sem conta definida";

  const summary = useMemo(() => {
    let remaining = 0;
    let monthTotal = 0;
    let monthPaid = 0;
    let active = 0;
    let lastEnd: string | null = null;
    for (const loan of loans) {
      const status = loanStatus(loan);
      remaining += status.remainingCents;
      if (status.remainingCount > 0) {
        active += 1;
        if (!lastEnd || status.endDate > lastEnd) lastEnd = status.endDate;
      }
      const due = loanDueInMonth(loan, monthKey);
      if (due) {
        monthTotal += loan.installment_cents;
        if (due.paid) monthPaid += loan.installment_cents;
      }
    }
    return { remaining, monthTotal, monthPaid, active, lastEnd };
  }, [loans, monthKey]);

  // Group by bank account, keeping accounts with loans first.
  const groups = useMemo(() => {
    const visible = loans.filter((loan) => showFinished || loanStatus(loan).remainingCount > 0);
    const map = new Map<string, Loan[]>();
    for (const loan of visible) {
      const key = loan.account_id && accounts.some((a) => a.id === loan.account_id) ? loan.account_id : NO_ACCOUNT;
      map.set(key, [...(map.get(key) ?? []), loan]);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        name: key === NO_ACCOUNT ? "Sem conta definida" : accountName(key),
        institution: accounts.find((a) => a.id === key)?.institution ?? null,
        items: items.sort((a, b) => loanStatus(b).remainingCents - loanStatus(a).remainingCents),
        remaining: items.reduce((sum, loan) => sum + loanStatus(loan).remainingCents, 0),
        monthly: items
          .filter((loan) => loanStatus(loan).remainingCount > 0)
          .reduce((sum, loan) => sum + loan.installment_cents, 0),
      }))
      .sort((a, b) => (a.key === NO_ACCOUNT ? 1 : b.key === NO_ACCOUNT ? -1 : b.remaining - a.remaining));
  }, [loans, accounts, showFinished]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishedCount = loans.filter((loan) => loanStatus(loan).remainingCount === 0).length;

  /* ----- dialog ----- */
  const openDialog = (loan: Loan | null) => {
    if (loan) {
      const status = loanStatus(loan);
      setForm({
        description: loan.description,
        lender: loan.lender ?? "",
        account_id: loan.account_id ?? NO_ACCOUNT,
        installment: centsToInput(loan.installment_cents),
        total: String(loan.installments_total),
        paidCount: String(status.paidCount),
        nextDue: status.nextDue ?? status.endDate,
        principal: centsToInput(loan.principal_cents),
        interest: loan.interest_rate ?? "",
        notes: loan.notes ?? "",
      });
    } else {
      setForm({
        description: "", lender: "", account_id: accounts[0]?.id ?? NO_ACCOUNT, installment: "", total: "",
        paidCount: "0", nextDue: todayISO(), principal: "", interest: "", notes: "",
      });
    }
    setConfirmDelete(false);
    setDialog({ open: true, loan });
  };

  const set = <K extends keyof LoanForm>(key: K, value: LoanForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const totalN = Math.max(0, Math.round(Number(form.total) || 0));
  const paidN = Math.max(0, Math.round(Number(form.paidCount) || 0));
  const installmentCents = parseMoney(form.installment);
  const previewRemaining = installmentCents && totalN ? Math.max(0, totalN - paidN) * installmentCents : null;

  const save = () => {
    if (!form.description.trim()) {
      toast.error("Dê um nome ao empréstimo.");
      return;
    }
    if (!installmentCents || installmentCents <= 0 || totalN < 1) {
      toast.error("Informe o valor da parcela e o total de parcelas.");
      return;
    }
    if (paidN > totalN) {
      toast.error("Parcelas pagas não pode ser maior que o total.");
      return;
    }
    if (!form.nextDue) {
      toast.error("Informe a data da próxima parcela.");
      return;
    }
    // The next unpaid installment is number paidN + 1 and falls on nextDue.
    const firstDue = format(addMonths(parseISO(form.nextDue), -paidN), "yyyy-MM-dd");
    const existing = dialog.loan;
    const previousPaid = existing ? loanStatus(existing).paidCount : -1;
    const paid =
      existing && previousPaid === paidN && existing.installments_total === totalN
        ? existing.paid
        : Array.from({ length: paidN }, (_, i) => i + 1);

    const values = {
      description: form.description.trim(),
      lender: form.lender.trim() || null,
      account_id: form.account_id === NO_ACCOUNT ? null : form.account_id,
      installment_cents: installmentCents,
      installments_total: totalN,
      first_due_date: firstDue,
      principal_cents: parseMoney(form.principal),
      interest_rate: form.interest.trim() || null,
      notes: form.notes.trim() || null,
      paid,
    };
    const done = {
      onSuccess: () => {
        toast.success(existing ? "Empréstimo atualizado." : "Empréstimo adicionado.");
        setDialog({ open: false, loan: null });
      },
      onError: (error: unknown) => toast.error(`Não foi possível salvar. ${error instanceof Error ? error.message : ""}`),
    };
    if (existing) mutations.update.mutate({ id: existing.id, values }, done);
    else mutations.create.mutate({ ...values, scope }, done);
  };

  const remove = () => {
    if (!dialog.loan) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    mutations.remove.mutate(dialog.loan.id, {
      onSuccess: () => {
        toast.success("Empréstimo excluído.");
        setDialog({ open: false, loan: null });
      },
      onError: () => toast.error("Não foi possível excluir."),
    });
  };

  const togglePaid = (loan: Loan, number: number) => {
    const current = loan.paid ?? [];
    const paid = current.includes(number) ? current.filter((n) => n !== number) : [...current, number].sort((a, b) => a - b);
    mutations.update.mutate({ id: loan.id, values: { paid } });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Falta pagar"
          value={formatCurrency(summary.remaining)}
          hint={`somando ${summary.active} ${summary.active === 1 ? "empréstimo ativo" : "empréstimos ativos"}`}
          icon={<HandCoins className="size-4" />}
          accent
        />
        <StatCard
          label={`Parcelas de ${format(month, "MMMM", { locale: ptBR })}`}
          value={formatCurrency(summary.monthTotal)}
          hint={`${formatCurrency(summary.monthPaid)} já pago`}
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Contas bancárias"
          value={String(groups.filter((g) => g.key !== NO_ACCOUNT).length)}
          hint="com empréstimo ativo"
          icon={<Landmark className="size-4" />}
        />
        <StatCard
          label="Livre de empréstimos em"
          value={summary.lastEnd ? dateLabel(summary.lastEnd, "MMM/yyyy") : "—"}
          hint="última parcela de todos"
          icon={<CalendarClock className="size-4" />}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onAddAccount}>
          <Building2 className="size-4" /> Conta bancária
        </Button>
        <Button onClick={() => openDialog(null)}>
          <Plus className="size-4" /> Novo empréstimo
        </Button>
      </div>

      {loans.length === 0 ? (
        <Card className="border-dashed border-border/70">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum empréstimo cadastrado aqui. Adicione as contas bancárias e depois os empréstimos de cada uma.
          </CardContent>
        </Card>
      ) : null}

      {groups.map((group) => (
        <div key={group.key} className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Landmark className="size-4 text-primary" />
              <div>
                <p className="font-display text-lg text-foreground">{group.name}</p>
                {group.institution ? <p className="text-[11px] text-muted-foreground">{group.institution}</p> : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              falta <span className="font-medium tabular-nums text-foreground">{formatCurrency(group.remaining)}</span>
              {group.monthly ? <> · {formatCurrency(group.monthly)}/mês</> : null}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {group.items.map((loan) => {
              const status = loanStatus(loan);
              const due = loanDueInMonth(loan, monthKey);
              const pct = Math.round((status.paidCount / status.total) * 100);
              const isOpen = expanded === loan.id;
              return (
                <Card key={loan.id} className={cn("border-border/70 shadow-card", status.remainingCount === 0 && "opacity-70")}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate font-display text-base">{loan.description}</CardTitle>
                      <p className="text-[11px] text-muted-foreground">
                        {[loan.lender, `${formatCurrency(loan.installment_cents)}/mês`, loan.interest_rate ? `juros ${loan.interest_rate}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Editar empréstimo" onClick={() => openDialog(loan)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Falta pagar</p>
                        <p className="font-display text-2xl text-foreground">{formatCurrency(status.remainingCents)}</p>
                      </div>
                      <p className="text-right text-[11px] text-muted-foreground">
                        {status.paidCount} de {status.total} pagas
                        <br />
                        {status.remainingCount} {status.remainingCount === 1 ? "restante" : "restantes"}
                      </p>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {status.nextDue
                          ? `próxima: ${status.next}ª em ${dateLabel(status.nextDue)}`
                          : "quitado"}
                      </span>
                      <span>termina {dateLabel(status.endDate, "MMM/yyyy")}</span>
                    </div>

                    {due ? (
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm">
                        <Checkbox checked={due.paid} onCheckedChange={() => togglePaid(loan, due.number)} />
                        <span className={cn("flex-1", due.paid && "text-muted-foreground line-through")}>
                          Parcela {due.number} de {format(month, "MMMM", { locale: ptBR })} · vence {dateLabel(due.date, "dd/MM")}
                        </span>
                        <span className="tabular-nums">{formatCurrency(loan.installment_cents)}</span>
                      </label>
                    ) : null}

                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] text-primary"
                      onClick={() => setExpanded(isOpen ? null : loan.id)}
                    >
                      {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      Ver todas as parcelas
                    </button>
                    {isOpen ? (
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: status.total }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            title={`Parcela ${n} · ${dateLabel(format(addMonths(parseISO(loan.first_due_date), n - 1), "yyyy-MM-dd"))}`}
                            onClick={() => togglePaid(loan, n)}
                            className={cn(
                              "h-7 min-w-7 rounded-md border px-1 text-[10px] tabular-nums transition",
                              status.paid.has(n)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:bg-secondary",
                            )}
                          >
                            {n}
                          </button>
                        ))}
                        <p className="w-full pt-1 text-[10px] text-muted-foreground">Toque numa parcela para marcar ou desmarcar como paga.</p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {finishedCount > 0 ? (
        <Button size="sm" variant="ghost" onClick={() => setShowFinished((v) => !v)}>
          {showFinished ? "Esconder" : "Mostrar"} empréstimos quitados ({finishedCount})
        </Button>
      ) : null}

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, loan: null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog.loan ? "Editar empréstimo" : "Novo empréstimo"}</DialogTitle>
            <DialogDescription>
              Para um empréstimo que você já está pagando, diga quantas parcelas já pagou e quando vence a próxima.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ln-desc">Nome</Label>
              <Input id="ln-desc" placeholder="Ex.: Consignado, Capital de giro" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Conta bancária</Label>
                <Select value={form.account_id} onValueChange={(value) => set("account_id", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                    ))}
                    <SelectItem value={NO_ACCOUNT}>Sem conta definida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ln-lender">Credor (opcional)</Label>
                <Input id="ln-lender" placeholder="Ex.: Banco, pessoa" value={form.lender} onChange={(e) => set("lender", e.target.value)} />
              </div>
            </div>
            {accounts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhuma conta bancária cadastrada ainda. Use “Conta bancária” para criar e separar os empréstimos por banco.
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ln-inst">Parcela</Label>
                <Input id="ln-inst" inputMode="decimal" placeholder="0,00" value={form.installment} onChange={(e) => set("installment", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ln-total">Nº parcelas</Label>
                <Input id="ln-total" inputMode="numeric" placeholder="48" value={form.total} onChange={(e) => set("total", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ln-paid">Já paguei</Label>
                <Input id="ln-paid" inputMode="numeric" value={form.paidCount} onChange={(e) => set("paidCount", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ln-next">{paidN === 0 ? "1ª parcela vence em" : `Próxima parcela (${paidN + 1}ª) vence em`}</Label>
              <Input id="ln-next" type="date" value={form.nextDue} onChange={(e) => set("nextDue", e.target.value)} />
            </div>
            {previewRemaining !== null ? (
              <p className="rounded-lg bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
                Falta pagar {formatCurrency(previewRemaining)} em {Math.max(0, totalN - paidN)} parcelas
                {form.nextDue && totalN > paidN
                  ? ` · última em ${dateLabel(format(addMonths(parseISO(form.nextDue), totalN - paidN - 1), "yyyy-MM-dd"), "MMM/yyyy")}`
                  : ""}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ln-principal">Valor contratado (opcional)</Label>
                <Input id="ln-principal" inputMode="decimal" placeholder="0,00" value={form.principal} onChange={(e) => set("principal", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ln-interest">Juros (opcional)</Label>
                <Input id="ln-interest" placeholder="Ex.: 1,9% a.m." value={form.interest} onChange={(e) => set("interest", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ln-notes">Observações (opcional)</Label>
              <Textarea id="ln-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {dialog.loan ? (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
                <Trash2 className="size-4" /> {confirmDelete ? "Confirmar exclusão" : "Excluir"}
              </Button>
            ) : <span />}
            <Button type="button" onClick={save} disabled={mutations.create.isPending || mutations.update.isPending}>
              {dialog.loan ? "Salvar" : "Adicionar empréstimo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
