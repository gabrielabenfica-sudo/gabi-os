import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Instagram, Play, Plus, Send } from "lucide-react";
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
import { useSaveContentItem } from "@/lib/mutations";
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

  const published = workspaceItems.filter((item) => item.published_at);
  const scheduled = workspaceItems.filter((item) => !item.published_at && item.publish_date);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Conteúdo"
        title="Do roteiro ao publicado"
        description="Os 64 conteúdos da TURBO, com gancho, roteiro e CTA — organizados pela etapa de produção."
        actions={
          <Badge variant="outline" className="h-8 gap-1 px-3 text-xs">
            <Instagram className="size-3.5" /> {active?.name ?? "—"}
          </Badge>
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
          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
            {workspaceStatuses.map((status) => {
              const columnItems = workspaceItems.filter((item) => item.status_id === status.id);
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
                  <div className="min-h-[100px] space-y-2 rounded-2xl border border-border/50 bg-secondary/25 p-2">
                    {columnItems.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer border-border/70 p-3 shadow-sm transition hover:border-primary/40"
                        onClick={() => openItem(item)}
                      >
                        <p className="text-sm leading-snug text-foreground">{item.title}</p>
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
                  </div>
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
                  <p className="text-xs text-muted-foreground">@{reference.creator}</p>
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

          <DialogFooter>
            <Button type="button" onClick={submit} disabled={saveItem.isPending}>
              Salvar conteúdo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
