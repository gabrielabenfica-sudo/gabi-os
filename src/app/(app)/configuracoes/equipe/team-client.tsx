"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Checkbox, PageHeader } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { inviteAction, removeMemberAction, revokeInviteAction, updateMemberAction } from "./actions";

const MODULES = [
  { key: "tasks", label: "Tarefas" },
  { key: "calendar", label: "Agenda" },
  { key: "notes", label: "Anotações" },
  { key: "habits", label: "Hábitos" },
  { key: "goals", label: "Metas" },
  { key: "content", label: "Conteúdo" },
  { key: "crm", label: "CRM" },
  { key: "mentees", label: "Mentorados", sensitive: true },
  { key: "finance", label: "Financeiro", sensitive: true },
] as const;
const ROLES = [
  { value: "EDITOR", label: "Editora (cria e altera)" },
  { value: "VIEWER", label: "Leitora (só vê)" },
  { value: "ADMIN", label: "Administradora (tudo, inclusive equipe)" },
];
const ROLE_LABEL: Record<string, string> = { OWNER: "Dona", ADMIN: "Administradora", EDITOR: "Editora", VIEWER: "Leitora" };

type Member = { id: string; role: string; modules: string[]; user: { id: string; name: string; email: string } };
type Invite = { id: string; email: string; role: string; modules: string[]; expiresAt: string };

export function TeamClient({ workspaces, workspaceId, currentUserId, members, invitations }: { workspaces: { id: string; name: string }[]; workspaceId: string; currentUserId: string; members: Member[]; invitations: Invite[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const confirm = useConfirm();
  const [form, setForm] = React.useState({ email: "", role: "EDITOR", modules: ["tasks", "calendar"] as string[] });
  const [link, setLink] = React.useState<string | null>(null);

  return (
    <div className="grid gap-5">
      <PageHeader title="Equipe" description="Convide colaboradores e escolha o que cada pessoa pode ver. Financeiro e mentorados só ficam visíveis se você marcar." />
      {workspaces.length > 1 && (
        <Select aria-label="Ambiente da equipe" value={workspaceId} onChange={(e) => router.replace(`${pathname}?ws=${e.target.value}`)} className="w-64">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="size-5" /> Convidar</CardTitle>
          <CardDescription>O app gera um link de uso único (válido por 7 dias) para você enviar à pessoa. Ninguém entra sem o link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await inviteAction({ workspaceId, ...form });
              if (!r.ok) return toast.error(r.error);
              setLink(r.data.link);
              setForm((f) => ({ ...f, email: "" }));
              router.refresh();
            }}
          >
            <div className="flex flex-wrap gap-3">
              <Field label="E-mail" htmlFor="tm-email"><Input id="tm-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-72" /></Field>
              <Field label="Papel" htmlFor="tm-role">
                <Select id="tm-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-72">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
            </div>
            {form.role !== "ADMIN" && <ModulePicker value={form.modules} onChange={(modules) => setForm({ ...form, modules })} idPrefix="new" />}
            <div><Button type="submit">Gerar convite</Button></div>
          </form>
          {link && (
            <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/40 p-3" data-testid="invite-link">
              <p className="text-sm font-medium">Envie este link para a pessoa:</p>
              <div className="flex gap-2">
                <Input readOnly value={link} aria-label="Link do convite" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."), () => toast.error("Copie manualmente."))}><Copy /> Copiar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pessoas com acesso</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {members.map((m) => <MemberRow key={m.id} member={m} self={m.user.id === currentUserId} onRemove={async () => {
            if (!(await confirm({ title: `Remover ${m.user.name}?`, description: "O acesso a este ambiente é encerrado na hora.", danger: true, confirmLabel: "Remover" }))) return;
            const r = await removeMemberAction(m.id);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          }} />)}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Convites pendentes</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{i.email}</span>
                  <Badge variant="outline">{ROLE_LABEL[i.role]}</Badge>
                  <span className="text-xs text-muted-foreground">expira em {new Date(i.expiresAt).toLocaleDateString("pt-BR")}</span>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => {
                    const r = await revokeInviteAction(i.id);
                    if (!r.ok) return toast.error(r.error);
                    router.refresh();
                  }}>Cancelar</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ModulePicker({ value, onChange, idPrefix, disabled }: { value: string[]; onChange: (v: string[]) => void; idPrefix: string; disabled?: boolean }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">Módulos liberados</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {MODULES.map((m) => (
          <label key={m.key} className="flex items-center gap-1.5 text-sm" htmlFor={`${idPrefix}-${m.key}`}>
            <Checkbox id={`${idPrefix}-${m.key}`} disabled={disabled} checked={value.includes(m.key)} onChange={(e) => onChange(e.target.checked ? [...value, m.key] : value.filter((x) => x !== m.key))} />
            {m.label}{"sensitive" in m && <span className="text-xs text-warning">(sensível)</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MemberRow({ member, self, onRemove }: { member: Member; self: boolean; onRemove: () => void }) {
  const router = useRouter();
  const [role, setRole] = React.useState(member.role);
  const [modules, setModules] = React.useState(member.modules);
  const dirty = role !== member.role || modules.join() !== member.modules.join();
  const owner = member.role === "OWNER";
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3" data-member={member.user.email}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{member.user.name}{self ? " (você)" : ""}</p>
        <span className="text-sm text-muted-foreground">{member.user.email}</span>
        {owner ? <Badge>Dona</Badge> : (
          <Select aria-label={`Papel de ${member.user.name}`} value={role} onChange={(e) => setRole(e.target.value)} className="ml-auto h-8 w-64">
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        )}
        {!owner && <Button size="icon" variant="ghost" aria-label={`Remover ${member.user.name}`} onClick={onRemove}><Trash2 /></Button>}
      </div>
      {!owner && role !== "ADMIN" && <ModulePicker value={modules} onChange={setModules} idPrefix={member.id} />}
      {!owner && dirty && (
        <div>
          <Button size="sm" onClick={async () => {
            const r = await updateMemberAction(member.id, { role, modules });
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          }}>Salvar permissões</Button>
        </div>
      )}
    </div>
  );
}
