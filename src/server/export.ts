import { db } from "@/server/db";

export const EXPORT_FORMAT_VERSION = 1;

/**
 * Exporta todos os dados da usuária e dos ambientes de que ela é dona.
 * Nunca inclui hash de senha, tokens de sessão ou tokens de integração.
 */
export async function exportUserData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, timezone: true, theme: true, appName: true, createdAt: true },
  });
  const workspaces = await db.workspace.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } });
  const ids = workspaces.map((w) => w.id);
  const inWs = { workspaceId: { in: ids } };

  const [
    projects, taskStatuses, tasks, labels, events, noteFolders, notes, goals, habits, routines,
    accounts, categories, transactions, transfers, creditCards, compensation, bonusRules,
    pipelineStages, programs, leads, mentees, sales, contentStatuses, contentItems,
    contentReferences, socialProfiles, attachments,
  ] = await Promise.all([
    db.project.findMany({ where: inWs }),
    db.taskStatus.findMany({ where: inWs }),
    db.task.findMany({ where: inWs, include: { checklist: true, comments: true, labels: true, timeEntries: true, history: true } }),
    db.label.findMany({ where: inWs }),
    db.calendarEvent.findMany({ where: inWs }),
    db.noteFolder.findMany({ where: inWs }),
    db.note.findMany({ where: inWs, include: { links: true } }),
    db.goal.findMany({ where: inWs, include: { steps: true, progress: true } }),
    db.habit.findMany({ where: inWs, include: { entries: true } }),
    db.routine.findMany({ where: inWs, include: { items: { include: { checks: true } }, runs: { include: { steps: true } } } }),
    db.financialAccount.findMany({ where: inWs }),
    db.financialCategory.findMany({ where: inWs }),
    db.financialTransaction.findMany({ where: inWs }),
    db.transfer.findMany({ where: { OR: [{ fromWorkspaceId: { in: ids } }, { toWorkspaceId: { in: ids } }] } }),
    db.creditCard.findMany({ where: inWs, include: { invoices: true, purchases: { include: { installments: true } } } }),
    db.compensationRecord.findMany({ where: inWs }),
    db.bonusRule.findMany({ where: inWs }),
    db.pipelineStage.findMany({ where: inWs }),
    db.mentorshipProgram.findMany({ where: inWs }),
    db.lead.findMany({ where: inWs, include: { activities: true } }),
    db.mentee.findMany({ where: inWs, include: { sessions: true, goals: true, materials: true, timeline: true } }),
    db.sale.findMany({ where: inWs, include: { receivables: true } }),
    db.contentStatus.findMany({ where: inWs }),
    db.contentItem.findMany({ where: inWs, include: { metrics: true } }),
    db.contentReference.findMany({ where: inWs }),
    db.socialProfile.findMany({ where: inWs, include: { snapshots: true } }),
    db.attachment.findMany({ where: inWs, select: { id: true, workspaceId: true, entityType: true, entityId: true, name: true, url: true, mimeType: true, sizeBytes: true, createdAt: true } }),
  ]);

  const [maasAreas, maasAssessments, notificationPrefs, reviews] = await Promise.all([
    db.maasArea.findMany({ where: { userId } }),
    db.maasAssessment.findMany({ where: { userId }, include: { scores: true } }),
    db.notificationPreference.findUnique({ where: { userId } }),
    db.review.findMany({ where: { userId } }),
  ]);

  return {
    format: "gabi-os-export",
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    user,
    workspaces,
    data: {
      projects, taskStatuses, tasks, labels, events, noteFolders, notes, goals, habits, routines,
      accounts, categories, transactions, transfers, creditCards, compensation, bonusRules,
      pipelineStages, programs, leads, mentees, sales, contentStatuses, contentItems,
      contentReferences, socialProfiles, attachments, maasAreas, maasAssessments, reviews, notificationPrefs,
    },
  };
}
