import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Instagram, Play, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import {
  useContentItems,
  useContentReferences,
  useContentStatuses,
  useSocialProfiles,
} from "@/lib/queries";
import { useCreateContentItem, useDeleteContentItem, useMoveCards, useSaveContentItem } from "@/lib/mutations";
import { dropPositions, topPosition } from "@/lib/kanban";
import { CardMenu, ConfirmDelete, DropColumn, draggableCard } from "@/components/common/kanban";
import { toast } from "sonner";
import { PageHeader, StatCard } from "@/components/common/page-parts";
import type { ContentItem } from "@/lib/types";

const FORMAT_LABEL: Record<string, string> = {
  REELS: "Reels",
  STORIES: "Stories",
  CAROUSEL: "Carrossel",
  POST: "Post",
  OTHER: "Roteiro",
};

export default function Conteudo() {
  const { active } = useWorkspace();
  const { data: items = [] } = useContentItems();
  const { data: statuses = [] } = useContentStatuses();
  const { data: profiles = [] } = useSocialProfiles();
  const { data: references = [] } = useContentReferences();
  const saveItem = useSaveContentItem();
  const createItem = useCreateContentItem();
  const deleteItem = useDeleteContentItem();
  const moveCards = useMoveCards("content_items", "content-items");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const emptyNew = { title: "", format: "REELS", profile_id: "", status_id: "", owner: "", hook: "", script: "", cta: "", publish_date: "" };
  const [creating, setCreating] = useState(false);
  const [newItem, setNewItem] = useState(emptyNew);

  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [draft, setDraft] = useState({ status_id: "", hook: "", script: "", cta: "" });

  const workspaceItems = useMemo(
    () => items.filter((item) => item.workspace_id === active?.id),
    [items, active],
  );
  const workspaceStatuses = statuses.filter((status) => status.workspace_id === active?.id);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const openItem = (item: ContentItem) => {
    setSelected(item);
    setDraft({
      status_id: item.status_id ?? "",
      hook: item.hook ?? "",
      script: item.script ?? "",
      cta: item.cta ?? "",
    });
  };

  const submit = () => {
    if (!selected) return;
    saveItem.mutate(
      {
        id: selected.id,
        values: {
          status_id: draft.status_id || null,
          hook: draft.hook || null,
          script: draft.script || null,
          cta: draft.cta || null,
        },
      },
      { onSuccess: () => setSelected(null) },
    );
  };

  const openNew = (statusId?: string) => {
    setNewItem({ ...emptyNew, status_id: statusId ?? workspaceStatuses[0]?.id ?? "" });
    setCreating(true);
  };

  const submitNew = () => {
    if (!newItem.title.trim() || !active?.id) return;
    createItem.mutate(
      {
        workspace_id: active.id,
        title: newItem.title.trim(),
        format: newItem.format,
        platform: "instagram",
        profile_id: newItem.profile_id || null,
        status_id: newItem.status_id || null,
        owner: newItem.owner.trim() || null,
        hook: newItem.hook || null,
        script: newItem.script || null,
        cta: newItem.cta || null,
        publish_date: newItem.publish_date ? new Date(`${newItem.publish_date}:00-03:00`).toISOString() : null,
        position: topPosition(columnOf(newItem.status_id || null)),
      },
      {
        onSuccess: () => {
          toast.success("Conteúdo criado.");
          setCreating(false);
        },
        onError: (error) => toast.error(`Não foi possível criar o conteúdo. ${error instanceof Error ? error.message : ""}`),
      },
    );
  };

  const columnOf = (statusId: string | null) =>
    workspaceItems.filter((item) => item.status_id === statusId).sort((a, b) => b.position - a.position);

  /** Solta o conteúdo na etapa `statusId`, na posição `index` (0 = topo). */
  const moveItem = (itemId: string, statusId: string, index = 0) => {
    const item = workspaceItems.find((entry) => entry.id === itemId);
    if (!item) return;
    const positions = dropPositions(columnOf(statusId), itemId, index, item);
    const updates = positions.map((entry) => ({ id: entry.id, values: { position: entry.position } as Record<string, unknown> }));
    if (statusId !== item.status_id) {
      const moved = updates.find((entry) => entry.id === itemId);
      if (moved) moved.values.status_id = statusId;
    } else if (updates.length === 1 && updates[0].values.position === item.position) {
      return;
    }
    moveCards.mutate(updates, {
      onError: (error) => toast.error(`Não foi possível mover o conteúdo. ${error instanceof Error ? error.message : ""}`),
    });
  };

  const removeItem = (id: string) =>
    deleteItem.mutate(id, {
      onSuccess: () => {
        setSelected(null);
        toast.success("Conteúdo excluído.");
      },
      onError: (error) => toast.error(`Não foi possível excluir. ${error instanceof Error ? error.message : ""}`),
    });

  const published = workspaceItems.filter((item) => item.published_at);
  const scheduled = workspaceItems.filter((item) => !item.published_at && item.publish_date);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Conteúdo"
        title="Do roteiro ao publicado"
        description="Seus conteúdos com gancho, roteiro e CTA. Arraste os cards entre as etapas (ou use o menu ⋯) e exclua o que não serve mais."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-8 gap-1 px-3 text-xs">
              <Instagram className="size-3.5" /> {active?.name ?? "—"}
            </Badge>
            <Button size="sm" onClick={() => openNew()} disabled={!active}>
              <Plus className="size-4" /> Novo conteúdo
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Conteúdos" value={workspaceItems.length} hint="na área atual" icon={<Play className="size-4" />} accent />
        <StatCard label="Publicados" value={published.length} hint="no Instagram" icon={<Send className="size-4" />} />
        <StatCard label="Agendados" value={scheduled.length} hint="com data de publicação" icon={<Plus className="size-4" />} />
      </div>

      <Tabs defaultValue="producao">
        <TabsList>
          <TabsTrigger value="producao">Produção</TabsTrigger>
          <TabsTrigger value="referencias">Referências</TabsTrigger>
        </TabsList>

        <TabsContent value="producao" className="pt-4">
          {workspaceStatuses.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Esta área ainda não tem etapas de produção de conteúdo. Troque para “Trabalho TURBO” no menu para ver o quadro.
            </p>
          ) : null}
          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
            {workspaceStatuses.map((status) => {
              const columnItems = columnOf(status.id);
              return (
                <div key={status.id} className="flex w-[268px] shrink-0 flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {status.name}
                    </p>
                    <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">
                      {columnItems.length}
                    </span>
                  </div>
                  <DropColumn
                    columnId={status.id}
                    onDropCard={moveItem}
                    className="min-h-[100px] space-y-2 rounded-2xl border border-border/50 bg-secondary/25 p-2"
                  >
                    {columnItems.map((item) => (
                      <Card
                        key={item.id}
                        {...draggableCard(item.id)}
                        className="cursor-grab border-border/70 p-3 shadow-sm transition hover:border-primary/40 active:cursor-grabbing"
                        onClick={() => openItem(item)}
                      >
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-sm leading-snug text-foreground">{item.title}</p>
                          <CardMenu
                            title={item.title}
                            columns={workspaceStatuses}
                            currentColumnId={item.status_id}
                            onMove={(statusId) => moveItem(item.id, statusId, 0)}
                            onDelete={() => removeItem(item.id)}
                            deleteDescription="O conteúdo, com gancho, roteiro e CTA, será apagado. Essa ação não pode ser desfeita."
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">
                            {FORMAT_LABEL[item.format ?? "OTHER"] ?? item.format}
                          </Badge>
                          {item.owner ? (
                            <span className="text-[10px] text-muted-foreground">{item.owner}</span>
                          ) : null}
                          {item.publish_date ? (
                            <span className="text-[10px] text-muted-foreground">
                              {format(parseISO(item.publish_date), "dd/MM", { locale: ptBR })}
                            </span>
                          ) : null}
                          {item.profile_id ? (
                            <span className="text-[10px] text-primary">
                              @{profileMap.get(item.profile_id)?.username ?? ""}
                            </span>
                          ) : null}
                        </div>
                      </Card>
                    ))}
                    {columnItems.length === 0 ? (
                      <p className="px-2 py-5 text-center text-[11px] text-muted-foreground">vazio</p>
                    ) : null}
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      onClick={() => openNew(status.id)}
                    >
                      <Plus className="size-3" /> adicionar
                    </button>
                  </DropColumn>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="referencias" className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {references.map((reference) => (
              <Card key={reference.id} className="border-border/70 shadow-card">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg text-foreground">{reference.theme ?? "Referência"}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {reference.format ?? "—"}
                    </Badge>
                  </div>
                  {reference.creator ? <p className="text-xs text-muted-foreground">{reference.creator.startsWith("http") || /\s/.test(reference.creator) ? reference.creator : `@${reference.creator}`}</p> : null}
                  {reference.notes ? (
                    <p className="text-sm text-muted-foreground">{reference.notes}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {(reference.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {reference.url ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={reference.url} target="_blank" rel="noreferrer">
                        Abrir no Instagram <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {references.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma referência salva.</p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selected)} onOpenChange={(isOpen) => !isOpen && setSelected(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{selected?.title}</DialogTitle>
            <DialogDescription>
              {FORMAT_LABEL[selected?.format ?? "OTHER"] ?? selected?.format}
              {selected?.owner ? ` · ${selected.owner}` : ""}
              {selected?.profile_id ? ` · @${profileMap.get(selected.profile_id)?.username}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select
                value={draft.status_id}
                onValueChange={(value) => setDraft({ ...draft, status_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  {workspaceStatuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content-hook">Gancho</Label>
              <Textarea
                id="content-hook"
                rows={2}
                value={draft.hook}
                onChange={(event) => setDraft({ ...draft, hook: event.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content-script">Roteiro</Label>
              <Textarea
                id="content-script"
                rows={10}
                className="text-sm leading-relaxed"
                value={draft.script}
                onChange={(event) => setDraft({ ...draft, script: event.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content-cta">CTA</Label>
              <Textarea
                id="content-cta"
                rows={2}
                value={draft.cta}
                onChange={(event) => setDraft({ ...draft, cta: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
              <div>
                <p className="uppercase tracking-[0.12em]">Gravação</p>
                <p className="text-sm text-foreground">
                  {selected?.recording_date
                    ? format(parseISO(selected.recording_date), "dd/MM 'às' HH:mm", { locale: ptBR })
                    : "—"}
                </p>
              </div>
              <div>
                <p className="uppercase tracking-[0.12em]">Publicação</p>
                <Input
                  type="datetime-local"
                  className="mt-1 h-8 text-xs"
                  defaultValue={
                    selected?.publish_date
                      ? format(parseISO(selected.publish_date), "yyyy-MM-dd'T'HH:mm")
                      : ""
                  }
                  onChange={(event) => {
                    if (!selected) return;
                    saveItem.mutate({
                      id: selected.id,
                      values: {
                        publish_date: event.target.value
                          ? new Date(`${event.target.value}:00-03:00`).toISOString()
                          : null,
                      },
                    });
                  }}
                />
              </div>
            </div>

            {selected?.objective || selected?.audience ? (
              <div className={cn("rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground")}>
                {selected?.objective ? <p>Objetivo: {selected.objective}</p> : null}
                {selected?.audience ? <p>Público: {selected.audience}</p> : null}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Excluir
            </Button>
            <Button type="button" onClick={submit} disabled={saveItem.isPending}>
              Salvar conteúdo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={selected?.title ?? "conteúdo"}
        description="O conteúdo, com gancho, roteiro e CTA, será apagado. Essa ação não pode ser desfeita."
        onConfirm={() => selected && removeItem(selected.id)}
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Novo conteúdo</DialogTitle>
            <DialogDescription>Área: {active?.name ?? "—"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-title">Título</Label>
              <Input
                id="new-title"
                value={newItem.title}
                placeholder="Ex.: 3 erros que travam seu tráfego pago"
                onChange={(event) => setNewItem({ ...newItem, title: event.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Formato</Label>
                <Select value={newItem.format} onValueChange={(value) => setNewItem({ ...newItem, format: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAT_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select value={newItem.status_id} onValueChange={(value) => setNewItem({ ...newItem, status_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
                  <SelectContent>
                    {workspaceStatuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select value={newItem.profile_id} onValueChange={(value) => setNewItem({ ...newItem, profile_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Escolha o perfil" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>@{profile.username ?? profile.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-owner">Quem grava</Label>
                <Input
                  id="new-owner"
                  value={newItem.owner}
                  placeholder="Ex.: Samuel"
                  onChange={(event) => setNewItem({ ...newItem, owner: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-hook">Gancho</Label>
              <Textarea id="new-hook" rows={2} value={newItem.hook} onChange={(event) => setNewItem({ ...newItem, hook: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-script">Roteiro</Label>
              <Textarea id="new-script" rows={6} className="text-sm leading-relaxed" value={newItem.script} onChange={(event) => setNewItem({ ...newItem, script: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-cta">CTA</Label>
              <Textarea id="new-cta" rows={2} value={newItem.cta} onChange={(event) => setNewItem({ ...newItem, cta: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-publish">Publicação (opcional)</Label>
              <Input id="new-publish" type="datetime-local" value={newItem.publish_date} onChange={(event) => setNewItem({ ...newItem, publish_date: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={submitNew} disabled={createItem.isPending || !newItem.title.trim()}>
              Criar conteúdo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
