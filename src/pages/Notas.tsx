import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { useNotes } from "@/lib/queries";
import { useCreateNote, useSaveNote } from "@/lib/mutations";
import { PageHeader, EmptyState } from "@/components/common/page-parts";

export default function Notas() {
  const { activeId } = useWorkspace();
  const { data: notes = [] } = useNotes();
  const saveNote = useSaveNote();
  const createNote = useCreateNote();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const selected = notes.find((note) => note.id === selectedId) ?? notes[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setTitle(selected.title);
    setBody(selected.plain_text ?? "");
  }, [selected?.id]);

  const save = () => {
    if (!selected) return;
    saveNote.mutate({
      id: selected.id,
      values: {
        title: title.trim() || "Sem título",
        plain_text: body,
        updated_at: new Date().toISOString(),
      },
    });
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Notas"
        title="Onde as ideias ficam"
        description="Um caderno simples, preso às suas áreas de trabalho."
        actions={
          <Button
            onClick={() =>
              createNote.mutate(
                {
                  workspace_id: activeId,
                  title: "Sem título",
                  plain_text: "",
                  content: { type: "doc", content: [{ type: "paragraph" }] },
                  favorite: false,
                  links: [],
                },
                { onSuccess: () => setSelectedId(null) },
              )
            }
          >
            <Plus className="size-4" /> Nova nota
          </Button>
        }
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="Nenhuma nota ainda"
          description="Crie a primeira e escreva livremente — o texto é salvo na sua conta."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setSelectedId(note.id)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left transition",
                  selected?.id === note.id
                    ? "border-primary/40 bg-accent/50"
                    : "border-border/60 hover:border-primary/30",
                )}
              >
                <p className="truncate text-sm text-foreground">{note.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                  {note.plain_text || "vazia"}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {format(parseISO(note.updated_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              </button>
            ))}
          </div>

          <Card className="border-border/70 shadow-card">
            <CardContent className="space-y-3 p-5">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="border-0 bg-transparent px-0 font-display text-2xl focus-visible:ring-0"
                placeholder="Título da nota"
              />
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={16}
                className="resize-none border-0 bg-transparent px-0 text-sm leading-relaxed focus-visible:ring-0"
                placeholder="Escreva aqui…"
              />
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <p className="text-[11px] text-muted-foreground">
                  {selected
                    ? `última edição em ${format(parseISO(selected.updated_at), "dd/MM/yyyy 'às' HH:mm")}`
                    : ""}
                </p>
                <Button size="sm" onClick={save} disabled={saveNote.isPending}>
                  <Save className="size-3.5" /> Salvar nota
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
