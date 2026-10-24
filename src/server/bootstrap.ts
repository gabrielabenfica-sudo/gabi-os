import type { Prisma, WorkspaceKind } from "@prisma/client";
import { firstName } from "@/lib/utils";

/** Estruturas padrão criadas para cada nova usuária. Tudo é editável depois. */

export const DEFAULT_TASK_STATUSES = [
  { name: "Ideias / Backlog", category: "BACKLOG", isDone: false },
  { name: "A fazer", category: "TODO", isDone: false },
  { name: "Em andamento", category: "IN_PROGRESS", isDone: false },
  { name: "Aguardando", category: "WAITING", isDone: false },
  { name: "Em revisão", category: "REVIEW", isDone: false },
  { name: "Concluído", category: "DONE", isDone: true },
] as const;

export const DEFAULT_CONTENT_STATUSES = [
  { name: "Ideia" },
  { name: "Roteirização" },
  { name: "Revisão" },
  { name: "Aprovado para gravação" },
  { name: "Gravação agendada", isRecordingScheduled: true },
  { name: "Gravado" },
  { name: "Em edição" },
  { name: "Revisão final" },
  { name: "Aprovado" },
  { name: "Agendado", isScheduled: true },
  { name: "Publicado", isPublished: true },
] as const;

export const DEFAULT_PIPELINE_STAGES = [
  { name: "Novo lead" },
  { name: "Primeiro contato" },
  { name: "Qualificação" },
  { name: "Reunião agendada" },
  { name: "Proposta apresentada" },
  { name: "Negociação" },
  { name: "Venda realizada", isWon: true },
  { name: "Perdido", isLost: true },
] as const;

export const DEFAULT_PERSONAL_EXPENSE_CATEGORIES = [
  "Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer",
  "Assinaturas", "Compras", "Investimentos", "Reserva financeira", "Outras",
];

export const DEFAULT_PERSONAL_INCOME_CATEGORIES = [
  "Salário TURBO", "Bonificações TURBO", "Retiradas da Mentoria", "Outras receitas",
];

export const DEFAULT_MENTORING_CATEGORIES: { name: string; kind: "INCOME" | "EXPENSE"; costType?: string }[] = [
  { name: "Vendas de mentoria", kind: "INCOME" },
  { name: "Outras receitas", kind: "INCOME" },
  { name: "Ferramentas e assinaturas", kind: "EXPENSE", costType: "FIXED" },
  { name: "Equipe e prestadores", kind: "EXPENSE", costType: "FIXED" },
  { name: "Tráfego pago", kind: "EXPENSE", costType: "VARIABLE" },
  { name: "Taxas de pagamento", kind: "EXPENSE", costType: "VARIABLE" },
  { name: "Impostos", kind: "EXPENSE", costType: "VARIABLE" },
  { name: "Comissões", kind: "EXPENSE", costType: "COMMISSION" },
  { name: "Reembolsos", kind: "EXPENSE", costType: "REFUND" },
  { name: "Outras despesas", kind: "EXPENSE", costType: "OTHER" },
];

export const DEFAULT_MAAS_AREAS = [
  "Saúde", "Desenvolvimento intelectual", "Equilíbrio emocional", "Vida espiritual",
  "Família", "Relacionamentos", "Vida social", "Realização profissional",
  "Finanças", "Qualidade de vida", "Propósito", "Contribuição",
];

export function defaultWorkspaces(userName: string): { name: string; kind: WorkspaceKind; color: string }[] {
  return [
    { name: "Trabalho TURBO", kind: "TURBO", color: "#373039" },
    { name: `Pessoal ${firstName(userName)}`, kind: "PESSOAL", color: "#A66F7C" },
    { name: "Trabalho Mentoria", kind: "MENTORIA", color: "#B8AAA4" },
  ];
}

/** Cria ambientes e estruturas padrão dentro de uma transação já aberta. */
export async function bootstrapUserData(tx: Prisma.TransactionClient, user: { id: string; name: string }) {
  const workspaces = [];
  for (const [position, ws] of defaultWorkspaces(user.name).entries()) {
    const workspace = await tx.workspace.create({
      data: {
        ...ws,
        position,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
        taskStatuses: {
          create: DEFAULT_TASK_STATUSES.map((s, i) => ({ ...s, position: i })),
        },
        contentStatuses: {
          create: DEFAULT_CONTENT_STATUSES.map((s, i) => ({ ...s, position: i })),
        },
      },
    });
    workspaces.push(workspace);

    if (ws.kind === "PESSOAL") {
      await tx.financialCategory.createMany({
        data: [
          ...DEFAULT_PERSONAL_EXPENSE_CATEGORIES.map((name) => ({ workspaceId: workspace.id, name, kind: "EXPENSE" as const })),
          ...DEFAULT_PERSONAL_INCOME_CATEGORIES.map((name) => ({ workspaceId: workspace.id, name, kind: "INCOME" as const })),
        ],
      });
    }
    if (ws.kind === "MENTORIA") {
      await tx.financialCategory.createMany({
        data: DEFAULT_MENTORING_CATEGORIES.map((c) => ({ workspaceId: workspace.id, ...c })),
      });
      await tx.pipelineStage.createMany({
        data: DEFAULT_PIPELINE_STAGES.map((s, i) => ({ workspaceId: workspace.id, position: i, ...s })),
      });
    }
  }

  await tx.maasArea.createMany({
    data: DEFAULT_MAAS_AREAS.map((name, position) => ({ userId: user.id, name, position })),
  });
  await tx.notificationPreference.create({ data: { userId: user.id } });

  return workspaces;
}
