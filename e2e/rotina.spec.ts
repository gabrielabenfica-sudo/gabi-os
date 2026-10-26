import { expect, test } from "./diagnostics";
import { login } from "./helpers";

/** Rotina: rotina do dia com horários e processos com execuções. Depende da conta criada em foundation.spec.ts. */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("rotina do dia: criar com horários, marcar e manter após recarregar", async ({ page }) => {
  await page.goto("/rotina?novo=1");
  const d = page.getByRole("dialog");
  await expect(d.getByRole("heading", { name: "Nova rotina do dia" })).toBeVisible();
  await d.getByLabel("Nome", { exact: true }).fill("Todos os dias");
  // Garante todos os dias da semana marcados (o teste roda em qualquer dia)
  for (const day of ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]) {
    const btn = d.getByRole("button", { name: day, exact: true });
    if ((await btn.getAttribute("aria-pressed")) !== "true") await btn.click();
  }
  await d.getByLabel("Horário do item 1").fill("19:00");
  await d.getByLabel("Item 1", { exact: true }).fill("Academia");
  await d.getByRole("button", { name: "Adicionar item" }).click();
  await d.getByLabel("Horário do item 2").fill("06:30");
  await d.getByLabel("Item 2", { exact: true }).fill("Devocional");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Rotina criada.")).toBeVisible();

  const roteiro = page.getByRole("region", { name: "Roteiro do dia" });
  // Ordem por horário: manhã antes de noite
  await expect(roteiro.getByRole("heading", { name: "Manhã" })).toBeVisible();
  await expect(roteiro.getByRole("button", { name: /às/ }).first()).toHaveAccessibleName("Devocional às 06:30: não feito");

  await roteiro.getByRole("button", { name: "Devocional às 06:30: não feito" }).click();
  await expect(roteiro.getByRole("button", { name: "Devocional às 06:30: feito" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Roteiro do dia" }).getByRole("button", { name: "Devocional às 06:30: feito" })).toBeVisible();
  await expect(page.getByText("1/2", { exact: true }).first()).toBeVisible();

  // Dia seguinte: aparece, mas não pode ser marcado
  await page.getByRole("button", { name: "Próximo dia" }).click();
  await expect(page).toHaveURL(/data=/);
  await expect(page.getByRole("region", { name: "Roteiro do dia" }).getByRole("button", { name: "Devocional às 06:30: não feito" })).toBeDisabled();
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByTestId("routine-date")).toContainText("Hoje");

  // Cartão da rotina
  await expect(page.locator('[data-routine="Todos os dias"]')).toContainText("Todos os dias · 2 itens");
});

test("processos: criar, executar passo a passo e concluir", async ({ page }) => {
  await page.goto("/rotina?aba=processos");
  await page.getByRole("button", { name: "Novo processo" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome", { exact: true }).fill("Rotina de gravação");
  await d.getByLabel("Passo 1", { exact: true }).fill("Revisar roteiro");
  await d.getByRole("button", { name: "Adicionar passo" }).click();
  await d.getByLabel("Passo 2", { exact: true }).fill("Gravar 3 takes");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Processo criado.")).toBeVisible();

  const card = page.locator('[data-process="Rotina de gravação"]');
  await expect(card).toContainText("nunca executado");
  await card.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("Execução iniciada.")).toBeVisible();
  await card.getByLabel("Revisar roteiro").check();
  await expect(card).toContainText("1/2 passos");

  await card.getByRole("button", { name: "Concluir" }).click();
  const finish = page.getByRole("dialog");
  await expect(finish).toContainText("Faltam 1 passo");
  await finish.getByLabel("Observação (opcional)").fill("Faltou luz");
  await finish.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByText("Execução concluída.")).toBeVisible();
  await expect(card).toContainText("executado 1x");
  await card.getByRole("button", { name: /Ver histórico/ }).click();
  await expect(card).toContainText("1/2 passos");
  await expect(card).toContainText("Faltou luz");
});
