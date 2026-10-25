import type { AccountWithBalance } from "@/server/finance/accounts";
import type { FinancialCategory } from "@prisma/client";

export type FinanceBase = {
  workspace: { id: string; name: string; kind: "TURBO" | "PESSOAL" | "MENTORIA"; color: string };
  accounts: AccountWithBalance[];
  categories: FinancialCategory[];
  month: string;
  today: string;
  tz: string;
};

export type TransferTarget = { id: string; name: string; workspaceId: string; workspace: { name: string; kind: string } };

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança / reserva",
  CASH: "Dinheiro",
  INVESTMENT: "Investimento",
  WALLET: "Carteira digital",
  OTHER: "Outra",
};

export const COST_TYPE_LABEL: Record<string, string> = {
  FIXED: "Custo fixo",
  VARIABLE: "Custo variável",
  COMMISSION: "Comissão",
  REFUND: "Reembolso",
  OTHER: "Outros",
};

export const ymdBR = (ymd: string) => ymd.split("-").reverse().join("/");
export const dateYmd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
