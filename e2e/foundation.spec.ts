import { expect, test } from "@playwright/test";

/**
 * Fluxo da Fase 1 em um banco vazio:
 * cadastro → dashboard → persistência → navegação → ambientes → logout → login.
 */
const EMAIL = "gabriela@exemplo.com";
const PASSWORD = "SenhaForte#2026";

test.describe.configure({ mode: "serial" });

test("redireciona para o login sem sessão", async ({ page }) => {
  await page.goto("/configuracoes");
  await expect(page).toHaveURL(/\/login\?next=%2Fconfiguracoes/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("cadastro da administradora, persistência e configurações", async ({ page }) => {
  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill("Gabriela Benfica");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Gabriela");
  await expect(page.getByText("Trabalho TURBO")).toBeVisible();
  await expect(page.getByText("Pessoal Gabriela")).toBeVisible();
  await expect(page.getByText("Trabalho Mentoria")).toBeVisible();

  // Atualizar a página não perde a sessão nem os dados
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Gabriela");

  // Paleta de comandos navega até Configurações
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Digite para buscar páginas…").fill("config");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/configuracoes");

  // Renomeia um ambiente e confere a persistência
  const first = page.getByLabel("Nome do ambiente").first();
  await first.fill("TURBO Digital");
  await first.locator("xpath=..").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Ambiente atualizado.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome do ambiente").first()).toHaveValue("TURBO Digital");

  // Filtro de ambiente no topo
  await page.getByRole("button", { name: "Filtrar por ambiente" }).click();
  await page.getByRole("menuitem", { name: /Pessoal Gabriela/ }).click();
  await expect(page.getByRole("button", { name: "Filtrar por ambiente" })).toContainText("Pessoal Gabriela");
  await page.goto("/");
  await expect(page.getByText("Ambiente selecionado")).toBeVisible();

  // Exportação retorna JSON sem segredos
  const res = await page.request.get("/api/export");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('"format": "gabi-os-export"');
  expect(body).not.toContain("passwordHash");
});

test("logout, login com senha errada e correta, cadastro fechado", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill("senha-errada-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha incorretos.");

  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Menu da conta" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Sem sessão, a API de exportação nega acesso
  const res = await page.request.get("/api/export", { maxRedirects: 0 });
  expect([302, 307, 401]).toContain(res.status());

  await page.goto("/cadastro");
  await expect(page.getByRole("heading", { name: "Cadastro desativado" })).toBeVisible();
});
