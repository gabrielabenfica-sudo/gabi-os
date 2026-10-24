import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";

type AuditInput = {
  userId?: string | null;
  workspaceId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Remove campos sensíveis e normaliza Date/Decimal
  return JSON.parse(
    JSON.stringify(value, (key, v) => (/(password|token|secret)/i.test(key) ? "[omitido]" : v)),
  ) as Prisma.InputJsonValue;
}

/** Registra uma alteração relevante. Falhas de auditoria não interrompem a operação. */
export async function audit(input: AuditInput, client: Prisma.TransactionClient | typeof db = db) {
  try {
    await client.auditLog.create({
      data: {
        userId: input.userId ?? null,
        workspaceId: input.workspaceId ?? null,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        before: toJson(input.before),
        after: toJson(input.after),
      },
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria", error);
  }
}
