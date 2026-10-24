import { expect, type Page } from "@playwright/test";

export const EMAIL = "gabriela@exemplo.com";
export const PASSWORD = "SenhaForte#2026";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
}

/** Data "YYYY-MM-DD" em São Paulo, deslocada em dias. */
export function ymdSP(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
