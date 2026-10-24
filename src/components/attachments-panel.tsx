"use client";

import * as React from "react";
import { Link2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { addLinkAttachmentAction, deleteAttachmentAction, listAttachmentsAction } from "@/app/(app)/attachment-actions";

export type AttachmentItem = { id: string; name: string; mimeType: string | null; sizeBytes: number | null; url: string | null };

/** Arquivos (até 5 MB) e links anexados a qualquer item. */
export function AttachmentsPanel({
  entityType,
  entityId,
  initial,
  title = "Arquivos e links",
  readOnly = false,
}: {
  entityType: "task" | "note" | "event" | "mentee" | "content";
  entityId: string;
  initial?: AttachmentItem[];
  title?: string;
  readOnly?: boolean;
}) {
  const [items, setItems] = React.useState<AttachmentItem[]>(initial ?? []);
  const [loaded, setLoaded] = React.useState(Boolean(initial));
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [link, setLink] = React.useState({ name: "", url: "" });

  const reload = React.useCallback(async () => {
    const r = await listAttachmentsAction(entityType, entityId);
    if (r.ok) setItems(r.data);
    setLoaded(true);
  }, [entityType, entityId]);

  React.useEffect(() => {
    if (!initial) void reload();
  }, [initial, reload]);

  const upload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.set("entityType", entityType);
    fd.set("entityId", entityId);
    fd.set("file", file);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) return toast.error(body.error ?? "Falha no envio.");
    toast.success("Arquivo anexado.");
    await reload();
  };

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {!readOnly && (
          <div className="flex gap-1">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Escolher arquivo" />
            <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload /> {uploading ? "Enviando…" : "Arquivo"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen((o) => !o)}>
              <Link2 /> Link
            </Button>
          </div>
        )}
      </div>
      {linkOpen && (
        <div className="flex gap-2">
          <Input value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} placeholder="Nome" className="h-8 w-32" aria-label="Nome do link" />
          <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" className="h-8" aria-label="Endereço do link" />
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              const r = await addLinkAttachmentAction(entityType, entityId, link.name, link.url);
              if (!r.ok) return toast.error(r.error);
              setLink({ name: "", url: "" });
              setLinkOpen(false);
              await reload();
            }}
          >
            Salvar
          </Button>
        </div>
      )}
      {loaded && items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo. Arquivos de até 5 MB (imagens, PDF, documentos e planilhas).</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {items.map((a) => (
            <li key={a.id} className="group flex items-center gap-2">
              {a.url ? <Link2 className="size-4 text-muted-foreground" /> : <Paperclip className="size-4 text-muted-foreground" />}
              <a href={a.url ?? `/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">
                {a.name}
              </a>
              {a.sizeBytes ? <span className="text-xs text-muted-foreground">{Math.ceil(a.sizeBytes / 1024)} KB</span> : null}
              {!readOnly && (
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Remover ${a.name}`}
                  onClick={async () => {
                    const r = await deleteAttachmentAction(a.id);
                    if (!r.ok) return toast.error(r.error);
                    await reload();
                  }}
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
