"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellRing, CalendarCheck, CalendarDays, CheckCheck, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Checkbox, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { DigestData, NotificationPrefs } from "@/server/notifications";
import { deleteNotificationAction, markAllReadAction, markReadAction, previewDigestAction, updatePrefsAction } from "./actions";

type Item = { id: string; type: string; title: string; body: string | null; link: string | null; data: unknown; readAt: string | null; createdAt: string };

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  DAILY_DIGEST: CalendarDays,
  WEEKLY_REVIEW: CalendarCheck,
  MONTHLY_REVIEW: CalendarCheck,
  EVENT_REMINDER: BellRing,
};
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function NotificationsClient({ items, prefs, tz }: { items: Item[]; prefs: NotificationPrefs; tz: string }) {
  const [open, setOpen] = React.useState<Item | null>(null);
  const [preview, setPreview] = React.useState<DigestData | null>(null);
  const unread = items.filter((i) => !i.readAt).length;

  const openItem = async (item: Item) => {
    if (item.data) setOpen(item);
    if (!item.readAt) await markReadAction(item.id);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Notificações"
        description="Resumos e lembretes gerados a partir do que você registrou."
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              onClick={async () => {
                const r = await markAllReadAction();
                if (!r.ok) toast.error(r.error);
              }}
            >
              <CheckCheck /> Marcar tudo como lido
            </Button>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section aria-label="Lista de notificações">
          {items.length === 0 ? (
            <EmptyState icon={Bell} title="Nenhuma notificação ainda" description="O resumo diário aparece aqui no horário configurado, assim como lembretes de compromissos." />
          ) : (
            <ul className="grid gap-2">
              {items.map((i) => {
                const Icon = ICON[i.type] ?? Bell;
                return (
                  <li key={i.id} className={cn("group flex items-start gap-3 rounded-xl border border-border bg-card p-4", !i.readAt && "border-l-4 border-l-brand")}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary"><Icon className="size-4 text-muted-foreground" /></span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", !i.readAt && "font-semibold")}>{i.title}</p>
                      {i.body && <p className="text-sm text-muted-foreground">{i.body}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {i.data ? (
                        <Button size="sm" variant="ghost" onClick={() => openItem(i)}><Eye /> Ver</Button>
                      ) : i.link ? (
                        <Button size="sm" variant="ghost" asChild><Link href={i.link} onClick={() => !i.readAt && markReadAction(i.id)}>Abrir</Link></Button>
                      ) : null}
                      <Button size="icon" variant="ghost" aria-label="Excluir notificação" onClick={() => deleteNotificationAction(i.id)} className="opacity-0 group-hover:opacity-100 focus:opacity-100">
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="grid content-start gap-4">
          <PrefsCard prefs={prefs} />
          <Card>
            <CardHeader>
              <CardTitle>Ver um resumo agora</CardTitle>
              <CardDescription>Monta o resumo com os dados atuais, sem esperar o horário.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              {(["DAILY", "WEEKLY"] as const).map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const r = await previewDigestAction(k);
                    if (!r.ok) return toast.error(r.error);
                    setPreview(r.data);
                  }}
                >
                  {k === "DAILY" ? "Resumo de hoje" : "Semana passada"}
                </Button>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      {(open || preview) && (
        <DigestDialog
          title={open?.title ?? (preview?.kind === "DAILY" ? "Resumo de hoje (prévia)" : "Revisão da semana passada (prévia)")}
          data={(open?.data as DigestData) ?? preview!}
          onClose={() => {
            setOpen(null);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

function DigestDialog({ title, data, onClose }: { title: string; data: DigestData; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {data.period.from === data.period.to
              ? data.period.from.split("-").reverse().join("/")
              : `${data.period.from.split("-").reverse().join("/")} a ${data.period.to.split("-").reverse().join("/")}`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {data.sections.map((s) => (
            <section key={s.title} className="grid gap-1.5">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              {s.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{s.empty}</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {s.items.map((it, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-0">
                      {it.link ? <Link href={it.link} className="hover:underline" onClick={onClose}>{it.label}</Link> : <span>{it.label}</span>}
                      {it.detail && <span className="shrink-0 text-xs text-muted-foreground">{it.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrefsCard({ prefs }: { prefs: NotificationPrefs }) {
  const [v, setV] = React.useState(prefs);
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof NotificationPrefs>(k: K, val: NotificationPrefs[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências</CardTitle>
        <CardDescription>Quando gerar resumos e lembretes dentro do app.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const r = await updatePrefsAction(v);
            setSaving(false);
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.inAppEnabled} onChange={(e) => set("inAppEnabled", e.target.checked)} /> Notificações no app
          </label>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 text-sm">
            <Checkbox checked={v.dailyEnabled} onChange={(e) => set("dailyEnabled", e.target.checked)} aria-label="Resumo diário" id="pf-daily" />
            <Field label="Resumo diário às" htmlFor="pf-daily-time">
              <Input id="pf-daily-time" type="time" value={v.dailyTime} onChange={(e) => set("dailyTime", e.target.value)} disabled={!v.dailyEnabled} className="w-32" />
            </Field>
            <Checkbox checked={v.weeklyEnabled} onChange={(e) => set("weeklyEnabled", e.target.checked)} aria-label="Revisão semanal" />
            <Field label="Revisão semanal em" htmlFor="pf-week">
              <Select id="pf-week" value={v.weeklyDay} onChange={(e) => set("weeklyDay", Number(e.target.value))} disabled={!v.weeklyEnabled} className="w-40">
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </Select>
            </Field>
            <Checkbox checked={v.monthlyEnabled} onChange={(e) => set("monthlyEnabled", e.target.checked)} aria-label="Revisão mensal" />
            <Field label="Revisão mensal no dia" htmlFor="pf-month">
              <Input id="pf-month" type="number" min={1} max={28} value={v.monthlyDay} onChange={(e) => set("monthlyDay", Math.min(28, Math.max(1, Number(e.target.value) || 1)))} disabled={!v.monthlyEnabled} className="w-24" />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Os resumos são gerados quando você abre o app após o horário (e, se publicado com agendador, uma vez por dia automaticamente). Envio por e-mail entra junto com as integrações.
          </p>
          <div>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar preferências"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
