"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form-controls";
import { PageHeader, Segmented } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { addDaysYmd, addMonthsYmd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { getReview, listReviews } from "@/server/reviews";
import { deleteReviewAction, saveReviewAction } from "./actions";

type Review = Awaited<ReturnType<typeof getReview>>;
type History = Awaited<ReturnType<typeof listReviews>>;
const br = (s: string) => s.split("-").reverse().join("/");

export function ReviewsClient({ review, history, today }: { review: Review; history: History; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const confirm = useConfirm();
  const weekly = review.kind === "WEEKLY";
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`);
  };
  const prev = weekly ? addDaysYmd(review.start, -7) : addMonthsYmd(review.start, -1);
  const next = weekly ? addDaysYmd(review.start, 7) : addMonthsYmd(review.start, 1);
  const label = weekly ? `Semana de ${br(review.start)} a ${br(review.end)}` : new Date(`${review.start}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="grid gap-5">
      <PageHeader title="Revisões" description="Os números do período vêm dos seus registros; a reflexão é sua. Revise o que funcionou e defina as prioridades seguintes." />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented ariaLabel="Tipo de revisão" value={weekly ? "semanal" : "mensal"} onChange={(v) => go({ tipo: v === "mensal" ? "mensal" : null, d: null })} options={[{ value: "semanal", label: "Semanal" }, { value: "mensal", label: "Mensal" }]} />
        <Button variant="outline" size="icon" aria-label="Período anterior" onClick={() => go({ d: prev })}><ChevronLeft /></Button>
        <h2 className="min-w-48 text-center font-semibold first-letter:uppercase">{label}</h2>
        <Button variant="outline" size="icon" aria-label="Próximo período" disabled={next > today} onClick={() => go({ d: next })}><ChevronRight /></Button>
        {!review.isCurrent && <Button variant="ghost" size="sm" onClick={() => go({ d: null })}>Período atual</Button>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="grid content-start gap-4" data-testid="review-digest">
          {review.digest.sections.map((s) => (
            <Card key={s.title}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{s.title}</CardTitle></CardHeader>
              <CardContent>
                {s.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{s.empty}</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {s.items.slice(0, 12).map((i, k) => (
                      <li key={k} className="flex flex-wrap gap-x-2">
                        {i.link ? <Link href={i.link} className="hover:underline">{i.label}</Link> : <span>{i.label}</span>}
                        {i.detail && <span className="text-muted-foreground">· {i.detail}</span>}
                      </li>
                    ))}
                    {s.items.length > 12 && <li className="text-xs text-muted-foreground">+ {s.items.length - 12}</li>}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <ReflectionForm key={`${review.kind}-${review.start}-${review.saved?.updatedAt ?? ""}`} review={review} />
      </div>

      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Revisões anteriores</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-2" data-testid="review-history">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 text-sm">
                  <button type="button" className="flex-1 text-left hover:underline" onClick={() => go({ tipo: h.kind === "MONTHLY" ? "mensal" : null, d: h.start })}>
                    {h.kind === "WEEKLY" ? `Semana ${br(h.start)}` : `Mês ${h.start.slice(5, 7)}/${h.start.slice(0, 4)}`}
                    {h.wins && <span className="text-muted-foreground"> · {h.wins.split("\n")[0]!.slice(0, 80)}</span>}
                  </button>
                  {h.rating && <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Star className="size-3 fill-current" />{h.rating}</span>}
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-danger"
                    aria-label="Excluir revisão"
                    onClick={async () => {
                      if (!(await confirm({ title: "Excluir revisão?", danger: true, confirmLabel: "Excluir" }))) return;
                      const r = await deleteReviewAction(h.id);
                      if (!r.ok) return toast.error(r.error);
                      router.refresh();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReflectionForm({ review }: { review: Review }) {
  const router = useRouter();
  const s = review.saved;
  const [v, setV] = React.useState({ wins: s?.wins ?? "", improvements: s?.improvements ?? "", lessons: s?.lessons ?? "", priorities: s?.priorities ?? "", rating: s?.rating ?? null as number | null });
  const [saving, setSaving] = React.useState(false);
  const weekly = review.kind === "WEEKLY";
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Minha revisão</CardTitle>
        <CardDescription>{s ? `Salva em ${new Date(s.updatedAt).toLocaleDateString("pt-BR")}` : "Ainda não escrita."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const r = await saveReviewAction({ kind: review.kind, day: review.start, ...v, rating: v.rating });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          }}
        >
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Como foi {weekly ? "a semana" : "o mês"}?</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Nota do período">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={v.rating === n}
                  aria-label={`${n} de 5`}
                  onClick={() => setV((p) => ({ ...p, rating: p.rating === n ? null : n }))}
                  className="rounded p-0.5"
                >
                  <Star className={cn("size-6", v.rating !== null && n <= v.rating ? "fill-warning text-warning" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
          </div>
          <Field label="O que deu certo" htmlFor="rv-wins"><Textarea id="rv-wins" value={v.wins} onChange={(e) => setV((p) => ({ ...p, wins: e.target.value }))} rows={3} /></Field>
          <Field label="O que ajustar" htmlFor="rv-imp"><Textarea id="rv-imp" value={v.improvements} onChange={(e) => setV((p) => ({ ...p, improvements: e.target.value }))} rows={3} /></Field>
          <Field label="Aprendizados" htmlFor="rv-lessons"><Textarea id="rv-lessons" value={v.lessons} onChange={(e) => setV((p) => ({ ...p, lessons: e.target.value }))} rows={2} /></Field>
          <Field label={weekly ? "Prioridades da próxima semana" : "Prioridades do próximo mês"} htmlFor="rv-pri"><Textarea id="rv-pri" value={v.priorities} onChange={(e) => setV((p) => ({ ...p, priorities: e.target.value }))} rows={3} /></Field>
          <div className="flex justify-end"><Button type="submit" disabled={saving}>Salvar revisão</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
