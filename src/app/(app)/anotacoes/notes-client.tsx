"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, FileText, Folder, FolderPlus, Inbox, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { EmptyState, WsDot } from "@/components/ui/misc";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { createFolderAction, createNoteAction, deleteFolderAction, listNotesAction, renameFolderAction } from "./actions";

const NoteEditor = dynamic(() => import("./note-editor").then((m) => m.NoteEditor), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-muted" />,
});

type Ws = { id: string; name: string; color: string };
type FolderT = { id: string; workspaceId: string; parentId: string | null; name: string };
type NoteRow = { id: string; title: string; favorite: boolean; updatedAt: Date | string; folderId: string | null; excerpt: string; workspace: Ws };
type Scope = { kind: "all" } | { kind: "fav" } | { kind: "trash" } | { kind: "ws"; workspaceId: string; folderId?: string };

export function NotesClient({
  workspaces,
  folders,
  initialWorkspace,
  initialNoteId,
  openNew,
  tz,
}: {
  workspaces: Ws[];
  folders: FolderT[];
  initialWorkspace: string;
  initialNoteId: string | null;
  openNew: boolean;
  tz: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [scope, setScope] = React.useState<Scope>(initialWorkspace !== "all" ? { kind: "ws", workspaceId: initialWorkspace } : { kind: "all" });
  const [search, setSearch] = React.useState("");
  const [notes, setNotes] = React.useState<NoteRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(initialNoteId);

  const load = React.useCallback(async () => {
    setLoading(true);
    const r = await listNotesAction({
      workspaceId: scope.kind === "ws" ? scope.workspaceId : "all",
      folderId: scope.kind === "ws" && scope.folderId ? scope.folderId : undefined,
      favorites: scope.kind === "fav",
      includeDeleted: scope.kind === "trash",
      search,
    });
    setLoading(false);
    if (r.ok) setNotes(r.data as NoteRow[]);
    else toast.error(r.error);
  }, [scope, search]);

  React.useEffect(() => {
    const t = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const select = (id: string | null) => {
    setSelected(id);
    const next = new URLSearchParams(params.toString());
    if (id) next.set("n", id);
    else next.delete("n");
    next.delete("nova");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const createNote = React.useCallback(async () => {
    const workspaceId = scope.kind === "ws" ? scope.workspaceId : workspaces[0]?.id;
    if (!workspaceId) return;
    const r = await createNoteAction({ workspaceId, folderId: scope.kind === "ws" ? scope.folderId ?? null : null });
    if (!r.ok) return toast.error(r.error);
    await load();
    select(r.data.id);
  }, [scope, workspaces, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const createdFromUrl = React.useRef(false);
  React.useEffect(() => {
    if (!openNew) createdFromUrl.current = false;
    else if (!createdFromUrl.current) {
      createdFromUrl.current = true;
      void createNote();
    }
  }, [openNew, createNote]);
  React.useEffect(() => {
    if (initialNoteId) setSelected(initialNoteId);
  }, [initialNoteId]);

  const onChanged = React.useCallback((patch: { id: string; title?: string; favorite?: boolean; folderId?: string | null; updatedAt?: string }) => {
    setNotes((list) => {
      const updated = list.map((n) => (n.id === patch.id ? { ...n, ...patch, title: patch.title ?? n.title } : n));
      return updated.sort((a, b) => Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
  }, []);

  const scopeTitle =
    scope.kind === "all" ? "Todas as anotações" : scope.kind === "fav" ? "Favoritas" : scope.kind === "trash" ? "Lixeira"
      : scope.folderId ? folders.find((f) => f.id === scope.folderId)?.name ?? "Caderno" : workspaces.find((w) => w.id === scope.workspaceId)?.name ?? "";

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Anotações</h1>
      <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[230px_300px_1fr]">
        {/* Cadernos */}
        <nav className="grid content-start gap-1 text-sm" aria-label="Cadernos">
          <ScopeButton active={scope.kind === "all"} onClick={() => setScope({ kind: "all" })} icon={Inbox}>Todas</ScopeButton>
          <ScopeButton active={scope.kind === "fav"} onClick={() => setScope({ kind: "fav" })} icon={Star}>Favoritas</ScopeButton>
          <ScopeButton active={scope.kind === "trash"} onClick={() => setScope({ kind: "trash" })} icon={Trash2}>Lixeira</ScopeButton>
          <p className="mt-3 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cadernos</p>
          {workspaces.map((w) => (
            <WorkspaceTree
              key={w.id}
              workspace={w}
              folders={folders.filter((f) => f.workspaceId === w.id)}
              scope={scope}
              onSelect={setScope}
              onCreate={async (parentId) => {
                const name = await prompt({ title: parentId ? "Novo subcaderno" : "Novo caderno", label: "Nome", confirmLabel: "Criar" });
                if (!name?.trim()) return;
                const r = await createFolderAction({ workspaceId: w.id, name, parentId });
                if (!r.ok) return toast.error(r.error);
                toast.success(r.message);
                router.refresh();
              }}
              onRename={async (f) => {
                const name = await prompt({ title: "Renomear caderno", label: "Nome", defaultValue: f.name });
                if (!name?.trim() || name === f.name) return;
                const r = await renameFolderAction(f.id, name);
                if (!r.ok) return toast.error(r.error);
                router.refresh();
              }}
              onDelete={async (f) => {
                if (!(await confirm({ title: `Excluir “${f.name}”?`, description: "As anotações não são apagadas: voltam para o caderno principal do ambiente.", confirmLabel: "Excluir", danger: true }))) return;
                const r = await deleteFolderAction(f.id);
                if (!r.ok) return toast.error(r.error);
                toast.success(r.message);
                if (scope.kind === "ws" && scope.folderId === f.id) setScope({ kind: "ws", workspaceId: w.id });
                router.refresh();
                void load();
              }}
            />
          ))}
        </nav>

        {/* Lista */}
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-border bg-card p-3" aria-label="Lista de anotações">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-sm font-semibold">{scopeTitle}</h2>
            {scope.kind !== "trash" && (
              <Button size="sm" onClick={createNote}>
                <Plus /> Nova
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no conteúdo…" className="h-8 pl-8" aria-label="Buscar anotações" />
          </div>
          <ul className="-mx-1 flex-1 overflow-y-auto">
            {loading && notes.length === 0 ? (
              <li className="m-1 h-16 animate-pulse rounded-lg bg-muted" />
            ) : notes.length === 0 ? (
              <li className="px-2 py-8 text-center text-sm text-muted-foreground">{search ? "Nada encontrado." : "Nenhuma anotação aqui."}</li>
            ) : (
              notes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => select(n.id)}
                    aria-current={selected === n.id ? "true" : undefined}
                    className={cn("m-1 grid w-[calc(100%-0.5rem)] gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-accent", selected === n.id && "bg-accent")}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {n.favorite && <Star className="size-3.5 shrink-0 fill-warning text-warning" />}
                      <span className="truncate">{n.title}</span>
                    </span>
                    {n.excerpt && <span className="line-clamp-2 text-xs text-muted-foreground">{n.excerpt}</span>}
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <WsDot color={n.workspace.color} className="size-2" />
                      {new Date(n.updatedAt).toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "short" })}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Editor */}
        <section aria-label="Editor" className="min-w-0">
          {selected ? (
            <NoteEditor
              key={selected}
              noteId={selected}
              folders={folders}
              tz={tz}
              onChanged={onChanged}
              onDeleted={() => {
                select(null);
                void load();
              }}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Selecione ou crie uma anotação"
              description="As anotações salvam sozinhas enquanto você escreve."
              action={<Button onClick={createNote}><Plus /> Nova anotação</Button>}
              className="h-full"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ScopeButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent", active && "bg-accent font-medium")}>
      <Icon className="size-4 text-muted-foreground" /> {children}
    </button>
  );
}

function WorkspaceTree({
  workspace, folders, scope, onSelect, onCreate, onRename, onDelete,
}: {
  workspace: Ws;
  folders: FolderT[];
  scope: Scope;
  onSelect: (s: Scope) => void;
  onCreate: (parentId: string | null) => void;
  onRename: (f: FolderT) => void;
  onDelete: (f: FolderT) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const children = (parentId: string | null): FolderT[] => folders.filter((f) => f.parentId === parentId);
  const activeWs = scope.kind === "ws" && scope.workspaceId === workspace.id && !scope.folderId;

  const renderFolder = (f: FolderT, depth: number): React.ReactNode => {
    const active = scope.kind === "ws" && scope.folderId === f.id;
    return (
      <li key={f.id}>
        <div className={cn("group flex items-center gap-1 rounded-md pr-1 hover:bg-accent", active && "bg-accent font-medium")} style={{ paddingLeft: 8 + depth * 14 }}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={() => onSelect({ kind: "ws", workspaceId: workspace.id, folderId: f.id })}>
            <Folder className="size-4 shrink-0 text-muted-foreground" /> <span className="truncate">{f.name}</span>
          </button>
          <span className="hidden gap-0.5 group-hover:flex group-focus-within:flex">
            <IconBtn label={`Novo subcaderno em ${f.name}`} onClick={() => onCreate(f.id)}><FolderPlus /></IconBtn>
            <IconBtn label={`Renomear ${f.name}`} onClick={() => onRename(f)}><Pencil /></IconBtn>
            <IconBtn label={`Excluir ${f.name}`} onClick={() => onDelete(f)}><Trash2 /></IconBtn>
          </span>
        </div>
        {children(f.id).length > 0 && <ul>{children(f.id).map((c) => renderFolder(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div>
      <div className={cn("group flex items-center gap-1 rounded-md pr-1 hover:bg-accent", activeWs && "bg-accent font-medium")}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Recolher" : "Expandir"} className="p-1 text-muted-foreground">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={() => onSelect({ kind: "ws", workspaceId: workspace.id })}>
          <WsDot color={workspace.color} /> <span className="truncate">{workspace.name}</span>
        </button>
        <span className="hidden group-hover:flex group-focus-within:flex">
          <IconBtn label={`Novo caderno em ${workspace.name}`} onClick={() => onCreate(null)}><FolderPlus /></IconBtn>
        </span>
      </div>
      {open && children(null).length > 0 && <ul>{children(null).map((f) => renderFolder(f, 1))}</ul>}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-card hover:text-foreground [&_svg]:size-3.5">
      {children}
    </button>
  );
}
