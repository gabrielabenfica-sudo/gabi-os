import { expect, test } from "./diagnostics";
import { login, ymdSP } from "./helpers";

/**
 * Fase 3: contas, lançamentos, cartão parcelado, remuneração TURBO,
 * venda da Mentoria, retirada para o Pessoal e consolidado.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
});


test("pessoal: conta, despesa paga e saldo", async ({ page }) => {
  await page.goto("/financas/pessoal?aba=contas");
  await page.getByRole("button", { name: "Cadastrar conta" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome", { exact: true }).fill("Nubank");
  await d.getByLabel("Saldo inicial", { exact: true }).fill("1.000,00");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("accounts")).toContainText("Nubank");
  await expect(page.getByTestId("accounts")).toContainText("R$ 1.000,00");

  await page.goto("/financas/pessoal?aba=lancamentos");
  await page.getByRole("button", { name: "Despesa", exact: true }).click();
  const tx = page.getByRole("dialog");
  await tx.getByLabel("Descrição").fill("Aluguel");
  await tx.getByLabel("Valor", { exact: true }).fill("300");
  await tx.getByLabel("Categoria").selectOption({ label: "Moradia" });
  await tx.getByRole("button", { name: "Lançar" }).click();
  const row = page.locator('[data-row="Aluguel"]');
  await expect(row).toContainText("Previsto");

  await row.getByRole("button", { name: /Marcar Aluguel como pago/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(row).toContainText("Pago");

  await page.goto("/financas/pessoal?aba=contas");
  await expect(page.getByTestId("accounts")).toContainText("R$ 700,00");
});

test("pessoal: compra parcelada no cartão vai para 3 faturas e o pagamento não duplica", async ({ page }) => {
  await page.goto("/financas/pessoal?aba=cartoes");
  await page.getByRole("button", { name: "Cadastrar cartão" }).click();
  const c = page.getByRole("dialog");
  await c.getByLabel("Nome", { exact: true }).fill("Visa");
  await c.getByLabel("Limite").fill("5000");
  await c.getByLabel("Dia de fechamento").fill("1");
  await c.getByLabel("Dia de vencimento").fill("10");
  await c.getByRole("button", { name: "Salvar" }).click();

  await page.getByRole("button", { name: "Nova compra" }).click();
  const p = page.getByRole("dialog");
  await p.getByLabel("Descrição").fill("Celular");
  await p.getByLabel("Valor total").fill("900");
  await p.getByLabel("Parcelas").selectOption("3");
  await p.getByRole("button", { name: "Lançar compra" }).click();

  const tabs = page.getByRole("tablist", { name: "Faturas" }).getByRole("tab");
  await expect(tabs).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(tabs.nth(i)).toContainText("R$ 300,00");

  const invoice = page.getByTestId("invoice");
  await expect(invoice).toContainText("Celular");
  await expect(invoice).toContainText("(1/3)");
  await invoice.getByRole("button", { name: "Pagar fatura" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(invoice).toContainText("Paga");

  // Saldo caiu pelo pagamento (700 − 300)
  await page.goto("/financas/pessoal?aba=contas");
  await expect(page.getByTestId("accounts")).toContainText("R$ 400,00");
});

test("TURBO: salário previsto, recebido e lançado no pessoal uma única vez", async ({ page }) => {
  const today = ymdSP(0);
  await page.goto("/turbo/remuneracao");
  await page.getByRole("button", { name: "Gerar salários" }).click();
  const g = page.getByRole("dialog");
  await g.getByLabel("Salário (valor previsto)").fill("5000");
  await g.getByLabel("Dia do pagamento").fill(String(Number(today.slice(8, 10))));
  await g.getByLabel("Quantos meses").fill("1");
  await g.getByLabel("Pago no mês seguinte ao trabalhado").uncheck();
  await g.getByRole("button", { name: "Gerar" }).click();
  await expect(page.getByText("1 salário(s) criado(s).")).toBeVisible();

  const month = page.locator(`[data-month="${today.slice(0, 7)}"]`);
  await expect(month).toContainText("Previsto");
  await month.getByRole("button", { name: "Receber" }).click();
  const r = page.getByRole("dialog");
  await r.getByLabel("Valor recebido (líquido)").fill("4.800,00");
  await r.getByRole("button", { name: "Confirmar" }).click();
  await expect(month).toContainText("Recebido");

  await page.goto("/financas/pessoal?aba=lancamentos");
  const income = page.locator('[data-row^="Salário TURBO"]');
  await expect(income).toHaveCount(1);
  await expect(income).toContainText("R$ 4.800,00");
  await expect(income).toContainText("Recebido");
});

test("Mentoria: venda à vista recebida, retirada para o pessoal e consolidado", async ({ page }) => {
  await page.goto("/financas/mentoria?aba=contas");
  await page.getByRole("button", { name: "Cadastrar conta" }).click();
  const a = page.getByRole("dialog");
  await a.getByLabel("Nome", { exact: true }).fill("Conta PJ");
  await a.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("accounts")).toContainText("Conta PJ");

  await page.goto("/financas/mentoria?aba=vendas");
  await page.getByRole("button", { name: "Nova venda" }).click();
  const s = page.getByRole("dialog");
  await s.getByLabel("Cliente").fill("Ana Paula");
  await s.getByLabel("Descrição").fill("Mentoria individual");
  await s.getByLabel("Valor total").fill("2000");
  await s.getByLabel("Já recebido na data da venda").check();
  await s.getByRole("button", { name: "Registrar venda" }).click();
  const sale = page.locator('[data-sale="Ana Paula"]');
  await expect(sale).toContainText("R$ 2.000,00");
  await expect(sale).toContainText("recebido R$ 2.000,00");

  await page.goto("/financas/mentoria");
  await expect(page.getByLabel("Indicadores do mês")).toContainText("R$ 2.000,00");

  // Retirada para o Pessoal
  await page.goto("/financas/mentoria?aba=contas");
  await page.getByRole("button", { name: "Transferir" }).click();
  const t = page.getByRole("dialog");
  await t.getByLabel("Para").selectOption({ label: "Nubank (Pessoal Gabriela)" });
  await t.getByLabel("Valor", { exact: true }).fill("500");
  await expect(t.getByText(/Retirada da Mentoria: entra como receita/)).toBeVisible();
  await t.getByRole("button", { name: "Transferir" }).click();
  await expect(page.getByTestId("accounts")).toContainText("R$ 1.500,00");

  // Consolidado: lucro da Mentoria não é reduzido pela retirada
  await page.goto("/resultados");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { name: "Empresa e Resultados" })).toBeVisible();
  await expect(main).toContainText("Lucro");
  await expect(main).toContainText("R$ 2.000,00");
  await expect(main).toContainText("… das quais retiradas da Mentoria");
  await expect(main).toContainText("R$ 500,00");

  // Exportação CSV dos lançamentos pessoais
  await page.goto("/financas/pessoal?aba=lancamentos");
  const csvHref = await page.getByRole("link", { name: "CSV" }).getAttribute("href");
  const res = await page.request.get(csvHref!);
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv).toContain("Aluguel");
  expect(csv).toContain("-300,00");
});
