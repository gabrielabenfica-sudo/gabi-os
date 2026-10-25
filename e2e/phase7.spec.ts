import { expect, test } from "./diagnostics";
import { login } from "./helpers";

/** Fase 7: equipe (convite com módulos restritos) e verificações gerais. */
test.describe.configure({ mode: "serial" });

test("convite: colaboradora entra só com os módulos liberados", async ({ page, browser }) => {
  await login(page);
  await page.goto("/configuracoes/equipe");
  await page.getByLabel("Ambiente").selectOption({ label: "Trabalho Mentoria" });
  await expect(page).toHaveURL(/ws=/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Ambiente")).toHaveValue(/.+/);
  const email = `assistente${Date.now().toString(36)}@exemplo.com`;
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  // Só CRM: desmarca tarefas e agenda, marca CRM
  await page.locator("#new-tasks").uncheck();
  await page.locator("#new-calendar").uncheck();
  await page.locator("#new-crm").check();
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const link = await page.getByLabel("Link do convite").inputValue();
  expect(link).toContain("/convite/");

  // Navegador sem sessão: aceita o convite criando a conta
  const ctx = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const guest = await ctx.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByRole("heading", { name: /Convite para/ })).toBeVisible();
  await guest.getByLabel("Nome").fill("Ana Assistente");
  await guest.getByLabel("Senha", { exact: true }).fill("SenhaForte#2026");
  await guest.getByLabel("Confirmar senha").fill("SenhaForte#2026");
  await guest.getByRole("button", { name: "Criar conta e entrar" }).click();
  await expect(guest).toHaveURL("/");

  // CRM visível; financeiro e mentorados não
  await guest.goto("/mentoria/crm");
  await expect(guest.getByRole("heading", { name: "CRM" })).toBeVisible();
  await guest.goto("/financas/mentoria");
  await expect(guest.getByText("Sem acesso ao financeiro")).toBeVisible();
  await guest.goto("/mentoria/mentorados");
  await expect(guest.getByText("Sem acesso aos mentorados")).toBeVisible();
  // O link não pode ser reutilizado
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByRole("heading", { name: "Convite inválido" })).toBeVisible();
  await ctx.close();

  // A dona vê a nova pessoa na equipe
  await page.reload();
  await expect(page.locator(`[data-member="${email}"]`)).toContainText("Ana Assistente");
});

test("páginas principais abrem sem erro e o menu lista os módulos", async ({ page }) => {
  await login(page);
  const pages = ["/", "/agenda", "/tarefas", "/anotacoes", "/habitos", "/financas/pessoal", "/financas/mentoria", "/turbo/remuneracao", "/resultados", "/mentoria/crm", "/mentoria/mentorados", "/conteudo", "/metas", "/maas", "/objetivos", "/revisoes", "/relatorios", "/notificacoes", "/configuracoes", "/configuracoes/integracoes", "/configuracoes/equipe"];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  for (const p of pages) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBeLessThan(400);
    await expect(page.locator("main")).not.toContainText("Algo deu errado");
  }
  expect(errors).toEqual([]);
  const nav = page.getByRole("navigation").first();
  for (const label of ["CRM", "Mentorados", "Conteúdo", "Metas", "MAAS", "Relatórios"]) await expect(nav.getByRole("link", { name: label })).toBeVisible();
});
