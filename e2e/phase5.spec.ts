import { expect, test } from "./diagnostics";
import { login } from "./helpers";

/** Fase 5: MAAS, objetivos, revisões e relatório consolidado. */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("MAAS: avaliação, roda da vida e plano de ação vira objetivo", async ({ page }) => {
  await page.goto("/maas");
  await page.getByRole("button", { name: /Nova avaliação|Fazer avaliação/ }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nota (número) de Saúde").fill("6");
  await d.getByLabel("Nota (número) de Finanças").fill("4");
  await d.getByLabel("Nota (número) de Propósito").fill("8");
  await d.getByRole("button", { name: "Detalhes de Finanças" }).click();
  await d.getByLabel("Comentário sobre Finanças").fill("Gastos acima do planejado");
  await d.getByLabel("Meta para Finanças").fill("Montar reserva de emergência");
  await d.getByLabel("Plano de ação para Finanças").fill("- Cortar assinaturas\n- Guardar 15% do salário");
  await expect(d.getByText("3 de 12 áreas com nota")).toBeVisible();
  await d.getByRole("button", { name: "Salvar avaliação" }).click();
  await expect(page.getByText("Avaliação salva.")).toBeVisible();

  const summary = page.getByLabel("Resumo do MAAS");
  await expect(summary).toContainText("6"); // média (6 + 4 + 8) ÷ 3
  const areas = page.getByTestId("maas-areas");
  await expect(areas.locator("[data-area]").first()).toHaveAttribute("data-area", "Finanças");
  await expect(areas).toContainText("Meta: Montar reserva de emergência");

  await areas.getByRole("button", { name: "Transformar em objetivo" }).click();
  await expect(page).toHaveURL(/\/objetivos\?meta=/);
  const obj = page.getByRole("dialog", { name: "Montar reserva de emergência" });
  await expect(obj.getByText("Cortar assinaturas")).toBeVisible();
  await obj.getByLabel("Concluir etapa Cortar assinaturas").check();
  await expect(obj.getByTestId("goal-progress")).toContainText("1 de 2 etapas concluídas");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-goal="Montar reserva de emergência"]')).toContainText("Finanças");

  // Objetivos não se misturam com as metas
  await page.goto("/metas");
  await expect(page.locator('[data-goal="Montar reserva de emergência"]')).toHaveCount(0);
});

test("revisão semanal: números do período e reflexão salva", async ({ page }) => {
  await page.goto("/revisoes");
  await expect(page.getByTestId("review-digest")).toContainText("Tarefas concluídas");
  await page.getByRole("radio", { name: "4 de 5" }).click();
  await page.getByLabel("O que deu certo").fill("Rotina de conteúdo funcionou");
  await page.getByLabel("Prioridades da próxima semana").fill("Fechar 2 mentorias");
  await page.getByRole("button", { name: "Salvar revisão" }).click();
  await expect(page.getByText("Revisão salva.")).toBeVisible();
  await expect(page.getByTestId("review-history")).toContainText("Rotina de conteúdo funcionou");
  await page.reload();
  await expect(page.getByLabel("O que deu certo")).toHaveValue("Rotina de conteúdo funcionou");

  await page.getByRole("tab", { name: "Mensal" }).click();
  await expect(page.getByLabel("Prioridades do próximo mês")).toBeVisible();
});

test("relatório consolidado do mês e exportação CSV", async ({ page }) => {
  await page.goto("/relatorios");
  const report = page.getByTestId("report");
  await expect(report).toContainText("Finanças pessoais");
  await expect(report).toContainText("Mentoria");
  await expect(report).toContainText("Tarefas");
  await expect(report).toContainText("MAAS");

  await page.getByLabel("Período").selectOption("ano");
  await expect(page).toHaveURL(/periodo=ano/);
  const href = await page.getByRole("link", { name: "CSV" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv).toContain("Seção;Indicador;Valor");
  expect(csv).toContain("Pessoal;Resultado (R$)");
});
