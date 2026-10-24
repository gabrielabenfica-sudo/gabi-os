import { describe, expect, it } from "vitest";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";

describe("senhas", () => {
  it("gera hash Argon2id e verifica", async () => {
    const hash = await hashPassword("SenhaForte#2026");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "SenhaForte#2026")).toBe(true);
    expect(await verifyPassword(hash, "senhaerrada")).toBe(false);
  });

  it("retorna false para hash inválido em vez de lançar erro", async () => {
    expect(await verifyPassword("não-é-um-hash", "x")).toBe(false);
  });

  it("valida força mínima", () => {
    expect(validatePasswordStrength("curta1")).toMatch(/10 caracteres/);
    expect(validatePasswordStrength("somenteletras")).toMatch(/dois tipos/);
    expect(validatePasswordStrength("letras12345")).toBeNull();
  });
});
