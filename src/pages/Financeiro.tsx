import { useMemo, useRef, useState } from "react";
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileUp,
  Landmark,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAccounts,
  useCategories,
  useCompensation,
  useFinanceInstallments,
  useFinanceTransactions,
  useWorkspaces,
} from "@/lib/queries";
import {
  useDeleteAccount,
  useDeleteFinanceTransaction,
  useDeleteInstallment,
  useImportFinanceTransactions,
  useSaveAccount,
  useSaveFinanceTransaction,
  useSaveInstallment,
  useUpdateInstallmentPaid,
} from "@/lib/mutations";
import { formatCurrency, todayISO } from "@/lib/format";
import { parseStatement, type ParsedEntry } from "@/lib/statement";
import { duesForMonth, INSTALLMENT_KINDS, KIND_LABEL, planProgress } from "@/lib/installments";
import { PageHeader, StatCard } from "@/components/common/page-parts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCardsSection } from "@/components/finance/credit-cards";
import { LoansSection } from "@/components/finance/loans";
import { useCardEntries, useCreditCards, useLoans } from "@/lib/queries";
import { invoiceLines, loanDueInMonth, monthStart as invoiceMonthStart, sumLines } from "@/lib/credit";

type Scope = "EMPRESA" | "PESSOAL";

const SCOPE_LABEL: Record<Scope, string> = { EMPRESA: "Empresa", PESSOAL: "Pessoal" };

export default function Financeiro() {
  const { data: transactions = [] } = useFinanceTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: installments = [] } = useFinanceInstallments();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: categories = [] } = useCategories();
  const { data: compensation = [] } = useCompensation();

  const saveTransaction = useSaveFinanceTransaction();
  const deleteTransaction = useDeleteFinanceTransaction();
  const importTransactions = useImportFinanceTransactions();
  const saveAccount = useSaveAccount();
  const deleteAccount = useDeleteAccount();
  const saveInstallment = useSaveInstallment();
  const deleteInstallment = useDeleteInstallment();
  const updatePaid = useUpdateInstallmentPaid();

  const [scope, setScope] = useState<Scope>("PESSOAL");
  const [tab, setTab] = useState("geral");
  const { data: creditCards = [] } = useCreditCards();
  const { data: cardEntries = [] } = useCardEntries();
  const { data: loans = [] } = useLoans();
  const [month, setMonth] = useState(new Date());
  const [accountFilter, setAccountFilter] = useState("all");

  const [entryOpen, setEntryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const [form, setForm] = useState({
    kind: "EXPENSE",
    description: "",
    amount: "",
    date: todayISO(),
    category: "",
    account_id: "",
  });
  const [accountForm, setAccountForm] = useState({
    name: "",
    institution: "",
    initial: "",
    type: "CHECKING",
  });
  const [planForm, setPlanForm] = useState({
    kind: "CHECK",
    description: "",
    total: "",
    installments: "1",
    firstDue: todayISO(),
    account_id: "",
    category: "",
  });
  const [importScope, setImportScope] = useState<Scope>("EMPRESA");
  const [importCategory, setImportCategory] = useState("");
  const [importAccount, setImportAccount] = useState("");
  const [parsed, setParsed] = useState<ParsedEntry[]>([]);
  const [fileName, setFileName] = useState("");
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const workspaceKind = (workspaceId?: string | null) =>
    workspaces.find((item) => item.id === workspaceId)?.kind ?? null;

  const accountScope = (account: { scope?: string | null; workspace_id?: string | null }): Scope => {
    if (account.scope === "EMPRESA" || account.scope === "PESSOAL") return account.scope;
    return workspaceKind(account.workspace_id) === "PESSOAL" ? "PESSOAL" : "EMPRESA";
  };

  const scopeAccounts = accounts.filter((account) => accountScope(account) === scope);
  const accountName = (id?: string | null) =>
    accounts.find((account) => account.id === id)?.name ?? "Sem conta";

  const scopeTransactions = transactions.filter((item) => item.scope === scope);
  const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");

  const filteredTransactions = useMemo(
    () =>
      scopeTransactions
        .filter((item) => item.occurred_on >= monthStart && item.occurred_on <= monthEnd)
        .filter((item) =>
          accountFilter === "all" ? true : accountFilter === "none" ? !item.account_id : item.account_id === accountFilter,
        )
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)),
    [scopeTransactions, monthStart, monthEnd, accountFilter],
  );

  const income = filteredTransactions
    .filter((item) => item.kind === "INCOME")
    .reduce((sum, item) => sum + item.amount_cents, 0);
  const expense = filteredTransactions
    .filter((item) => item.kind === "EXPENSE")
    .reduce((sum, item) => sum + item.amount_cents, 0);

  const scopePlans = installments.filter((plan) => {
    if (plan.scope === "EMPRESA" || plan.scope === "PESSOAL") return plan.scope === scope;
    const account = accounts.find((item) => item.id === plan.account_id);
    return account ? accountScope(account) === scope : false;
  });

  const monthKey = format(month, "yyyy-MM");
  const monthDues = duesForMonth(scopePlans, monthKey);
  const scopeCardIds = new Set(creditCards.filter((card) => card.scope === scope && !card.archived).map((card) => card.id));
  const cardInvoiceTotal = sumLines(
    invoiceLines(cardEntries.filter((entry) => scopeCardIds.has(entry.card_id)), invoiceMonthStart(month)),
  );
  const loanMonth = loans
    .filter((loan) => loan.scope === scope)
    .map((loan) => ({ loan, due: loanDueInMonth(loan, monthKey) }))
    .filter((item) => item.due);
  const loanMonthTotal = loanMonth.reduce((sum, item) => sum + item.loan.installment_cents, 0);
  const loanMonthPaid = loanMonth.filter((item) => item.due?.paid).reduce((sum, item) => sum + item.loan.installment_cents, 0);
  const dueTotal = monthDues.reduce((sum, due) => sum + due.amountCents, 0) + cardInvoiceTotal + loanMonthTotal;
  const duePaid =
    monthDues.filter((due) => due.paid).reduce((sum, due) => sum + due.amountCents, 0) + loanMonthPaid;

  const balanceFor = (accountId: string, initial: number) =>
    initial +
    transactions
      .filter((item) => item.account_id === accountId)
      .reduce((sum, item) => sum + (item.kind === "INCOME" ? item.amount_cents : -item.amount_cents), 0);

  const initialBalance = scopeAccounts.reduce((sum, account) => sum + account.initial_balance_cents, 0);
  const allTimeBalance =
    initialBalance +
    scopeTransactions.reduce(
      (sum, item) => sum + (item.kind === "INCOME" ? item.amount_cents : -item.amount_cents),
      0,
    );

  const scopeCategories = Array.from(
    new Set(
      categories
        .filter((category) => {
          const kind = workspaceKind(category.workspace_id);
          return scope === "PESSOAL" ? kind === "PESSOAL" : kind !== null && kind !== "PESSOAL";
        })
        .map((category) => category.name)
        .concat(scopeTransactions.map((item) => item.category ?? "").filter(Boolean)),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const byCategory = filteredTransactions.reduce<Record<string, number>>((accumulator, item) => {
    const key = item.category || "Sem categoria";
    const signed = item.kind === "INCOME" ? item.amount_cents : -item.amount_cents;
    accumulator[key] = (accumulator[key] ?? 0) + signed;
    return accumulator;
  }, {});

  const nextPayments = compensation
    .slice()
    .sort((a, b) => (a.expected_date ?? "").localeCompare(b.expected_date ?? ""))
    .slice(0, 3);

  const openEntry = () => {
    setForm({
      kind: "EXPENSE",
      description: "",
      amount: "",
      date: todayISO(),
      category: "",
      account_id: scopeAccounts[0]?.id ?? "",
    });
    setEntryOpen(true);
  };

  const submitEntry = () => {
    const amount = Number(form.amount.replace(/\./g, "").replace(",", "."));
    if (!form.description.trim() || !Number.isFinite(amount) || amount <= 0) return;

    saveTransaction.mutate(
      {
        scope,
        kind: form.kind,
        description: form.description.trim(),
        amount_cents: Math.round(amount * 100),
        occurred_on: form.date,
        category: form.category.trim() || null,
        account_id: form.account_id || null,
        source: "MANUAL",
      },
      {
        onSuccess: () => {
          toast.success("Lançamento salvo.");
          setEntryOpen(false);
        },
        onError: () => toast.error("Não foi possível salvar o lançamento."),
      },
    );
  };

  const submitAccount = () => {
    if (!accountForm.name.trim()) return;
    const initial = Number(accountForm.initial.replace(/\./g, "").replace(",", "."));
    saveAccount.mutate(
      {
        id: crypto.randomUUID(),
        name: accountForm.name.trim(),
        institution: accountForm.institution.trim() || null,
        type: accountForm.type,
        scope,
        initial_balance_cents: Number.isFinite(initial) ? Math.round(initial * 100) : 0,
        initial_balance_date: todayISO(),
        archived: false,
      },
      {
        onSuccess: () => {
          toast.success("Conta adicionada.");
          setAccountForm({ name: "", institution: "", initial: "", type: "CHECKING" });
          setAccountOpen(false);
        },
        onError: () => toast.error("Não foi possível adicionar a conta."),
      },
    );
  };

  const removeAccount = (id: string, name: string) => {
    if (!window.confirm(`Excluir a conta ${name}? Os lançamentos continuam, mas ficam sem conta.`)) return;
    deleteAccount.mutate(id, {
      onSuccess: () => toast.success("Conta excluída."),
      onError: () => toast.error("Não foi possível excluir a conta."),
    });
  };

  const openPlan = () => {
    setPlanForm({
      kind: "CHECK",
      description: "",
      total: "",
      installments: "1",
      firstDue: todayISO(),
      account_id: scopeAccounts[0]?.id ?? "",
      category: "",
    });
    setPlanOpen(true);
  };

  const submitPlan = () => {
    const total = Number(planForm.total.replace(/\./g, "").replace(",", "."));
    const count = Number(planForm.installments) || 1;
    if (!planForm.description.trim() || !Number.isFinite(total) || total <= 0) return;

    saveInstallment.mutate(
      {
        scope,
        account_id: planForm.account_id || null,
        kind: planForm.kind,
        description: planForm.description.trim(),
        total_cents: Math.round(total * 100),
        installments: Math.max(1, Math.round(count)),
        first_due_date: planForm.firstDue,
        category: planForm.category.trim() || null,
        paid: [],
      },
      {
        onSuccess: () => {
          toast.success("Parcelamento criado.");
          setPlanOpen(false);
        },
        onError: () => toast.error("Não foi possível criar o parcelamento."),
      },
    );
  };

  const togglePaid = (planId: string, number: number, current: number[]) => {
    const plan = installments.find((item) => item.id === planId);
    if (!plan) return;
    const paid = current.includes(number)
      ? current.filter((value) => value !== number)
      : [...current, number];
    updatePaid.mutate({ id: planId, paid });
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    const entries = parseStatement(text, file.name);
    setFileName(file.name);
    setParsed(entries);
    if (!entries.length) toast.error("Não encontrei lançamentos nesse arquivo.");
    else toast.success(`${entries.length} lançamentos encontrados.`);
  };

  const handlePaste = () => {
    if (!pasted.trim()) return;
    const entries = parseStatement(pasted, "colado.csv");
    setFileName("texto colado");
    setParsed(entries);
    if (!entries.length) toast.error("Não encontrei lançamentos nesse texto.");
  };

  const confirmImport = () => {
    if (!parsed.length) return;
    const rows = parsed.map((item) => ({
      scope: importScope,
      kind: item.amountCents >= 0 ? "INCOME" : "EXPENSE",
      description: item.description,
      amount_cents: Math.abs(item.amountCents),
      occurred_on: item.date,
      category: importCategory.trim() || null,
      account_id: importAccount || null,
      source: "IMPORT",
      external_id: item.externalId,
    }));

    importTransactions.mutate(rows, {
      onSuccess: () => {
        toast.success(`${rows.length} lançamentos importados.`);
        setParsed([]);
        setPasted("");
        setFileName("");
        setImportOpen(false);
      },
      onError: () => toast.error("Não foi possível importar o extrato."),
    });
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Financeiro"
        title="Empresa e pessoal, separados"
        description="Contas, entradas, saídas e parcelamentos — cada lado com o seu próprio dinheiro."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp className="size-4" /> Importar extrato
            </Button>
            <Button onClick={openEntry}>
              <Plus className="size-4" /> Novo lançamento
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-border bg-secondary/60 p-0.5 text-sm">
          {(["EMPRESA", "PESSOAL"] as Scope[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setScope(option);
                setAccountFilter("all");
              }}
              className={cn(
                "rounded-full px-4 py-1.5 transition",
                scope === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {SCOPE_LABEL[option]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setMonth(subMonths(month, 1))} aria-label="Mês anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm capitalize text-foreground">
            {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button size="icon" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="cartoes">Cartões de crédito</TabsTrigger>
          <TabsTrigger value="emprestimos">Empréstimos</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-0 space-y-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Entradas do mês"
          value={formatCurrency(income)}
          hint={`${SCOPE_LABEL[scope]} · ${format(month, "MMM yyyy", { locale: ptBR })}`}
          icon={<ArrowDownLeft className="size-4" />}
          accent
        />
        <StatCard
          label="Saídas do mês"
          value={formatCurrency(expense)}
          hint={`${filteredTransactions.filter((item) => item.kind === "EXPENSE").length} lançamentos`}
          icon={<ArrowUpRight className="size-4" />}
        />
        <StatCard
          label="A pagar no mês"
          value={formatCurrency(dueTotal)}
          hint={`faturas ${formatCurrency(cardInvoiceTotal)} · empréstimos ${formatCurrency(loanMonthTotal)}`}
          icon={<CreditCard className="size-4" />}
        />
        <StatCard
          label="Saldo em conta"
          value={formatCurrency(allTimeBalance)}
          hint={`saldo inicial ${formatCurrency(initialBalance)}`}
          icon={<Wallet className="size-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="font-display text-lg">
                Lançamentos de {format(month, "MMMM", { locale: ptBR })}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    <SelectItem value="none">Sem conta</SelectItem>
                    {scopeAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={openEntry}>
                  <Plus className="size-3.5" /> lançar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredTransactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lançamento neste mês para o filtro escolhido.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {filteredTransactions.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          item.kind === "INCOME"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {item.kind === "INCOME" ? (
                          <ArrowDownLeft className="size-4" />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{item.description}</p>
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {format(parseISO(item.occurred_on), "dd/MM", { locale: ptBR })}
                          {item.category ? ` · ${item.category}` : ""}
                          {item.account_id ? ` · ${accountName(item.account_id)}` : ""}
                          {item.source === "IMPORT" ? " · extrato" : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          item.kind === "INCOME" ? "text-primary" : "text-foreground",
                        )}
                      >
                        {item.kind === "INCOME" ? "+" : "−"}
                        {formatCurrency(item.amount_cents)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Excluir lançamento"
                        onClick={() => deleteTransaction.mutate(item.id)}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="font-display text-lg">Parcelamentos</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  cheque · notinhas · outros (cartões e empréstimos têm abas próprias)
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={openPlan}>
                <Plus className="size-3.5" /> Novo
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {monthDues.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Nenhuma parcela vence em {format(month, "MMMM", { locale: ptBR })}.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {monthDues.map((due) => {
                    const plan = due.plan;
                    const progress = planProgress(plan);
                    return (
                      <li key={`${plan.id}-${due.number}`} className="flex items-center gap-3 py-2.5">
                        <Checkbox
                          checked={due.paid}
                          onCheckedChange={() => togglePaid(plan.id, due.number, plan.paid ?? [])}
                          aria-label={`Marcar parcela ${due.number} como paga`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm",
                              due.paid ? "text-muted-foreground line-through" : "text-foreground",
                            )}
                          >
                            {plan.description}
                          </p>
                          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                              {KIND_LABEL[plan.kind] ?? plan.kind}
                            </Badge>
                            parcela {due.number}/{progress.total} ·{" "}
                            {format(parseISO(due.dueDate), "dd/MM")} ·{" "}
                            {plan.account_id ? accountName(plan.account_id) : "sem conta"}
                          </p>
                        </div>
                        <span className="text-sm tabular-nums text-foreground">
                          {formatCurrency(due.amountCents)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir parcelamento"
                          onClick={() => {
                            if (window.confirm(`Excluir o parcelamento "${plan.description}"?`)) {
                              deleteInstallment.mutate(plan.id);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5 text-muted-foreground" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <Landmark className="size-4 text-primary" /> Contas
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setAccountOpen(true)}>
                <Plus className="size-3.5" /> conta
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {scopeAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conta em {SCOPE_LABEL[scope]}.</p>
              ) : (
                scopeAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2"
                  >
                    <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{account.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {account.institution ?? "—"}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums text-foreground">
                      {formatCurrency(balanceFor(account.id, account.initial_balance_cents))}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Excluir conta"
                      onClick={() => removeAccount(account.id, account.name)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">Por categoria</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.keys(byCategory).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem lançamentos no mês.</p>
              ) : (
                Object.entries(byCategory)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .map(([category, value]) => (
                    <div key={category} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{category}</span>
                      <span
                        className={cn(
                          "text-[11px] tabular-nums",
                          value >= 0 ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {value >= 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(value))}
                      </span>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>

          {scope === "EMPRESA" && nextPayments.length ? (
            <Card className="border-border/70 shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <Banknote className="size-4 text-primary" /> Previsão de recebimentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {nextPayments.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="capitalize text-foreground">
                      {item.reference_month
                        ? format(parseISO(item.reference_month), "MMMM 'de' yyyy", { locale: ptBR })
                        : "—"}
                    </span>
                    <span className="text-sm tabular-nums">{formatCurrency(item.expected_cents)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="cartoes" className="mt-0">
          <CreditCardsSection scope={scope} month={month} />
        </TabsContent>

        <TabsContent value="emprestimos" className="mt-0">
          <LoansSection scope={scope} month={month} accounts={scopeAccounts} onAddAccount={() => setAccountOpen(true)} />
        </TabsContent>
      </Tabs>

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo lançamento · {SCOPE_LABEL[scope]}</DialogTitle>
            <DialogDescription>Entradas e saídas manuais, na conta que você escolher.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(["INCOME", "EXPENSE"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setForm({ ...form, kind })}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm transition",
                    form.kind === kind
                      ? "border-primary/40 bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:border-primary/30",
                  )}
                >
                  {kind === "INCOME" ? "Entrada" : "Saída"}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-description">Descrição</Label>
              <Input
                id="entry-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Ex.: salário, aluguel, venda de mentoria"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="entry-amount">Valor (R$)</Label>
                <Input
                  id="entry-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-date">Data</Label>
                <Input
                  id="entry-date"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Conta</Label>
                <Select
                  value={form.account_id || "none"}
                  onValueChange={(value) => setForm({ ...form, account_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem conta</SelectItem>
                    {scopeAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-category">Categoria</Label>
                <Input
                  id="entry-category"
                  list="finance-categories"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="Moradia"
                />
                <datalist id="finance-categories">
                  {scopeCategories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={submitEntry} disabled={saveTransaction.isPending}>
              Salvar lançamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta · {SCOPE_LABEL[scope]}</DialogTitle>
            <DialogDescription>Cada conta tem saldo, lançamentos e parcelamentos próprios.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Nome da conta</Label>
              <Input
                id="account-name"
                value={accountForm.name}
                onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
                placeholder="Ex.: Sicoob, Nubank PJ"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="account-institution">Banco</Label>
                <Input
                  id="account-institution"
                  value={accountForm.institution}
                  onChange={(event) => setAccountForm({ ...accountForm, institution: event.target.value })}
                  placeholder="Sicoob"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={accountForm.type}
                  onValueChange={(value) => setAccountForm({ ...accountForm, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHECKING">Conta corrente</SelectItem>
                    <SelectItem value="SAVINGS">Poupança</SelectItem>
                    <SelectItem value="INVESTMENT">Investimento</SelectItem>
                    <SelectItem value="CASH">Caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-initial">Saldo inicial (R$)</Label>
              <Input
                id="account-initial"
                inputMode="decimal"
                value={accountForm.initial}
                onChange={(event) => setAccountForm({ ...accountForm, initial: event.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={submitAccount} disabled={saveAccount.isPending}>
              Adicionar conta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo parcelamento · {SCOPE_LABEL[scope]}</DialogTitle>
            <DialogDescription>
              Cartão, cheque, empréstimo ou notinha — o app divide e mostra quanto vence em cada mês.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={planForm.kind}
                onValueChange={(value) => setPlanForm({ ...planForm, kind: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTALLMENT_KINDS.filter((kind) => kind.value !== "CREDIT_CARD" && kind.value !== "LOAN").map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-description">Descrição</Label>
              <Input
                id="plan-description"
                value={planForm.description}
                onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })}
                placeholder="Ex.: cartão Nubank, cheque fornecedor"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-total">Valor total (R$)</Label>
                <Input
                  id="plan-total"
                  inputMode="decimal"
                  value={planForm.total}
                  onChange={(event) => setPlanForm({ ...planForm, total: event.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-count">Parcelas</Label>
                <Input
                  id="plan-count"
                  type="number"
                  min={1}
                  value={planForm.installments}
                  onChange={(event) => setPlanForm({ ...planForm, installments: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-due">1º vencimento</Label>
                <Input
                  id="plan-due"
                  type="date"
                  value={planForm.firstDue}
                  onChange={(event) => setPlanForm({ ...planForm, firstDue: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Conta</Label>
                <Select
                  value={planForm.account_id || "none"}
                  onValueChange={(value) =>
                    setPlanForm({ ...planForm, account_id: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem conta</SelectItem>
                    {scopeAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-category">Categoria</Label>
              <Input
                id="plan-category"
                list="finance-categories-plan"
                value={planForm.category}
                onChange={(event) => setPlanForm({ ...planForm, category: event.target.value })}
                placeholder="opcional"
              />
              <datalist id="finance-categories-plan">
                {scopeCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={submitPlan} disabled={saveInstallment.isPending}>
              Criar parcelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar extrato</DialogTitle>
            <DialogDescription>
              Envie o arquivo do banco (OFX ou CSV) ou cole o texto. Cada linha vira um lançamento —
              duplicados são ignorados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Lançar em</Label>
                <Select value={importScope} onValueChange={(value) => setImportScope(value as Scope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPRESA">Empresa</SelectItem>
                    <SelectItem value="PESSOAL">Pessoal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Conta</Label>
                <Select
                  value={importAccount || "none"}
                  onValueChange={(value) => setImportAccount(value === "none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem conta</SelectItem>
                    {accounts
                      .filter((account) => accountScope(account) === importScope)
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria padrão</Label>
                <Input
                  value={importCategory}
                  onChange={(event) => setImportCategory(event.target.value)}
                  placeholder="opcional"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
              <input
                ref={fileRef}
                type="file"
                accept=".ofx,.csv,.txt"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <FileUp className="size-3.5" /> Escolher arquivo
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {fileName || "OFX, CSV ou TXT exportado do banco"}
                </span>
              </div>
              <Textarea
                rows={4}
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                placeholder="…ou cole aqui o extrato (data;descrição;valor)"
                className="text-xs"
              />
              <Button type="button" size="sm" variant="ghost" onClick={handlePaste} disabled={!pasted.trim()}>
                Ler texto colado
              </Button>
            </div>

            {parsed.length ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">{parsed.length} lançamentos encontrados</p>
                  <Button size="sm" variant="ghost" onClick={() => setParsed([])}>
                    limpar
                  </Button>
                </div>
                <div className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70 scrollbar-thin">
                  {parsed.slice(0, 80).map((item, index) => (
                    <div key={`${item.externalId}-${index}`} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-14 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {format(parseISO(item.date), "dd/MM")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {item.description}
                      </span>
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          item.amountCents >= 0 ? "text-primary" : "text-foreground",
                        )}
                      >
                        {item.amountCents >= 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(item.amountCents))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={confirmImport}
              disabled={!parsed.length || importTransactions.isPending}
            >
              Importar {parsed.length ? `${parsed.length} lançamentos` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
