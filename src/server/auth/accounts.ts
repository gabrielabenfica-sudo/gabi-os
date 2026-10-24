import { z } from "zod";
import { db } from "@/server/db";
import { bootstrapUserData } from "@/server/bootstrap";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";
import { isLoginBlocked, recordLoginAttempt } from "./rate-limit";
import { audit } from "@/server/audit";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(100),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  password: z.string().max(200),
});

export type AuthResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function isRegistrationOpen(): Promise<boolean> {
  if (process.env.ALLOW_REGISTRATION === "true") return true;
  const count = await db.user.count();
  return count === 0;
}

export async function registerUser(input: unknown): Promise<AuthResult<{ id: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { name, email, password } = parsed.data;

  const weak = validatePasswordStrength(password);
  if (weak) return { ok: false, error: weak };

  if (!(await isRegistrationOpen())) {
    return { ok: false, error: "Novos cadastros estão desativados." };
  }
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "Já existe uma conta com este e-mail." };

  const passwordHash = await hashPassword(password);
  const isFirst = (await db.user.count()) === 0;

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email, passwordHash, isAdmin: isFirst },
    });
    await bootstrapUserData(tx, created);
    return created;
  });
  await audit({ userId: user.id, entity: "User", entityId: user.id, action: "register" });
  return { ok: true, value: { id: user.id } };
}

const GENERIC_LOGIN_ERROR = "E-mail ou senha incorretos.";

export async function authenticate(
  emailRaw: string,
  password: string,
  ip: string | null,
): Promise<AuthResult<{ id: string }>> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email || !password) return { ok: false, error: GENERIC_LOGIN_ERROR };

  if (await isLoginBlocked(email, ip)) {
    return { ok: false, error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." };
  }
  const user = await db.user.findUnique({ where: { email } });
  // Verifica mesmo sem usuária, para não revelar quais e-mails existem pelo tempo de resposta
  const valid = user && !user.deletedAt
    ? await verifyPassword(user.passwordHash, password)
    : (await verifyPassword(await getDummyHash(), password), false);

  await recordLoginAttempt(email, ip, Boolean(valid));
  if (!user || !valid) return { ok: false, error: GENERIC_LOGIN_ERROR };
  return { ok: true, value: { id: user.id } };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthResult<null>> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    return { ok: false, error: "A senha atual está incorreta." };
  }
  const weak = validatePasswordStrength(newPassword);
  if (weak) return { ok: false, error: weak };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await audit({ userId, entity: "User", entityId: userId, action: "change_password" });
  return { ok: true, value: null };
}

// Hash real de uma senha aleatória, usado só para igualar o tempo de resposta
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
}
