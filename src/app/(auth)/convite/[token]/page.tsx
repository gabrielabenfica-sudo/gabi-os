import Link from "next/link";
import { getSession } from "@/server/auth/current";
import { getInvitation } from "@/server/team";
import { InviteForms } from "./invite-forms";

export const metadata = { title: "Convite" };

const ROLE = { ADMIN: "administradora", EDITOR: "editora", VIEWER: "leitora", OWNER: "dona" } as const;
const MODULE = { tasks: "Tarefas", calendar: "Agenda", notes: "Anotações", goals: "Metas", habits: "Hábitos", finance: "Financeiro", crm: "CRM", mentees: "Mentorados", content: "Conteúdo" } as Record<string, string>;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv, session] = await Promise.all([getInvitation(token), getSession()]);
  if (!inv) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Convite inválido</h1>
        <p className="text-sm text-muted-foreground">Este link expirou, já foi usado ou foi cancelado. Peça um novo convite.</p>
        <Link href="/login" className="text-sm text-primary hover:underline">Ir para o login</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Convite para “{inv.workspace}”</h1>
        <p className="text-sm text-muted-foreground">
          {inv.invitedBy} convidou <b>{inv.email}</b> como {ROLE[inv.role]}
          {inv.role !== "ADMIN" && (inv.modules.length ? `, com acesso a: ${inv.modules.map((m) => MODULE[m] ?? m).join(", ")}` : ", sem módulos liberados ainda")}.
        </p>
      </header>
      <InviteForms token={token} email={inv.email} hasAccount={inv.hasAccount} loggedInAs={session?.user.email ?? null} />
    </div>
  );
}
