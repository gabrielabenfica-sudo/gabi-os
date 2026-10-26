import { expect, test } from "./diagnostics";
import { login, ymdSP } from "./helpers";

/** Fase 8: rotina do dia (blocos, rotina padrão, PDF) e exportação de roteiros em um PDF. */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
});

const uid = () => Date.now().toString(36).slice(-5);

test("rotina do dia: blocos com horário, conflito, feito, rotina padrão e PDF", async ({ page }) => {
  const day = ymdSP(40);
  const gravar = `Gravar Reels ${uid()}`;
  const reuniao = `Reunião ${uid()}`;
  const devocional = `Devocional ${uid()}`;

  await page.goto("/");
  await page.getByRole("link", { name: "Rotina do dia" }).first().click();
  await expect(page).toHaveURL(/\/rotina/);
  await page.goto(`/rotina?dia=${day}`);
  await expect(page.getByLabel("Dia da rotina")).toHaveValue(day);

  const form = page.getByRole("form", { name: "Adicionar bloco" });
  await form.getByLabel("Início").fill("09:00");
  await form.getByLabel("Fim").fill("10:00");
  await form.getByLabel("Atividade").fill(gravar);
  await form.getByLabel("Ambiente").selectOption({ label: "Trabalho Mentoria" });
  await form.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.locator(`[data-item="${gravar}"]`)).toBeVisible();
  // O próximo bloco já começa quando o anterior terminou
  await expect(form.getByLabel("Início")).toHaveValue("10:00");

  await form.getByLabel("Início").fill("09:30");
  await form.getByLabel("Fim").fill("10:30");
  await form.getByLabel("Atividade").fill(reuniao);
  await form.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.locator(`[data-item="${reuniao}"]`)).toBeVisible();
  await expect(page.locator(`[data-item="${reuniao}"]`)).toContainText("Conflito de horário");
  await expect(page.locator(`[data-item="${gravar}"]`)).toContainText("Trabalho Mentoria");

  await page.getByRole("checkbox", { name: `${gravar}: a fazer` }).click();
  await expect(page.locator(`[data-item="${gravar}"]`)).toHaveAttribute("data-done", "1");
  await expect(page.getByTestId("routine-progress")).toHaveText("1 de 2 · 50%");

  // Persistiu
  await page.reload();
  await expect(page.locator(`[data-item="${gravar}"]`)).toHaveAttribute("data-done", "1");
  await expect(page.getByTestId("routine-list").locator("li").first()).toHaveAttribute("data-item", gravar);

  // Rotina padrão: cria um bloco para todos os dias e aplica neste dia
  await page.getByRole("button", { name: "Rotina padrão", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Novo bloco" }).click();
  const tpl = page.getByRole("dialog");
  await tpl.getByLabel("Atividade").fill(devocional);
  await tpl.getByLabel("Início").fill("06:00");
  await tpl.getByLabel("Fim").fill("06:30");
  await tpl.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Bloco adicionado à rotina padrão.")).toBeVisible();
  await expect(page.getByRole("dialog").locator(`[data-template="${devocional}"]`)).toContainText("Todos os dias");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Mais ações da rotina" }).click();
  await page.getByRole("menuitem", { name: "Aplicar rotina padrão" }).click();
  await expect(page.getByText(/Rotina padrão aplicada/)).toBeVisible();
  await expect(page.getByTestId("routine-list").locator("li").first()).toHaveAttribute("data-item", devocional);

  // PDF da rotina
  const href = await page.getByTestId("routine-pdf").getAttribute("href");
  expect(href).toBe(`/imprimir/rotina?dia=${day}`);
  await page.goto(`${href}&auto=0`);
  const sheet = page.getByTestId("print-routine");
  await expect(sheet).toContainText(devocional);
  await expect(sheet).toContainText(gravar);
  await expect(sheet).toContainText("09:00–10:00");
  await expect(sheet).toContainText("1 de 3 concluídos");
  await expect(page.getByRole("button", { name: "Salvar em PDF" })).toBeVisible();
});

test("roteiros: seleciona vários na lista e exporta em um PDF só", async ({ page }) => {
  const id = uid();
  const titles = [`Roteiro alfa ${id}`, `Roteiro beta ${id}`, `Roteiro gama ${id}`];
  await page.goto("/conteudo");
  for (const [i, title] of titles.entries()) {
    await page.getByRole("button", { name: "Novo conteúdo", exact: true }).first().click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Título", { exact: true }).fill(title);
    await d.getByLabel("Gancho").fill(`Gancho ${i}`);
    await d.getByLabel("Roteiro", { exact: true }).fill(`Fala ${i}\nSegunda linha ${i}`);
    await d.getByRole("button", { name: "Criar conteúdo" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  // Atalho do cabeçalho leva à lista com seleção
  await page.getByRole("link", { name: "Exportar roteiros" }).click();
  await expect(page).toHaveURL(/aba=lista/);
  await page.getByLabel("Buscar conteúdo").fill(id);
  await expect(page.locator("tbody tr")).toHaveCount(3);

  await page.getByRole("checkbox", { name: `Selecionar ${titles[2]}` }).check();
  await page.getByRole("checkbox", { name: `Selecionar ${titles[0]}` }).check();
  await expect(page.getByTestId("selected-count")).toHaveText("2 selecionados");
  // Marcar não abre o conteúdo
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const href = await page.getByTestId("export-scripts").getAttribute("href");
  expect(href).toMatch(/^\/imprimir\/roteiros\?ids=/);
  await page.goto(`${href}&auto=0`);
  const sheet = page.getByTestId("print-scripts");
  await expect(sheet.locator("article")).toHaveCount(2);
  await expect(sheet).toContainText("Gancho 0");
  await expect(sheet).toContainText("Segunda linha 2");
  await expect(sheet).not.toContainText(titles[1]!);
  await expect(page.getByLabel("Cada roteiro em uma página")).toBeChecked();

  // Selecionar todos (filtrados) → 3
  await page.goto("/conteudo?aba=lista");
  await page.getByLabel("Buscar conteúdo").fill(id);
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("checkbox", { name: "Selecionar todos" }).click();
  await expect(page.getByTestId("selected-count")).toHaveText("3 selecionados");
  const all = await page.getByTestId("export-scripts").getAttribute("href");
  await page.goto(`${all}&auto=0`);
  await expect(page.getByTestId("print-scripts").locator("article")).toHaveCount(3);
});
