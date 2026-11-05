import { useMemo, useState } from "react";
import { addMonths, differenceInCalendarMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, CalendarClock, Check, HandCoins, Pencil, Plus, Trash2, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useReceivablePayments, useReceivables } from "@/lib/queries";
import { useMarkReceived, useReceivableMutations, useUnmarkReceived } from "@/lib/mutations";
import { centsToInput, monthStart, parseMoney } from "@/lib/credit";
import { StatCard } from "@/components/common/page-parts";
import type { Account, Receivable, ReceivablePayment } from "@/lib/types";

const NO_ACCOUNT = "none";
const monthInput = (iso: string) => iso.slice(0, 7);
const fromMonthInput = (value: string) => (value ? `${value}-01` : "");
const monthLabel = (iso: string, pattern = "MMM/yy") => format(parseISO(iso), pattern, { locale: ptBR });

/** Is this receivable owed in `month` (yyyy-MM-01)? */
function owedIn(rec: Receivable, month: string) {
  if (month < rec.start_month) return false;
  if (rec.end_month && month > rec.end_month) return false;
  return true;
}

function dueDateOf(rec: Receivable, month: string) {
  const base = parseISO(month);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(1, rec.due_day ?? lastDay), lastDay);
  return format(new Date(base.getFullYear(), base.getMonth(), day), "yyyy-MM-dd");
}

type RecForm = {
  person: string;
  description: string;
  amount: string;
  due_day: string;
  start: string;
  endMode: "NEVER" | "MONTH";
  end: string;
  account_id: string;
  active: boolean;
  notes: string;
};

type ReceiveTarget = { rec: Receivable; month: string } | null;

export function ReceivablesSection({
  scope,
  month,
  accounts,
}: {
  scope: string;
  month: Date;
  accounts: Account[];
}) {
  const { data: allReceivables = [] } = useReceivables();
  const { data: payments = [] } = useReceivablePayments();
  const mutations = useReceivableMutations();
  const markReceived = useMarkReceived();
  const unmarkReceived = useUnmarkReceived();

  const receivables = allReceivables.filter((rec) => rec.scope === scope);
  const current = monthStart(month);
  const today = todayISO();
  const thisMonth = monthStart(new Date());

  const paymentFor = (recId: string, m: string): ReceivablePayment | undefined =>
    payments.find((p) => p.receivable_id === recId && p.month === m);

  const [dialog, setDialog] = useState<{ open: boolean; rec: Receivable | null }>({ open: false, rec: null });
  const [form, setForm] = useState<RecForm>({
    person: "", description: "", amount: "", due_day: "", start: current, endMode: "NEVER", end: "",
    account_id: NO_ACCOUNT, active: true, notes: "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [receive, setReceive] = useState<ReceiveTarget>(null);
  const [receiveForm, setReceiveForm] = useState({ amount: "", date: today, addIncome: true, account_id: NO_ACCOUNT });

  /* ----- month view ----- */
  const monthRows = useMemo(
    () =>
      receivables
        .filter((rec) => rec.active && owedIn(rec, current))
        .map((rec) => {
          const payment = paymentFor(rec.id, current);
          const due = dueDateOf(rec, current);
          const status: "RECEIVED" | "LATE" | "OPEN" = payment ? "RECEIVED" : due < today ? "LATE" : "OPEN";
          return { rec, payment, due, status };
        })
        .sort((a, b) => a.due.localeCompare(b.due) || a.rec.person.localeCompare(b.rec.person, "pt-BR")),
    [receivables, payments, current, today], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const expected = monthRows.reduce((sum, row) => sum + row.rec.amount_cents, 0);
  const received = monthRows.reduce((sum, row) => sum + (row.payment?.amount_cents ?? 0), 0);
  const pending = monthRows.filter((row) => !row.payment).reduce((sum, row) => sum + row.rec.amount_cents, 0);

  /* ----- overdue up to today, any month ----- */
  const overdue = useMemo(() => {
    const items: Array<{ rec: Receivable; month: string; due: string }> = [];
    for (const rec of receivables.filter((r) => r.active)) {
      const last = rec.end_month && rec.end_month < thisMonth ? rec.end_month : thisMonth;
      const span = differenceInCalendarMonths(parseISO(last), parseISO(rec.start_month));
      for (let i = 0; i <= span; i += 1) {
        const m = format(addMonths(parseISO(rec.start_month), i), "yyyy-MM-dd");
        const due = dueDateOf(rec, m);
        if (due < today && !paymentFor(rec.id, m)) items.push({ rec, month: m, due });
      }
    }
    return items.sort((a, b) => a.due.localeCompare(b.due));
  }, [receivables, payments, thisMonth, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const overdueTotal = overdue.reduce((sum, item) => sum + item.rec.amount_cents, 0);
  const overdueOtherMonths = overdue.filter((item) => item.month !== current);

  /* ----- per person summary ----- */
  const people = useMemo(
    () =>
      receivables
        .slice()
        .sort((a, b) => Number(b.active) - Number(a.active) || a.person.localeCompare(b.person, "pt-BR"))
        .map((rec) => {
          const recPayments = payments.filter((p) => p.receivable_id === rec.id);
          const totalReceived = recPayments.reduce((sum, p) => sum + p.amount_cents, 0);
          const late = overdue.filter((item) => item.rec.id === rec.id);
          return { rec, count: recPayments.length, totalReceived, late };
        }),
    [receivables, payments, overdue],
  );

  /* ----- dialogs ----- */
  const openDialog = (rec: Receivable | null) => {
    setForm(
      rec
        ? {
            person: rec.person,
            description: rec.description ?? "",
            amount: centsToInput(rec.amount_cents),
            due_day: rec.due_day ? String(rec.due_day) : "",
            start: rec.start_month,
            endMode: rec.end_month ? "MONTH" : "NEVER",
            end: rec.end_month ?? "",
            account_id: rec.account_id ?? NO_ACCOUNT,
            active: rec.active,
            notes: rec.notes ?? "",
          }
        : {
            person: "", description: "", amount: "", due_day: "", start: current, endMode: "NEVER", end: "",
            account_id: accounts[0]?.id ?? NO_ACCOUNT, active: true, notes: "",
          },
    );
    setConfirmDelete(false);
    setDialog({ open: true, rec });
  };

  const set = <K extends keyof RecForm>(key: K, value: RecForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    const amount = parseMoney(form.amount);
    if (!form.person.trim()) {
      toast.error("Quem vai te pagar?");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Informe o valor por mês.");
      return;
    }
    if (form.endMode === "MONTH" && (!form.end || form.end < form.start)) {
      toast.error("O último mês precisa ser depois do primeiro.");
      return;
    }
    const day = Number(form.due_day);
    const values = {
      person: form.person.trim(),
      description: form.description.trim() || null,
      amount_cents: amount,
      due_day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
      start_month: form.start,
      end_month: form.endMode === "MONTH" ? form.end : null,
      account_id: form.account_id === NO_ACCOUNT ? null : form.account_id,
      active: form.active,
      notes: form.notes.trim() || null,
    };
    const done = {
      onSuccess: () => {
        toast.success(dialog.rec ? "Atualizado." : "Cobrança adicionada.");
        setDialog({ open: false, rec: null });
      },
      onError: (error: unknown) => toast.error(`Não foi possível salvar. ${error instanceof Error ? error.message : ""}`),
    };
    if (dialog.rec) mutations.update.mutate({ id: dialog.rec.id, values }, done);
    else mutations.create.mutate({ ...values, scope }, done);
  };

  const remove = () => {
    if (!dialog.rec) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    mutations.remove.mutate(dialog.rec.id, {
      onSuccess: () => {
        toast.success("Cobrança excluída.");
        setDialog({ open: false, rec: null });
      },
      onError: () => toast.error("Não foi possível excluir."),
    });
  };

  const openReceive = (rec: Receivable, m: string) => {
    setReceive({ rec, month: m });
    setReceiveForm({
      amount: centsToInput(rec.amount_cents),
      date: today,
      addIncome: true,
      account_id: rec.account_id ?? accounts[0]?.id ?? NO_ACCOUNT,
    });
  };

  const confirmReceive = () => {
    if (!receive) return;
    const amount = parseMoney(receiveForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Informe quanto recebeu.");
      return;
    }
    const { rec, month: m } = receive;
    markReceived.mutate(
      {
        receivableId: rec.id,
        month: m,
        amountCents: amount,
        receivedOn: receiveForm.date || today,
        income: receiveForm.addIncome
          ? {
              scope,
              description: `${rec.person}${rec.description ? ` · ${rec.description}` : ""} (${monthLabel(m, "MMM/yy")})`,
              account_id: receiveForm.account_id === NO_ACCOUNT ? null : receiveForm.account_id,
            }
          : null,
      },
      {
        onSuccess: () => {
          toast.success(`Recebido de ${rec.person}.`);
          setReceive(null);
        },
        onError: (error) => toast.error(`Não foi possível marcar. ${error instanceof Error ? error.message : ""}`),
      },
    );
  };

  const undo = (payment: ReceivablePayment, person: string) => {
    unmarkReceived.mutate(
      { paymentId: payment.id, transactionId: payment.transaction_id },
      {
        onSuccess: () =>
          toast.success(
            payment.transaction_id
              ? `Desfeito. A entrada de ${person} também saiu dos lançamentos.`
              : "Desfeito.",
          ),
        onError: () => toast.error("Não foi possível desfazer."),
      },
    );
  };

  const statusBadge = (status: "RECEIVED" | "LATE" | "OPEN", due: string, payment?: ReceivablePayment) => {
    if (status === "RECEIVED" && payment)
      return (
        <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] text-primary">
          <Check className="size-3" /> recebido {format(parseISO(payment.received_on), "dd/MM")}
        </Badge>
      );
    if (status === "LATE")
      return (
        <Badge variant="outline" className="gap-1 border-destructive/40 px-1.5 py-0 text-[10px] text-destructive">
          <AlertCircle className="size-3" /> atrasado
        </Badge>
      );
    return (
      <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
        vence {format(parseISO(due), "dd/MM")}
      </Badge>
    );
  };

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`A receber em ${format(month, "MMMM", { locale: ptBR })}`}
          value={formatCurrency(expected)}
          hint={`${monthRows.length} ${monthRows.length === 1 ? "pessoa" : "cobranças"}`}
          icon={<HandCoins className="size-4" />}
          accent
        />
        <StatCard
          label="Já recebido"
          value={formatCurrency(received)}
          hint={expected ? `${Math.round((received / expected) * 100)}% do mês` : "—"}
          icon={<Check className="size-4" />}
        />
        <StatCard
          label="Falta receber no mês"
          value={formatCurrency(pending)}
          hint={`${monthRows.filter((row) => !row.payment).length} em aberto`}
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Em atraso até hoje"
          value={formatCurrency(overdueTotal)}
          hint={overdue.length ? `${overdue.length} ${overdue.length === 1 ? "parcela" : "parcelas"} vencidas` : "ninguém atrasado"}
          icon={<AlertCircle className="size-4" />}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => openDialog(null)}>
          <Plus className="size-4" /> Nova cobrança
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card className="border-border/70 shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg capitalize">
                {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monthRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {receivables.length
                    ? "Ninguém te deve neste mês."
                    : "Cadastre quem te paga todo mês em “Nova cobrança”."}
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {monthRows.map(({ rec, payment, due, status }) => (
                    <li key={rec.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm", payment ? "text-muted-foreground" : "text-foreground")}>
                          {rec.person}
                          {rec.description ? <span className="text-muted-foreground"> · {rec.description}</span> : null}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          {statusBadge(status, due, payment)}
                          {accountName(rec.account_id) ? <span>cai em {accountName(rec.account_id)}</span> : null}
                        </div>
                      </div>
                      <span className="text-sm tabular-nums text-foreground">
                        {formatCurrency(payment?.amount_cents ?? rec.amount_cents)}
                      </span>
                      {payment ? (
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => undo(payment, rec.person)}>
                          <Undo2 className="size-3.5" /> desfazer
                        </Button>
                      ) : (
                        <Button size="sm" variant={status === "LATE" ? "default" : "outline"} className="h-8 px-3 text-xs" onClick={() => openReceive(rec, current)}>
                          <Check className="size-3.5" /> Recebi
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {overdueOtherMonths.length ? (
            <Card className="border-destructive/30 shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <AlertCircle className="size-4 text-destructive" /> Atrasados de outros meses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border/60">
                  {overdueOtherMonths.map((item) => (
                    <li key={`${item.rec.id}-${item.month}`} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{item.rec.person}</p>
                        <p className="text-[11px] capitalize text-muted-foreground">
                          {monthLabel(item.month, "MMMM 'de' yyyy")} · venceu {format(parseISO(item.due), "dd/MM")}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums">{formatCurrency(item.rec.amount_cents)}</span>
                      <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => openReceive(item.rec, item.month)}>
                        <Check className="size-3.5" /> Recebi
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <Users className="size-4 text-primary" /> Quem te paga
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {people.length === 0 ? <p className="text-sm text-muted-foreground">Ninguém cadastrado.</p> : null}
            {people.map(({ rec, count, totalReceived, late }) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => openDialog(rec)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-xl border border-border/60 px-3 py-2 text-left transition hover:bg-secondary/40",
                  !rec.active && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {rec.person}
                    {!rec.active ? <span className="text-[11px] text-muted-foreground"> · pausado</span> : null}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCurrency(rec.amount_cents)}/mês
                    {rec.due_day ? ` · dia ${rec.due_day}` : ""} · desde {monthLabel(rec.start_month)}
                    {rec.end_month ? ` até ${monthLabel(rec.end_month)}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {count} {count === 1 ? "mês recebido" : "meses recebidos"} · {formatCurrency(totalReceived)}
                    {late.length ? (
                      <span className="text-destructive"> · {late.length} em atraso</span>
                    ) : null}
                  </p>
                </div>
                <Pencil className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Create / edit */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, rec: null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog.rec ? "Editar cobrança" : "Nova cobrança mensal"}</DialogTitle>
            <DialogDescription>Quem te paga, quanto, em que dia e até quando.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rc-person">Quem paga</Label>
                <Input id="rc-person" placeholder="Ex.: Maria" value={form.person} onChange={(e) => set("person", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-desc">Referente a</Label>
                <Input id="rc-desc" placeholder="Ex.: Mentoria, aluguel" value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rc-amount">Valor por mês</Label>
                <Input id="rc-amount" inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-day">Dia do pagamento</Label>
                <Input id="rc-day" inputMode="numeric" placeholder="10" value={form.due_day} onChange={(e) => set("due_day", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rc-start">Primeiro mês</Label>
                <Input id="rc-start" type="month" value={monthInput(form.start)} onChange={(e) => set("start", fromMonthInput(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Até quando</Label>
                <Select value={form.endMode} onValueChange={(value) => set("endMode", value as RecForm["endMode"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEVER">Sem data para acabar</SelectItem>
                    <SelectItem value="MONTH">Até um mês específico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.endMode === "MONTH" ? (
              <div className="space-y-1.5">
                <Label htmlFor="rc-end">Último mês</Label>
                <Input id="rc-end" type="month" value={form.end ? monthInput(form.end) : ""} onChange={(e) => set("end", fromMonthInput(e.target.value))} />
                {form.end && form.start && form.end >= form.start ? (
                  <p className="text-[11px] text-muted-foreground">
                    {differenceInCalendarMonths(parseISO(form.end), parseISO(form.start)) + 1} meses
                    {parseMoney(form.amount)
                      ? ` · ${formatCurrency((differenceInCalendarMonths(parseISO(form.end), parseISO(form.start)) + 1) * (parseMoney(form.amount) ?? 0))} no total`
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Cai em qual conta</Label>
              <Select value={form.account_id} onValueChange={(value) => set("account_id", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                  ))}
                  <SelectItem value={NO_ACCOUNT}>Não definida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-notes">Observações (opcional)</Label>
              <Textarea id="rc-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
            {dialog.rec ? (
              <label className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm">
                <span>
                  Cobrança ativa
                  <span className="block text-[11px] text-muted-foreground">Pausada some do mês e dos atrasos, mas o histórico fica.</span>
                </span>
                <Switch checked={form.active} onCheckedChange={(value) => set("active", value)} />
              </label>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {dialog.rec ? (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
                <Trash2 className="size-4" /> {confirmDelete ? "Confirmar: apaga o histórico" : "Excluir"}
              </Button>
            ) : <span />}
            <Button type="button" onClick={save} disabled={mutations.create.isPending || mutations.update.isPending}>
              {dialog.rec ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as received */}
      <Dialog open={Boolean(receive)} onOpenChange={(open) => !open && setReceive(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recebi de {receive?.rec.person}</DialogTitle>
            <DialogDescription className="capitalize">
              {receive ? monthLabel(receive.month, "MMMM 'de' yyyy") : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rv-amount">Valor recebido</Label>
                <Input id="rv-amount" inputMode="decimal" value={receiveForm.amount} onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rv-date">Data</Label>
                <Input id="rv-date" type="date" value={receiveForm.date} onChange={(e) => setReceiveForm({ ...receiveForm, date: e.target.value })} />
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={receiveForm.addIncome}
                onCheckedChange={(value) => setReceiveForm({ ...receiveForm, addIncome: Boolean(value) })}
              />
              <span>
                Lançar como entrada
                <span className="block text-[11px] text-muted-foreground">Aparece nos lançamentos e no saldo da conta.</span>
              </span>
            </label>
            {receiveForm.addIncome ? (
              <Select value={receiveForm.account_id} onValueChange={(value) => setReceiveForm({ ...receiveForm, account_id: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                  ))}
                  <SelectItem value={NO_ACCOUNT}>Sem conta</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" onClick={confirmReceive} disabled={markReceived.isPending}>
              <Check className="size-4" /> Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
