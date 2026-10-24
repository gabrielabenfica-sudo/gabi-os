import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Repeat,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Palavras extras para a busca da paleta de comandos */
  keywords?: string[];
  shortcut?: string;
};

export type NavSection = { title?: string; items: NavItem[] };

/**
 * Navegação principal. Só entram aqui módulos já implementados —
 * nenhum item leva a uma tela vazia ou sem função.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, keywords: ["início", "home", "resumo"], shortcut: "G D" }],
  },
  {
    title: "Organização",
    items: [
      { href: "/agenda", label: "Agenda", icon: CalendarDays, keywords: ["calendário", "compromissos", "eventos", "reunião"], shortcut: "G A" },
      { href: "/tarefas", label: "Tarefas", icon: ListChecks, keywords: ["kanban", "trello", "demandas", "quadro"], shortcut: "G T" },
      { href: "/anotacoes", label: "Anotações", icon: NotebookPen, keywords: ["notas", "cadernos", "texto"], shortcut: "G N" },
      { href: "/habitos", label: "Hábitos", icon: Repeat, keywords: ["rotina", "academia", "leitura", "devocional", "estudos"], shortcut: "G H" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/notificacoes", label: "Notificações", icon: Bell, keywords: ["resumo", "revisão", "lembretes", "alertas"] },
      { href: "/configuracoes", label: "Configurações", icon: Settings, keywords: ["perfil", "senha", "ambientes", "exportar", "tema"], shortcut: "G C" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
