"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, AtSign, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, WsDot } from "@/components/ui/misc";
import { ValueLine } from "@/components/value-line";
import { cn } from "@/lib/utils";
import type { profileOverview } from "@/server/content";
import { archiveProfileAction, createProfileAction, deleteProfileSnapshotAction, saveProfileSnapshotAction, updateProfileAction } from "./actions";
import { br, num, type ContentWs, type Href, type ProfileRow } from "./shared";

type Overview = Awaited<ReturnType<typeof profileOverview>>;
const ymdOf = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export function ProfilesTab({ profiles, overview, workspaces, range, today, href }: { profiles: ProfileRow[]; overview: Overview | null; workspaces: ContentWs[]; range: { from: string; to: string }; today: string; href: Href }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<ProfileRow | "new" | null>(null);
  const selectedId = overview?.profile.id;

  if (!profiles.length) {
    return (
      <>
        <EmptyState
          icon={AtSign}
          title="Nenhum perfil cadastrado"
          description="Cadastre seus perfis do Instagram para acompanhar seguidores, alcance e frequência de postagem. A conexão automática com a Meta chega na fase de integrações; até lá, registre os números manualmente."
          action={<Button onClick={() => setEditing("new")}><Plus /> Cadastrar perfil</Button>}
        />
        {editing && <ProfileDialog edit={null} workspaces={workspaces} onClose={() => setEditing(null)} />}
      </>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <div className="grid content-start gap-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => router.replace(href({ perfil: p.id }))}
            className={cn("rounded-xl border border-border bg-card p-3 text-left transition-shadow hover:shadow-md", p.id === selectedId && "ring-2 ring-ring/40", p.archived && "opacity-60")}
          >
            <p className="flex items-center gap-2 font-medium"><WsDot color={p.workspace.color} /> @{p.username}</p>
            <p className="text-xs text-muted-foreground">{p.name}{p.archived ? " · arquivado" : ""}</p>
            {p.snapshots[0]?.followers != null && <p className="mt-1 text-sm tabular">{num(p.snapshots[0].followers)} seguidores</p>}
          </button>
        ))}
        <Button variant="outline" onClick={() => setEditing("new")}><Plus /> Cadastrar perfil</Button>
      </div>

      {overview && (
        <div className="grid content-start gap-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">@{overview.profile.username}</h2>
              <p className="text-sm text-muted-foreground">{overview.profile.name}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(profiles.find((p) => p.id === overview.profile.id)!)}><Pencil /> Editar</Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const r = await archiveProfileAction(overview.profile.id, !overview.profile.archived);
                  if (!r.ok) return toast.error(r.error);
                  toast.success(r.message);
                  router.refresh();
                }}
              >
                <Archive /> {overview.profile.archived ? "Reativar" : "Arquivar"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Período</span>
            <Input type="date" aria-label="De" value={range.from} className="h-8 w-40" onChange={(e) => e.target.value && router.replace(href({ de: e.target.value }))} />
            <span className="text-muted-foreground">a</span>
            <Input type="date" aria-label="Até" value={range.to} className="h-8 w-40" onChange={(e) => e.target.value && router.replace(href({ ate: e.target.value }))} />
          </div>

          <section aria-label="Indicadores do perfil" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Seguidores" value={num(overview.followersEnd)} />
            <Stat
              label="Crescimento no período"
              value={overview.followersGrowth === null ? "—" : `${overview.followersGrowth > 0 ? "+" : ""}${num(overview.followersGrowth)}`}
              hint={overview.followersGrowth === null ? "precisa de 2 registros" : undefined}
            />
            <Stat label="Publicados" value={String(overview.publishedCount)} hint={`${overview.postsPerWeek.toLocaleString("pt-BR")} por semana`} />
            <Stat
              label="Meta de postagem"
              value={overview.profile.postingGoalPerWeek ? `${overview.profile.postingGoalPerWeek}/semana` : "—"}
              hint={overview.profile.postingGoalPerWeek ? (overview.postsPerWeek >= overview.profile.postingGoalPerWeek ? "dentro da meta" : "abaixo da meta") : "defina no perfil"}
            />
          </section>

          <Card>
            <CardHeader><CardTitle>Seguidores</CardTitle></CardHeader>
            <CardContent>
              <ValueLine
                data={overview.snapshots.filter((s) => s.followers != null).map((s) => ({ label: br(ymdOf(s.date)).slice(0, 5), value: s.followers! }))}
                label="Seguidores"
                caption="Seguidores por data de registro."
              />
            </CardContent>
          </Card>

          <Snapshots overview={overview} today={today} />

          {(overview.profile.audience || overview.profile.positioning || overview.profile.objectives || overview.profile.editorialLine) && (
            <Card>
              <CardHeader><CardTitle>Estratégia</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                {overview.profile.audience && <Info label="Público" text={overview.profile.audience} />}
                {overview.profile.positioning && <Info label="Posicionamento" text={overview.profile.positioning} />}
                {overview.profile.objectives && <Info label="Objetivos" text={overview.profile.objectives} />}
                {overview.profile.editorialLine && <Info label="Linha editorial" text={overview.profile.editorialLine} />}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {editing && <ProfileDialog edit={editing === "new" ? null : editing} workspaces={workspaces} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Info({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

const SNAP_FIELDS = [
  { key: "followers", label: "Seguidores" },
  { key: "reach", label: "Alcance" },
  { key: "views", label: "Visualizações" },
  { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" },
  { key: "shares", label: "Compartilh." },
  { key: "saves", label: "Salvamentos" },
  { key: "posts", label: "Publicações" },
] as const;
type SnapKey = (typeof SNAP_FIELDS)[number]["key"];

function Snapshots({ overview, today }: { overview: Overview; today: string }) {
  const router = useRouter();
  const [date, setDate] = React.useState(today);
  const empty = () => Object.fromEntries(SNAP_FIELDS.map((f) => [f.key, ""])) as Record<SnapKey, string>;
  const [values, setValues] = React.useState(empty);
  const [saving, setSaving] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registros do perfil</CardTitle>
        <CardDescription>Copie os números do painel profissional do Instagram. Um registro por data (salvar de novo na mesma data atualiza).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const input = Object.fromEntries(SNAP_FIELDS.map((f) => [f.key, values[f.key] === "" ? null : Math.round(Number(values[f.key].replace(/\./g, "")))]));
            const r = await saveProfileSnapshotAction(overview.profile.id, { date, ...input });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            setValues(empty());
            router.refresh();
          }}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Data" htmlFor="sn-date"><Input id="sn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            {SNAP_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`sn-${f.key}`}>
                <Input id={`sn-${f.key}`} inputMode="numeric" value={values[f.key]} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))} />
              </Field>
            ))}
          </div>
          <div className="flex justify-end"><Button size="sm" type="submit" disabled={saving}>Registrar números</Button></div>
        </form>
        {overview.snapshots.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="snapshots">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Data</th>
                  {SNAP_FIELDS.map((f) => <th key={f.key} className="py-1.5 pr-3 text-right font-medium">{f.label}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...overview.snapshots].reverse().map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-1.5 pr-3 tabular">{br(ymdOf(s.date))} {s.source !== "MANUAL" && <Badge variant="outline">API</Badge>}</td>
                    {SNAP_FIELDS.map((f) => <td key={f.key} className="py-1.5 pr-3 text-right tabular">{num(s[f.key])}</td>)}
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-danger"
                        aria-label="Excluir registro"
                        onClick={async () => {
                          const r = await deleteProfileSnapshotAction(s.id);
                          if (!r.ok) return toast.error(r.error);
                          router.refresh();
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileDialog({ edit, workspaces, onClose }: { edit: ProfileRow | null; workspaces: ContentWs[]; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState({
    workspaceId: edit?.workspaceId ?? workspaces.find((w) => w.kind === "MENTORIA")?.id ?? workspaces[0]!.id,
    name: edit?.name ?? "",
    username: edit?.username ?? "",
    audience: edit?.audience ?? "",
    positioning: edit?.positioning ?? "",
    objectives: edit?.objectives ?? "",
    editorialLine: edit?.editorialLine ?? "",
    postingGoalPerWeek: edit?.postingGoalPerWeek?.toString() ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar perfil" : "Cadastrar perfil"}</DialogTitle>
          <DialogDescription>Perfil do Instagram (ou outra rede) e sua estratégia.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const input = { ...v, postingGoalPerWeek: v.postingGoalPerWeek ? Number(v.postingGoalPerWeek) : null };
            const r = edit ? await updateProfileAction(edit.id, input) : await createProfileAction(input);
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
            router.refresh();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do perfil" htmlFor="pf-name"><Input id="pf-name" value={v.name} onChange={(e) => set("name", e.target.value)} required autoFocus maxLength={100} placeholder="Ex.: Perfil da Mentoria" /></Field>
            <Field label="Usuário (@)" htmlFor="pf-user"><Input id="pf-user" value={v.username} onChange={(e) => set("username", e.target.value)} required maxLength={60} /></Field>
            {!edit && workspaces.length > 1 && (
              <Field label="Ambiente" htmlFor="pf-ws">
                <Select id="pf-ws" value={v.workspaceId} onChange={(e) => set("workspaceId", e.target.value)}>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Meta de posts por semana" htmlFor="pf-goal"><Input id="pf-goal" type="number" min={0} max={100} value={v.postingGoalPerWeek} onChange={(e) => set("postingGoalPerWeek", e.target.value)} /></Field>
            <Field label="Público" htmlFor="pf-aud" className="sm:col-span-2"><Textarea id="pf-aud" value={v.audience} onChange={(e) => set("audience", e.target.value)} rows={2} /></Field>
            <Field label="Posicionamento" htmlFor="pf-pos" className="sm:col-span-2"><Textarea id="pf-pos" value={v.positioning} onChange={(e) => set("positioning", e.target.value)} rows={2} /></Field>
            <Field label="Objetivos" htmlFor="pf-obj" className="sm:col-span-2"><Textarea id="pf-obj" value={v.objectives} onChange={(e) => set("objectives", e.target.value)} rows={2} /></Field>
            <Field label="Linha editorial" htmlFor="pf-line" className="sm:col-span-2"><Textarea id="pf-line" value={v.editorialLine} onChange={(e) => set("editorialLine", e.target.value)} rows={3} /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
