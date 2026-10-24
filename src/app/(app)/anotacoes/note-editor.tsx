"use client";

import * as React from "react";
import Link from "next/link";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Quote, Redo2,
  Star, Strikethrough, Table2, Trash2, Undo2, X, Rows3, Columns3,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { deleteNoteAction, getNoteAction, linkNoteAction, restoreNoteAction, saveNoteAction, searchLinkTargetsAction, unlinkNoteAction } from "./actions";

type NoteData = {
  id: string;
  title: string;
  content: unknown;
  favorite: boolean;
  folderId: string | null;
  workspaceId: string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
  links: { id: string; entityType: string; entityId: string; label: string }[];
};

type Folder = { id: string; workspaceId: string; parentId: string | null; name: string };
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const LINK_TYPE_LABEL: Record<string, string> = { task: "Tarefa", event: "Compromisso", project: "Projeto", mentee: "Mentorado", lead: "Lead", content: "Conteúdo" };
const LINK_HREF: Record<string, (id: string) => string> = {
  task: (id) => `/tarefas?view=lista&t=${id}`,
  event: (id) => `/agenda?v=timeline&e=${id}`,
};

export function NoteEditor({
  noteId,
  folders,
  tz,
  onChanged,
  onDeleted,
}: {
  noteId: string;
  folders: Folder[];
  tz: string;
  onChanged: (patch: { id: string; title?: string; favorite?: boolean; folderId?: string | null; updatedAt?: string }) => void;
  onDeleted: () => void;
}) {
  const [note, setNote] = React.useState<NoteData | null>(null);
  const [title, setTitle] = React.useState("");
  const [state, setState] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const pending = React.useRef<{ title?: string; content?: unknown; folderId?: string | null; favorite?: boolean }>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const version = React.useRef<string | undefined>(undefined);
  const blocked = React.useRef(false);

  const flush = React.useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length || blocked.current) return;
    pending.current = {};
    setState("saving");
    const r = await saveNoteAction(noteId, { ...patch, expectedUpdatedAt: version.current });
    if (!r.ok) {
      setState("error");
      if (/outra janela/.test(r.error)) blocked.current = true;
      else pending.current = { ...patch, ...pending.current };
      toast.error(r.error);
      return;
    }
    version.current = new Date(r.data.updatedAt).toISOString();
    setSavedAt(new Date(r.data.updatedAt));
    setState(Object.keys(pending.current).length ? "pending" : "saved");
    onChanged({ id: noteId, title: r.data.title, favorite: r.data.favorite, folderId: r.data.folderId, updatedAt: version.current });
  }, [noteId, onChanged]);

  const queue = React.useCallback(
    (patch: typeof pending.current, delay = 800) => {
      pending.current = { ...pending.current, ...patch };
      setState("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        TiptapLink.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Image.configure({ inline: false }),
        Placeholder.configure({ placeholder: "Comece a escrever…" }),
      ],
      editorProps: { attributes: { class: "gabi-editor min-h-[50vh] focus:outline-none", "aria-label": "Conteúdo da anotação" } },
      onUpdate: ({ editor }) => queue({ content: editor.getJSON() }),
    },
    [noteId],
  );

  // Carrega a anotação
  React.useEffect(() => {
    let cancelled = false;
    blocked.current = false;
    setNote(null);
    getNoteAction(noteId).then((r) => {
      if (cancelled) return;
      if (!r.ok) return toast.error(r.error);
      setNote(r.data as NoteData);
      setTitle(r.data.title);
      version.current = new Date(r.data.updatedAt).toISOString();
      setSavedAt(new Date(r.data.updatedAt));
      setState("idle");
    });
    return () => {
      cancelled = true;
      void flush();
    };
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // O conteúdo carregado entra no editor uma única vez por instância (não sobrescreve a digitação)
  const contentLoadedInto = React.useRef<Editor | null>(null);
  React.useEffect(() => {
    if (!editor || !note || editor.isDestroyed || contentLoadedInto.current === editor) return;
    editor.commands.setContent((note.content as object) ?? { type: "doc", content: [] }, false);
    contentLoadedInto.current = editor;
  }, [editor, note]);
  const isDeleted = Boolean(note?.deletedAt);
  React.useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!isDeleted);
  }, [editor, isDeleted]);

  // Avisa antes de fechar com alterações não salvas
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flush]);

  if (!note) return <div className="h-full min-h-96 animate-pulse rounded-xl bg-muted" />;
  const wsFolders = folders.filter((f) => f.workspaceId === note.workspaceId);
  const readOnly = Boolean(note.deletedAt);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SaveIndicator state={state} savedAt={savedAt} tz={tz} />
        <div className="ml-auto flex items-center gap-1">
          {!readOnly && (
            <>
              <Select
                value={note.folderId ?? ""}
                onChange={(e) => {
                  const folderId = e.target.value || null;
                  setNote({ ...note, folderId });
                  queue({ folderId }, 0);
                }}
                className="h-8 w-44 text-xs"
                aria-label="Caderno"
              >
                <option value="">Sem subcaderno</option>
                {wsFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
              <Button
                variant="ghost"
                size="icon"
                aria-pressed={note.favorite}
                aria-label={note.favorite ? "Remover dos favoritos" : "Favoritar"}
                onClick={() => {
                  setNote({ ...note, favorite: !note.favorite });
                  queue({ favorite: !note.favorite }, 0);
                }}
              >
                <Star className={cn(note.favorite && "fill-warning text-warning")} />
              </Button>
            </>
          )}
          <DeleteButton note={note} onDeleted={onDeleted} onRestored={() => setNote({ ...note, deletedAt: null })} />
        </div>
      </div>

      <input
        value={title}
        readOnly={readOnly}
        onChange={(e) => {
          setTitle(e.target.value);
          queue({ title: e.target.value });
        }}
        placeholder="Sem título"
        aria-label="Título da anotação"
        maxLength={200}
        className="bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
      />

      {!readOnly && editor && <Toolbar editor={editor} noteId={note.id} />}
      {readOnly && <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Esta anotação está na lixeira. Restaure para editar.</p>}

      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <EditorContent editor={editor} />
      </div>

      <LinksPanel note={note} readOnly={readOnly} onChange={(links) => setNote({ ...note, links })} />
      <div className="rounded-xl border border-border bg-card p-4">
        <AttachmentsPanel entityType="note" entityId={note.id} readOnly={readOnly} title="Arquivos anexados" />
      </div>
    </div>
  );
}

function SaveIndicator({ state, savedAt, tz }: { state: SaveState; savedAt: Date | null; tz: string }) {
  const time = savedAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(savedAt) : "";
  const text =
    state === "saving" ? "Salvando…" : state === "pending" ? "Alterações não salvas…" : state === "error" ? "Erro ao salvar" : savedAt ? `Salvo às ${time}` : "";
  return (
    <span role="status" aria-live="polite" className={cn("text-xs", state === "error" ? "text-danger" : "text-muted-foreground")} data-save-state={state}>
      {text}
    </span>
  );
}

function DeleteButton({ note, onDeleted, onRestored }: { note: NoteData; onDeleted: () => void; onRestored: () => void }) {
  const confirm = useConfirm();
  if (note.deletedAt) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          const r = await restoreNoteAction(note.id);
          if (!r.ok) return toast.error(r.error);
          toast.success(r.message);
          onRestored();
        }}
      >
        Restaurar
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Excluir anotação"
      className="text-danger hover:text-danger"
      onClick={async () => {
        if (!(await confirm({ title: "Mover para a lixeira?", description: "Você pode restaurar depois em Lixeira.", confirmLabel: "Excluir", danger: true }))) return;
        const r = await deleteNoteAction(note.id);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        onDeleted();
      }}
    >
      <Trash2 />
    </Button>
  );
}

function Toolbar({ editor, noteId }: { editor: Editor; noteId: string }) {
  const prompt = usePrompt();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    editor.on("transaction", force);
    return () => {
      editor.off("transaction", force);
    };
  }, [editor]);

  const btn = (label: string, icon: React.ReactNode, action: () => void, active = false, disabled = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
      className={cn("grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 [&_svg]:size-4", active && "bg-accent text-foreground")}
    >
      {icon}
    </button>
  );

  const uploadImage = async (file: File) => {
    const fd = new FormData();
    fd.set("entityType", "note");
    fd.set("entityId", noteId);
    fd.set("file", file);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error ?? "Falha no envio da imagem.");
    editor.chain().focus().setImage({ src: body.url, alt: file.name }).run();
  };

  const inTable = editor.isActive("table");
  const c = () => editor.chain().focus();

  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 backdrop-blur" role="toolbar" aria-label="Formatação">
      {btn("Título 1", <Heading1 />, () => c().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
      {btn("Título 2", <Heading2 />, () => c().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {btn("Título 3", <Heading3 />, () => c().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {btn("Negrito (Ctrl+B)", <Bold />, () => c().toggleBold().run(), editor.isActive("bold"))}
      {btn("Itálico (Ctrl+I)", <Italic />, () => c().toggleItalic().run(), editor.isActive("italic"))}
      {btn("Tachado", <Strikethrough />, () => c().toggleStrike().run(), editor.isActive("strike"))}
      {btn(
        "Link",
        <Link2 />,
        async () => {
          if (editor.isActive("link")) return c().unsetLink().run();
          const url = await prompt({
            title: "Inserir link",
            label: "Endereço",
            placeholder: "https://…",
            confirmLabel: "Inserir",
            validate: (v) => (/^https?:\/\//i.test(v) ? null : "Use um endereço começando com http:// ou https://"),
          });
          if (url) c().extendMarkRange("link").setLink({ href: url }).run();
        },
        editor.isActive("link"),
      )}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {btn("Lista", <List />, () => c().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("Lista numerada", <ListOrdered />, () => c().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("Checklist", <ListChecks />, () => c().toggleTaskList().run(), editor.isActive("taskList"))}
      {btn("Citação", <Quote />, () => c().toggleBlockquote().run(), editor.isActive("blockquote"))}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {btn("Inserir tabela", <Table2 />, () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, inTable)}
      {inTable && btn("Adicionar linha", <Rows3 />, () => c().addRowAfter().run())}
      {inTable && btn("Adicionar coluna", <Columns3 />, () => c().addColumnAfter().run())}
      {inTable && btn("Remover tabela", <X />, () => c().deleteTable().run())}
      {btn("Inserir imagem", <ImagePlus />, () => fileRef.current?.click())}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {btn("Desfazer", <Undo2 />, () => c().undo().run(), false, !editor.can().undo())}
      {btn("Refazer", <Redo2 />, () => c().redo().run(), false, !editor.can().redo())}
    </div>
  );
}

function LinksPanel({ note, readOnly, onChange }: { note: NoteData; readOnly: boolean; onChange: (links: NoteData["links"]) => void }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ type: string; id: string; label: string }[]>([]);

  React.useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const r = await searchLinkTargetsAction(query);
      if (r.ok) setResults(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <section className="grid gap-2 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Vinculada a</h3>
      {note.links.length === 0 && <p className="text-xs text-muted-foreground">Nenhum vínculo. Vincule a uma tarefa, compromisso ou projeto.</p>}
      <ul className="flex flex-wrap gap-2">
        {note.links.map((l) => (
          <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
            <span className="text-muted-foreground">{LINK_TYPE_LABEL[l.entityType] ?? l.entityType}:</span>
            {LINK_HREF[l.entityType] ? <Link href={LINK_HREF[l.entityType]!(l.entityId)} className="hover:underline">{l.label}</Link> : l.label}
            {!readOnly && (
              <button
                type="button"
                aria-label={`Remover vínculo ${l.label}`}
                onClick={async () => {
                  const r = await unlinkNoteAction(l.id);
                  if (!r.ok) return toast.error(r.error);
                  onChange(note.links.filter((x) => x.id !== l.id));
                }}
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="relative">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefa, compromisso ou projeto para vincular…" className="h-8" aria-label="Buscar item para vincular" />
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
              {results.map((res) => (
                <li key={`${res.type}:${res.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={async () => {
                      const r = await linkNoteAction(note.id, res.type, res.id);
                      if (!r.ok) return toast.error(r.error);
                      onChange([...note.links.filter((x) => !(x.entityType === res.type && x.entityId === res.id)), { id: r.data.id, entityType: res.type, entityId: res.id, label: res.label }]);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    <span className="text-xs text-muted-foreground">{LINK_TYPE_LABEL[res.type]}</span> {res.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
