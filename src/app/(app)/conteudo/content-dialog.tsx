"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, ExternalLink, NotebookPen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Segmented } from "@/components/ui/misc";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { CONTENT_FORMATS, CONTENT_PLATFORMS, engagementRate, interactions } from "@/lib/content";
import type { getContent } from "@/server/content";
import {
  createContentAction, createContentStatusAction, deleteContentAction, deleteContentMetricAction, deleteContentStatusAction, duplicateContentAction, getContentAction,
  renameContentStatusAction, reorderContentStatusesAction, saveContentMetricAction, updateContentAction,
} from "./actions";
import { createLinkedNoteAction } from "../mentoria/actions";
import { br, partsInTz, type ContentStatusOption, type ContentWs, type ProfileRow } from "./shared";

type Detail = Awaited<ReturnType<typeof getContent>>;

export function ContentDialog({
  id, preset, workspaces, statuses, profiles, today, tz, onClose,
}: {
  id?: string; preset?: { statusId?: string; publishDate?: string; workspaceId?: string }; workspaces: ContentWs[]; statuses: ContentStatusOption[];
  profiles: ProfileRow[]; today: string; tz: string; onClose: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [item, setItem] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(Boolean(id));
  const [section, setSection] = React.useState<"dados" | "metricas" | "arquivos">("dados");

  const load = React.useCallback(async () => {
    if (!id) return;
    const r = await getContentAction(id);
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      onClose();
      return;
    }
    setItem(r.value);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => void load(), [load]);
  if (loading) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? item.title : "Novo conteúdo"}</DialogTitle>
          <DialogDescription>{item ? `${item.workspace.name} · ${item.status.name}` : "Da ideia à publicação."}</DialogDescription>
        </DialogHeader>
        {item && (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Seções do conteúdo"
              size="sm"
              value={section}
              onChange={setSection}
              options={[{ value: "dados", label: "Dados" }, { value: "metricas", label: `Métricas (${item.metrics.length})` }, { value: "arquivos", label: "Arquivos" }]}
            />
            <div className="ml-auto flex gap-1">
              {item.publishedUrl && <Button size="sm" variant="ghost" asChild><a href={item.publishedUrl} target="_blank" rel="noreferrer"><ExternalLink /> Ver post</a></Button>}
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const r = await createLinkedNoteAction(item.workspaceId, "content", item.id, item.title);
                  if (!r.ok) return toast.error(r.error);
                  router.push(`/anotacoes?n=${r.value}`);
                }}
              >
                <NotebookPen /> Anotação
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const r = await duplicateContentAction(item.id);
                  if (!r.ok) return toast.error(r.error);
                  toast.success(r.message);
                  onClose();
                }}
              >
                <Copy /> Duplicar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Excluir conteúdo"
                onClick={async () => {
                  if (!(await confirm({ title: "Excluir conteúdo?", danger: true, confirmLabel: "Excluir" }))) return;
                  const r = await deleteContentAction(item.id);
                  if (!r.ok) return toast.error(r.error);
                  toast.success(r.message);
                  onClose();
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        )}
        {section === "dados" && (
          <ContentForm
            item={item}
            preset={preset}
            workspaces={workspaces}
            statuses={statuses}
            profiles={profiles}
            tz={tz}
            onSaved={async () => {
              if (item) await load();
              else onClose();
              router.refresh();
            }}
            onCancel={onClose}
          />
        )}
        {section === "metricas" && item && <Metrics item={item} today={today} onChange={async () => { await load(); router.refresh(); }} />}
        {section === "arquivos" && item && <AttachmentsPanel entityType="content" entityId={item.id} />}
      </DialogContent>
    </Dialog>
  );
}

function ContentForm({
  item, preset, workspaces, statuses, profiles, tz, onSaved, onCancel,
}: {
  item: Detail | null; preset?: { statusId?: string; publishDate?: string; workspaceId?: string }; workspaces: ContentWs[]; statuses: ContentStatusOption[]; profiles: ProfileRow[];
  tz: string; onSaved: () => void; onCancel: () => void;
}) {
  const rec = item?.recordingDate ? partsInTz(item.recordingDate, tz) : null;
  const pub = item?.publishDate ? partsInTz(item.publishDate, tz) : null;
  const initialWs = item?.workspaceId ?? preset?.workspaceId ?? workspaces[0]!.id;
  const [v, setV] = React.useState({
    workspaceId: initialWs,
    title: item?.title ?? "",
    statusId: item?.statusId ?? preset?.statusId ?? statuses.find((s) => s.workspaceId === initialWs)?.id ?? "",
    profileId: item?.profileId ?? "",
    platform: item?.platform ?? "instagram",
    format: item?.format ?? "",
    objective: item?.objective ?? "",
    audience: item?.audience ?? "",
    hook: item?.hook ?? "",
    script: item?.script ?? "",
    cta: item?.cta ?? "",
    owner: item?.owner ?? "",
    participants: item?.participants ?? "",
    recordingDate: rec?.ymd ?? "",
    recordingTime: rec && rec.hm !== "12:00" ? rec.hm : "",
    publishDate: pub?.ymd ?? preset?.publishDate ?? "",
    publishTime: pub && pub.hm !== "12:00" ? pub.hm : "",
    publishedUrl: item?.publishedUrl ?? "",
    references: item?.references ?? "",
    notes: item?.notes ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const wsStatuses = statuses.filter((s) => s.workspaceId === v.workspaceId);
  const wsProfiles = profiles.filter((p) => p.workspaceId === v.workspaceId);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const input = {
          title: v.title,
          statusId: v.statusId || undefined,
          profileId: v.profileId || null,
          platform: v.platform,
          format: v.format || null,
          objective: v.objective || null,
          audience: v.audience || null,
          hook: v.hook || null,
          script: v.script || null,
          cta: v.cta || null,
          owner: v.owner || null,
          participants: v.participants || null,
          recordingDate: v.recordingDate || null,
          recordingTime: v.recordingDate && v.recordingTime ? v.recordingTime : null,
          publishDate: v.publishDate || null,
          publishTime: v.publishDate && v.publishTime ? v.publishTime : null,
          publishedUrl: v.publishedUrl || null,
          references: v.references || null,
          notes: v.notes || null,
        };
        const r = item ? await updateContentAction(item.id, input) : await createContentAction({ ...input, workspaceId: v.workspaceId });
        setSaving(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        onSaved();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título" htmlFor="ct-title" className="sm:col-span-2"><Input id="ct-title" value={v.title} onChange={(e) => set("title", e.target.value)} required autoFocus={!item} maxLength={300} /></Field>
        {!item && workspaces.length > 1 && (
          <Field label="Ambiente" htmlFor="ct-ws">
            <Select
              id="ct-ws"
              value={v.workspaceId}
              onChange={(e) => {
                const ws = e.target.value;
                setV((p) => ({ ...p, workspaceId: ws, statusId: statuses.find((s) => s.workspaceId === ws)?.id ?? "", profileId: "" }));
              }}
            >
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Etapa" htmlFor="ct-status">
          <Select id="ct-status" value={v.statusId} onChange={(e) => set("statusId", e.target.value)}>
            {wsStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Formato" htmlFor="ct-format">
          <Select id="ct-format" value={v.format} onChange={(e) => set("format", e.target.value)}>
            <option value="">Não definido</option>
            {CONTENT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </Field>
        <Field label="Perfil" htmlFor="ct-profile">
          <Select id="ct-profile" value={v.profileId} onChange={(e) => set("profileId", e.target.value)}>
            <option value="">Sem perfil</option>
            {wsProfiles.map((p) => <option key={p.id} value={p.id}>@{p.username}</option>)}
          </Select>
        </Field>
        <Field label="Plataforma" htmlFor="ct-platform">
          <Select id="ct-platform" value={v.platform} onChange={(e) => set("platform", e.target.value)}>
            {CONTENT_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Objetivo" htmlFor="ct-objective"><Input id="ct-objective" value={v.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Ex.: atrair, educar, vender" maxLength={300} /></Field>
        <Field label="Público" htmlFor="ct-audience"><Input id="ct-audience" value={v.audience} onChange={(e) => set("audience", e.target.value)} maxLength={300} /></Field>
        <Field label="Gancho" htmlFor="ct-hook" className="sm:col-span-2"><Textarea id="ct-hook" value={v.hook} onChange={(e) => set("hook", e.target.value)} rows={2} maxLength={1000} /></Field>
        <Field label="Roteiro" htmlFor="ct-script" className="sm:col-span-2"><Textarea id="ct-script" value={v.script} onChange={(e) => set("script", e.target.value)} rows={6} maxLength={30000} /></Field>
        <Field label="Chamada para ação (CTA)" htmlFor="ct-cta" className="sm:col-span-2"><Input id="ct-cta" value={v.cta} onChange={(e) => set("cta", e.target.value)} maxLength={500} /></Field>
        <Field label="Data de gravação" htmlFor="ct-rec"><Input id="ct-rec" type="date" value={v.recordingDate} onChange={(e) => set("recordingDate", e.target.value)} /></Field>
        <Field label="Horário da gravação" htmlFor="ct-rec-time"><Input id="ct-rec-time" type="time" value={v.recordingTime} onChange={(e) => set("recordingTime", e.target.value)} disabled={!v.recordingDate} /></Field>
        <Field label="Data de publicação" htmlFor="ct-pub"><Input id="ct-pub" type="date" value={v.publishDate} onChange={(e) => set("publishDate", e.target.value)} /></Field>
        <Field label="Horário da publicação" htmlFor="ct-pub-time"><Input id="ct-pub-time" type="time" value={v.publishTime} onChange={(e) => set("publishTime", e.target.value)} disabled={!v.publishDate} /></Field>
        <Field label="Responsável" htmlFor="ct-owner"><Input id="ct-owner" value={v.owner} onChange={(e) => set("owner", e.target.value)} maxLength={100} /></Field>
        <Field label="Participantes" htmlFor="ct-participants"><Input id="ct-participants" value={v.participants} onChange={(e) => set("participants", e.target.value)} maxLength={300} /></Field>
        <Field label="Link publicado" htmlFor="ct-url" className="sm:col-span-2"><Input id="ct-url" type="url" value={v.publishedUrl} onChange={(e) => set("publishedUrl", e.target.value)} placeholder="https://instagram.com/p/…" /></Field>
        <Field label="Referências" htmlFor="ct-refs" className="sm:col-span-2"><Textarea id="ct-refs" value={v.references} onChange={(e) => set("references", e.target.value)} rows={2} maxLength={5000} /></Field>
        <Field label="Observações" htmlFor="ct-notes" className="sm:col-span-2"><Textarea id="ct-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={10000} /></Field>
      </div>
      {item?.publishedAt && <p className="text-xs text-muted-foreground">Publicado em {br(partsInTz(item.publishedAt, tz).ymd)}. A data de publicação é marcada quando o conteúdo entra na etapa “Publicado”.</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{item ? "Salvar" : "Criar conteúdo"}</Button>
      </DialogFooter>
    </form>
  );
}

const METRIC_FIELDS = [
  { key: "reach", label: "Alcance" },
  { key: "views", label: "Visualizações" },
  { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" },
  { key: "shares", label: "Compartilhamentos" },
  { key: "saves", label: "Salvamentos" },
  { key: "followsGained", label: "Novos seguidores" },
] as const;
type MetricKey = (typeof METRIC_FIELDS)[number]["key"];

function Metrics({ item, today, onChange }: { item: Detail; today: string; onChange: () => void }) {
  const [date, setDate] = React.useState(today);
  const [values, setValues] = React.useState<Record<MetricKey, string>>(() => Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, ""])) as Record<MetricKey, string>);
  const [saving, setSaving] = React.useState(false);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Registre os números do post (manualmente, até a integração com a Meta). Os números do Instagram são acumulados: o relatório usa a leitura mais recente.
      </p>
      <form
        className="grid gap-3 rounded-lg border border-border p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const input = Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, values[f.key] === "" ? null : Math.max(0, Math.round(Number(values[f.key].replace(/\./g, ""))))]));
          const r = await saveContentMetricAction(item.id, { date, ...input });
          setSaving(false);
          if (!r.ok) return toast.error(r.error);
          toast.success(r.message);
          setValues(Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, ""])) as Record<MetricKey, string>);
          onChange();
        }}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Data da leitura" htmlFor="mt-date"><Input id="mt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          {METRIC_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`mt-${f.key}`}>
              <Input id={`mt-${f.key}`} inputMode="numeric" value={values[f.key]} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))} />
            </Field>
          ))}
        </div>
        <div className="flex justify-end"><Button type="submit" size="sm" disabled={saving}>Salvar métricas</Button></div>
      </form>
      {item.metrics.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="metrics-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Data</th>
                {METRIC_FIELDS.map((f) => <th key={f.key} className="py-1.5 pr-3 text-right font-medium">{f.label}</th>)}
                <th className="py-1.5 pr-3 text-right font-medium">Engaj.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {item.metrics.map((m) => {
                const eng = engagementRate(m);
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-1.5 pr-3 tabular">{br(new Date(m.date).toISOString().slice(0, 10))} {m.source !== "MANUAL" && <Badge variant="outline">API</Badge>}</td>
                    {METRIC_FIELDS.map((f) => <td key={f.key} className="py-1.5 pr-3 text-right tabular">{m[f.key]?.toLocaleString("pt-BR") ?? "—"}</td>)}
                    <td className="py-1.5 pr-3 text-right tabular" title={`${interactions(m).toLocaleString("pt-BR")} interações`}>{eng !== null ? `${eng.toLocaleString("pt-BR")}%` : "—"}</td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-danger"
                        aria-label="Excluir leitura"
                        onClick={async () => {
                          const r = await deleteContentMetricAction(m.id);
                          if (!r.ok) return toast.error(r.error);
                          onChange();
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted-foreground">Engajamento = (curtidas + comentários + compartilhamentos + salvamentos) ÷ alcance (ou visualizações, se não houver alcance).</p>
        </div>
      )}
    </div>
  );
}

export function StatusesDialog({ workspaceId, statuses, onClose }: { workspaceId: string; statuses: ContentStatusOption[]; onClose: () => void }) {
  const router = useRouter();
  const prompt = usePrompt();
  const [order, setOrder] = React.useState(statuses);
  const [name, setName] = React.useState("");
  const [removing, setRemoving] = React.useState<ContentStatusOption | null>(null);
  const [moveTo, setMoveTo] = React.useState("");
  React.useEffect(() => setOrder(statuses), [statuses]);
  const special = (s: ContentStatusOption) => s.isPublished || s.isScheduled || s.isRecordingScheduled;

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
    const r = await reorderContentStatusesAction(workspaceId, next.map((s) => s.id));
    if (!r.ok) {
      toast.error(r.error);
      setOrder(statuses);
    }
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Etapas de produção</DialogTitle>
          <DialogDescription>“Gravação agendada”, “Agendado” e “Publicado” alimentam os indicadores e não podem ser excluídas.</DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-80 gap-1 overflow-y-auto">
          {order.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
              <span className="flex-1">{s.name}</span>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`Subir ${s.name}`} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></button>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`Descer ${s.name}`} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></button>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                onClick={async () => {
                  const n = await prompt({ title: "Renomear etapa", label: "Nome", defaultValue: s.name, confirmLabel: "Salvar" });
                  if (!n) return;
                  const r = await renameContentStatusAction(s.id, n);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                Renomear
              </button>
              {!special(s) && (
                <button type="button" className="rounded p-1 text-muted-foreground hover:text-danger" aria-label={`Excluir ${s.name}`} onClick={() => { setRemoving(s); setMoveTo(order.find((o) => o.id !== s.id)?.id ?? ""); }}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {removing && (
          <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
            <p>Excluir “{removing.name}”. Mover os conteúdos para:</p>
            <div className="flex gap-2">
              <Select aria-label="Mover conteúdos para" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-8">
                {order.filter((o) => o.id !== removing.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Button size="sm" variant="danger" onClick={async () => {
                const r = await deleteContentStatusAction(removing.id, moveTo);
                if (!r.ok) return toast.error(r.error);
                setRemoving(null);
                router.refresh();
              }}>Excluir</Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancelar</Button>
            </div>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await createContentStatusAction(workspaceId, name);
            if (!r.ok) return toast.error(r.error);
            setName("");
            router.refresh();
          }}
        >
          <Input aria-label="Nova etapa" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova etapa" maxLength={60} />
          <Button type="submit" variant="outline" disabled={!name.trim()}><Plus /> Criar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
