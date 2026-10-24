import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ForbiddenError } from "@/server/workspaces";

/** Erro de regra de negócio com mensagem pronta para a usuária. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Registro") {
    super(`${what} não encontrado.`);
    this.name = "NotFoundError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string };

export function errorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Dados inválidos.";
  if (error instanceof AppError || error instanceof ForbiddenError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "Já existe um registro com esses dados.";
    if (error.code === "P2025") return "Registro não encontrado.";
  }
  console.error(error);
  return "Algo deu errado. Tente novamente.";
}

/** Executa uma operação e converte exceções em ActionResult. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(), message };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
