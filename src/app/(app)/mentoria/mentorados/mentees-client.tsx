"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, GraduationCap, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader, Segmented } from "@/components/ui/misc";
import { MoneyInput } from "@/components/finance/money-input";
import { addDaysYmd, formatDateTimeBR } from "@/lib/dates";
import type { MenteeRow } from "@/server/mentees";
import { createMenteeAction, updateMenteeAction } from "../actions";

export type Program = { id: string; name: string; durationWeeks: number | null; priceCents: number | null; active: boolean };

export const MENTEE_STATUS = {
  ACTIVE: { label: "Ativo", variant: "success" },
  PAUSED: { label: "Pausado", variant: "warning" },
  COMPLETED: { label: "Concluído", variant: "info" },
  CANCELLED: { label: "Cancelado", variant: "outline" },
} as const;

const ymd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const br = (s: string) => (s ? s.split("-").reverse().join("/") : "—");

export function MenteesClient({ workspaceId, mentees, status, programs, today, tz, openNew }: { workspaceId: string; mentees: MenteeRow[]; status: string; programs: Program[]; today: string; tz: string; openNew: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const [creating, setCreating] = React.useState(openNew);
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    return `${pathname}${p.toString() ? `?${p}` : ""}`;
  };
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) router.replace(href({ q: search || null }), { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Mentorados"
        description="Ficha, encontros, metas e evolução de cada mentorado."
        actions={<Button onClick={() => setCreating(true)}><Plus /> Novo mentorado</Button>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Status"
          value={status}
          onChange={(s) => router.replace(href({ status: s === "ACTIVE" ? null : s }))}
          options={[{ value: "ACTIVE", label: "Ativos" }, { value: "PAUSED", label: "Pausados" }, { value: "COMPLETED", label: "Concluídos" }, { value: "CANCELLED", label: "Cancelados" }, { value: "all", label: "Todos" }]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" aria-label="Buscar mentorado" className="w-56 pl-8" />
        </div>
      </div>

      {mentees.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={status === "ACTIVE" && !search ? "Nenhum mentorado ativo" : "Nada encontrado"}
          description="Cadastre aqui ou registre a venda de um lead no CRM: o mentorado é criado automaticamente."
          action={<Button onClick={() => setCreating(true)}><Plus /> Novo mentorado</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="mentees">
          {mentees.map((m) => {
            const st = MENTEE_STATUS[m.status];
            return (
              <Link key={m.id} href={`/mentoria/mentorados/${m.id}`} data-mentee={m.name} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <Card className="grid h-full gap-2 p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.program?.name ?? "Sem produto definido"}{m.instagram ? ` · @${m.instagram}` : ""}</p>
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Início {br(ymd(m.startDate))}</span>
                    <span className={m.endingSoon ? "font-medium text-warning" : undefined}>Término {br(ymd(m.expectedEndDate))}{m.endingSoon && ymd(m.expectedEndDate) < today ? " (vencido)" : ""}</span>
                    <span>{m.sessionsDone} encontro(s)</span>
                    <span>Metas {m.goalsDone}/{m.goalsTotal}</span>
                  </div>
                  {m.nextSession && (
                    <p className="flex items-center gap-1 text-xs"><CalendarClock className="size-3.5 text-muted-foreground" /> Próximo encontro: {formatDateTimeBR(new Date(m.nextSession), tz)}</p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {creating && (
        <MenteeDialog
          workspaceId={workspaceId}
          programs={programs}
          today={today}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            if (id) router.push(`/mentoria/mentorados/${id}`);
          }}
        />
      )}
    </div>
  );
}

export type MenteeEditable = {
  id: string; name: string; email: string | null; phone: string | null; instagram: string | null; programId: string | null; startDate: Date | string | null;
  expectedEndDate: Date | string | null; contractedCents: number | null; paymentTerms: string | null; status: keyof typeof MENTEE_STATUS; notes: string | null;
};

export function MenteeDialog({ workspaceId, edit, programs, today, onClose, onSaved }: { workspaceId: string; edit?: MenteeEditable; programs: Program[]; today: string; onClose: () => void; onSaved: (id?: string) => void }) {
  const [v, setV] = React.useState({
    name: edit?.name ?? "",
    email: edit?.email ?? "",
    phone: edit?.phone ?? "",
    instagram: edit?.instagram ?? "",
    programId: edit?.programId ?? "",
    startDate: edit ? ymd(edit.startDate) : today,
    expectedEndDate: ymd(edit?.expectedEndDate),
    contractedCents: edit?.contractedCents ?? (null as number | null),
    paymentTerms: edit?.paymentTerms ?? "",
    status: edit?.status ?? ("ACTIVE" as keyof typeof MENTEE_STATUS),
    notes: edit?.notes ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar ficha" : "Novo mentorado"}</DialogTitle>
          <DialogDescription>Dados de contato e do contrato. A venda é registrada no financeiro (ou pelo CRM).</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const input = { ...v, programId: v.programId || null, startDate: v.startDate || null, expectedEndDate: v.expectedEndDate || null };
            const r = edit ? await updateMenteeAction(edit.id, input) : await createMenteeAction({ ...input, workspaceId });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onSaved(edit ? undefined : (r.data as string));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="mt-name" className="sm:col-span-2"><Input id="mt-name" value={v.name} onChange={(e) => set("name", e.target.value)} required autoFocus maxLength={120} /></Field>
            <Field label="E-mail" htmlFor="mt-email"><Input id="mt-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} maxLength={200} /></Field>
            <Field label="WhatsApp / telefone" htmlFor="mt-phone"><Input id="mt-phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} /></Field>
            <Field label="Instagram" htmlFor="mt-ig"><Input id="mt-ig" value={v.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@usuario" maxLength={60} /></Field>
            <Field label="Produto / mentoria" htmlFor="mt-program">
              <Select
                id="mt-program"
                value={v.programId}
                onChange={(e) => {
                  const p = programs.find((x) => x.id === e.target.value);
                  setV((prev) => ({
                    ...prev,
                    programId: e.target.value,
                    expectedEndDate: prev.expectedEndDate || (p?.durationWeeks && prev.startDate ? addDaysYmd(prev.startDate, p.durationWeeks * 7) : ""),
                    contractedCents: prev.contractedCents ?? p?.priceCents ?? null,
                  }));
                }}
              >
                <option value="">Não definido</option>
                {programs.filter((p) => p.active || p.id === v.programId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Início" htmlFor="mt-start"><Input id="mt-start" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="Término previsto" htmlFor="mt-end"><Input id="mt-end" type="date" value={v.expectedEndDate} onChange={(e) => set("expectedEndDate", e.target.value)} /></Field>
            <Field label="Valor contratado" htmlFor="mt-value"><MoneyInput id="mt-value" value={v.contractedCents} onChange={(c) => set("contractedCents", c)} /></Field>
            <Field label="Forma de pagamento" htmlFor="mt-terms"><Input id="mt-terms" value={v.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Ex.: 6x no cartão" maxLength={200} /></Field>
            {edit && (
              <Field label="Status" htmlFor="mt-status">
                <Select id="mt-status" value={v.status} onChange={(e) => set("status", e.target.value as typeof v.status)}>
                  {Object.entries(MENTEE_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Observações" htmlFor="mt-notes" className="sm:col-span-2"><Textarea id="mt-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={10000} /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{edit ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
