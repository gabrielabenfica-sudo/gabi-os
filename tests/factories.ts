import { registerUser } from "@/server/auth/accounts";
import { db } from "@/server/db";

let counter = 0;

export const TEST_PASSWORD = "SenhaForte#2026";

/** Cria uma usuária completa (com ambientes padrão) para os testes. */
export async function createTestUser(overrides: { name?: string; email?: string } = {}) {
  counter += 1;
  const email = overrides.email ?? `teste${counter}-${Date.now()}@exemplo.com`;
  const prev = process.env.ALLOW_REGISTRATION;
  process.env.ALLOW_REGISTRATION = "true";
  const result = await registerUser({ name: overrides.name ?? "Gabriela Teste", email, password: TEST_PASSWORD });
  if (prev === undefined) delete process.env.ALLOW_REGISTRATION;
  else process.env.ALLOW_REGISTRATION = prev;
  if (!result.ok) throw new Error(result.error);
  return db.user.findUniqueOrThrow({ where: { id: result.value.id } });
}
