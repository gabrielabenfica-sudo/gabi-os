import { Wallet } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { EmptyState } from "@/components/ui/misc";
import { findFinanceWorkspace } from "@/server/finance/common";
import { compensationYear } from "@/server/finance/compensation";
import { listAccounts } from "@/server/finance/accounts";
import { todayYmd } from "@/lib/dates";
import { CompensationClient } from "./compensation-client";

export const metadata = { title: "Remuneração TURBO" };

export default async function CompensationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const turbo = await findFinanceWorkspace(user.id, "TURBO");
  if (!turbo) return <EmptyState icon={Wallet} title="Sem acesso" description="Você não tem acesso ao financeiro do ambiente TURBO." />;
  const pessoal = await findFinanceWorkspace(user.id, "PESSOAL");
  const today = todayYmd(user.timezone);
  const year = sp.ano && /^\d{4}$/.test(sp.ano) ? Number(sp.ano) : Number(today.slice(0, 4));
  const [data, accounts] = await Promise.all([
    compensationYear(user.id, turbo.id, year),
    pessoal ? listAccounts(user.id, pessoal.id) : Promise.resolve([]),
  ]);
  return (
    <CompensationClient
      workspace={{ id: turbo.id, name: turbo.name, color: turbo.color }}
      data={JSON.parse(JSON.stringify(data))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      today={today}
    />
  );
}
