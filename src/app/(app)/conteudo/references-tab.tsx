"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Lightbulb, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { CONTENT_FORMATS, formatLabel } from "@/lib/content";
import type { listReferences } from "@/server/content";
import { contentFromReferenceAction, createReferenceAction, deleteReferenceAction, updateReferenceAction } from "./actions";
import type { ContentWs, Href, ProfileRow } from "./shared";

type Reference = Awaited<ReturnType<typeof listReferences>>[number];

export function ReferencesTab({ references, workspaces, profiles, defaultWorkspaceId, href }: { references: Reference[]; workspaces: ContentWs[]; profiles: ProfileRow[]; defaultWorkspaceId: string; href: Href }) {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();
  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const [editing, setEditing] = React.useState<Reference | "new" | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) router.replace(href({ q: search || null }), { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = [...new Set(references.flatMap((r) => r.tags))].sort();
  const activeTag = params.get("tag");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar referência" aria-label="Buscar referência" className="w-56 pl-8" />
        </div>
        <Select aria-label="Formato" value={params.get("formato") ?? ""} onChange={(e) => router.replace(href({ formato: e.target.value || null }))} className="w-40">
          <option value="">Todos os formatos</option>
          {CONTENT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <Button className="ml-auto" onClick={() => setEditing("new")}><Plus /> Nova referência</Button>
      </div>
      {(tags.length > 0 || activeTag) && (
        <div className="flex flex-wrap gap-1.5">
          {activeTag && <button type="button" onClick={() => router.replace(href({ tag: null }))}><Badge variant="brand">#{activeTag} ✕</Badge></button>}
          {tags.filter((t) => t !== activeTag).map((t) => (
            <button key={t} type="button" onClick={() => router.replace(href({ tag: t }))}><Badge variant="outline">#{t}</Badge></button>
          ))}
        </div>
      )}
      {references.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Nenhuma referência" description="Guarde posts que inspiram: link, criador, gancho e como adaptar para você." action={<Button onClick={() => setEditing("new")}><Plus /> Nova referência</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="references">
          {references.map((r) => (
            <Card key={r.id} className="grid content-start gap-2 p-4" data-reference={r.theme ?? r.url}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{r.theme || "Sem tema"}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.creator ? `@${r.creator}` : new URL(r.url).hostname}{r.format ? ` · ${formatLabel(r.format)}` : ""}</p>
                </div>
                <a href={r.url} target="_blank" rel="noreferrer" aria-label="Abrir referência" className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-4" /></a>
              </div>
              {r.hook && <p className="text-sm"><span className="text-muted-foreground">Gancho:</span> {r.hook}</p>}
              {r.adaptationIdeas && <p className="text-sm"><span className="text-muted-foreground">Como adaptar:</span> {r.adaptationIdeas}</p>}
              {r.tags.length > 0 && <div className="flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t} variant="outline">#{t}</Badge>)}</div>}
              <div className="mt-1 flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const res = await contentFromReferenceAction(r.id);
                    if (!res.ok) return toast.error(res.error);
                    toast.success(res.message);
                    router.push(`/conteudo?c=${res.data}`);
                  }}
                >
                  <Sparkles /> Virar conteúdo
                </Button>
                <Button size="sm" variant="ghost" aria-label="Editar referência" onClick={() => setEditing(r)}><Pencil /></Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Excluir referência"
                  onClick={async () => {
                    if (!(await confirm({ title: "Excluir referência?", danger: true, confirmLabel: "Excluir" }))) return;
                    const res = await deleteReferenceAction(r.id);
                    if (!res.ok) return toast.error(res.error);
                    router.refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <ReferenceDialog edit={editing === "new" ? null : editing} workspaces={workspaces} profiles={profiles} defaultWorkspaceId={defaultWorkspaceId} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ReferenceDialog({ edit, workspaces, profiles, defaultWorkspaceId, onClose }: { edit: Reference | null; workspaces: ContentWs[]; profiles: ProfileRow[]; defaultWorkspaceId: string; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState({
    workspaceId: edit?.workspaceId ?? defaultWorkspaceId,
    url: edit?.url ?? "",
    creator: edit?.creator ?? "",
    theme: edit?.theme ?? "",
    format: edit?.format ?? "",
    profileId: edit?.profileId ?? "",
    hook: edit?.hook ?? "",
    notes: edit?.notes ?? "",
    adaptationIdeas: edit?.adaptationIdeas ?? "",
    tags: edit?.tags.join(", ") ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar referência" : "Nova referência"}</DialogTitle>
          <DialogDescription>Um post que inspira e como adaptá-lo.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const input = {
              url: v.url,
              creator: v.creator || null,
              theme: v.theme || null,
              format: v.format || null,
              profileId: v.profileId || null,
              hook: v.hook || null,
              notes: v.notes || null,
              adaptationIdeas: v.adaptationIdeas || null,
              tags: v.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
            };
            const r = edit ? await updateReferenceAction(edit.id, input) : await createReferenceAction({ ...input, workspaceId: v.workspaceId });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onClose();
            router.refresh();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link" htmlFor="rf-url" className="sm:col-span-2"><Input id="rf-url" type="url" value={v.url} onChange={(e) => set("url", e.target.value)} required autoFocus placeholder="https://instagram.com/reel/…" /></Field>
            <Field label="Tema" htmlFor="rf-theme"><Input id="rf-theme" value={v.theme} onChange={(e) => set("theme", e.target.value)} maxLength={200} /></Field>
            <Field label="Criador (@)" htmlFor="rf-creator"><Input id="rf-creator" value={v.creator} onChange={(e) => set("creator", e.target.value)} maxLength={100} /></Field>
            <Field label="Formato" htmlFor="rf-format">
              <Select id="rf-format" value={v.format} onChange={(e) => set("format", e.target.value)}>
                <option value="">Não definido</option>
                {CONTENT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
            </Field>
            {!edit && workspaces.length > 1 && (
              <Field label="Ambiente" htmlFor="rf-ws">
                <Select id="rf-ws" value={v.workspaceId} onChange={(e) => setV((p) => ({ ...p, workspaceId: e.target.value, profileId: "" }))}>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Para qual perfil" htmlFor="rf-profile">
              <Select id="rf-profile" value={v.profileId} onChange={(e) => set("profileId", e.target.value)}>
                <option value="">Qualquer</option>
                {profiles.filter((p) => p.workspaceId === v.workspaceId).map((p) => <option key={p.id} value={p.id}>@{p.username}</option>)}
              </Select>
            </Field>
            <Field label="Gancho" htmlFor="rf-hook" className="sm:col-span-2"><Textarea id="rf-hook" value={v.hook} onChange={(e) => set("hook", e.target.value)} rows={2} /></Field>
            <Field label="Ideias de adaptação" htmlFor="rf-adapt" className="sm:col-span-2"><Textarea id="rf-adapt" value={v.adaptationIdeas} onChange={(e) => set("adaptationIdeas", e.target.value)} rows={2} /></Field>
            <Field label="Observações" htmlFor="rf-notes" className="sm:col-span-2"><Textarea id="rf-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
            <Field label="Etiquetas" htmlFor="rf-tags" className="sm:col-span-2" hint="Separadas por vírgula."><Input id="rf-tags" value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="rotina, vendas" /></Field>
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
