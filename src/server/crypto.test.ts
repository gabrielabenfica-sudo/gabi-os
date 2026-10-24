import { describe, expect, it } from "vitest";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";

describe("crypto", () => {
  it("criptografa e descriptografa", () => {
    const secret = "ya29.token-do-google";
    const payload = encrypt(secret);
    expect(payload).not.toContain(secret);
    expect(decrypt(payload)).toBe(secret);
  });

  it("gera payloads diferentes para o mesmo texto (IV aleatório)", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  it("detecta adulteração", () => {
    const parts = encrypt("valor").split(".");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("tokens aleatórios e hash determinístico", () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken(32).length).toBeGreaterThanOrEqual(43);
    expect(sha256("abc")).toBe(sha256("abc"));
  });
});
