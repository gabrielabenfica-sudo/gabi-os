import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowRightLeft, MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const MIME = "application/x-gabi-card";

/** Props para tornar um card arrastável (arrastar e soltar do navegador, no computador). */
export function draggableCard(id: string, onDragState?: (dragging: boolean) => void) {
  return {
    draggable: true,
    "data-card-id": id,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(MIME, id);
      event.dataTransfer.setData("text/plain", id);
      event.dataTransfer.effectAllowed = "move";
      onDragState?.(true);
    },
    onDragEnd: () => onDragState?.(false),
  };
}

/** Coluna que recebe cards. Calcula em que ponto da lista o card foi solto. */
export function DropColumn({
  columnId,
  onDropCard,
  className,
  children,
}: {
  columnId: string;
  onDropCard: (cardId: string, columnId: string, index: number) => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<number | null>(null);

  const indexAt = (y: number) => {
    const cards = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? []);
    let index = 0;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (y > rect.top + rect.height / 2) index++;
    }
    return index;
  };
  const isCard = (event: DragEvent) => Array.from(event.dataTransfer.types).includes(MIME);

  return (
    <div
      ref={ref}
      data-column-id={columnId}
      className={cn(className, "transition-colors", over !== null && "border-primary/60 bg-primary/5")}
      onDragOver={(event) => {
        if (!isCard(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const index = indexAt(event.clientY);
        if (index !== over) setOver(index);
      }}
      onDragLeave={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node | null)) setOver(null);
      }}
      onDrop={(event) => {
        if (!isCard(event)) return;
        event.preventDefault();
        const id = event.dataTransfer.getData(MIME);
        const index = indexAt(event.clientY);
        setOver(null);
        if (id) onDropCard(id, columnId, index);
      }}
    >
      {children}
    </div>
  );
}

/**
 * Menu "⋯" do card: mover para outra coluna (funciona também no celular, onde não dá para
 * arrastar) e excluir com confirmação.
 */
export function CardMenu({
  title,
  columns,
  currentColumnId,
  onMove,
  onDelete,
  deleteDescription,
}: {
  title: string;
  columns: { id: string; name: string }[];
  currentColumnId: string | null;
  onMove: (columnId: string) => void;
  onDelete: () => void;
  deleteDescription?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  // Os menus abrem em "portal", mas os cliques ainda sobem até o card: barra aqui para não abrir o card
  return (
    <span className="contents" onClick={(event) => event.stopPropagation()} draggable={false}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Opções de ${title}`}
            onClick={(event) => event.stopPropagation()}
            className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground opacity-60 transition hover:bg-secondary hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()} className="max-h-80 w-56 overflow-y-auto">
          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowRightLeft className="size-3.5" /> Mover para
          </DropdownMenuLabel>
          {columns
            .filter((column) => column.id !== currentColumnId)
            .map((column) => (
              <DropdownMenuItem key={column.id} onSelect={() => onMove(column.id)}>
                {column.name}
              </DropdownMenuItem>
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(true)}>
            <Trash2 className="size-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDelete open={confirm} onOpenChange={setConfirm} title={title} description={deleteDescription} onConfirm={onDelete} />
    </span>
  );
}

export function ConfirmDelete({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={(event) => event.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>{description ?? "Essa ação não pode ser desfeita."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
