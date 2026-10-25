import { expect, test } from "./diagnostics";
import { login, ymdSP } from "./helpers";

/** Fase 6: importação de extrato (OFX/CSV) e tela de integrações. */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
});

const d = (ymd: string) => ymd.replace(/-/g, "");

test("importa extrato OFX, concilia previsto e não duplica ao reimportar", async ({ page }) => {
  const day = ymdSP(0);
  // Conta e um previsto que o extrato vai quitar
  await page.goto("/financas/pessoal?aba=contas");
  await page.getByRole("button", { name: /Nova conta|Cadastrar conta/ }).first().click();
  const acc = page.getByRole("dialog");
  await acc.getByLabel("Nome", { exact: true }).fill("Banco Import");
  await acc.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("accounts")).toContainText("Banco Import");

  await page.goto("/financas/pessoal?aba=lancamentos");
  await page.getByRole("button", { name: "Despesa", exact: true }).click();
  const tx = page.getByRole("dialog");
  await tx.getByLabel("Descrição").fill("Internet fibra");
  await tx.getByLabel("Valor", { exact: true }).fill("119,90");
  await tx.getByLabel("Competência").fill(day);
  await tx.getByRole("button", { name: "Lançar" }).click();
  await expect(page.locator('[data-row="Internet fibra"]')).toContainText("Previsto");

  const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${d(day)}<TRNAMT>-119.90<FITID>E2E-1<MEMO>DEBITO AUTOMATICO INTERNET</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${d(day)}<TRNAMT>-42.50<FITID>E2E-2<MEMO>FARMACIA SAO JOAO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${d(day)}<TRNAMT>800.00<FITID>E2E-3<MEMO>PIX RECEBIDO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  await page.goto("/financas/pessoal?aba=contas");
  await page.getByRole("button", { name: "Importar extrato" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Importar extrato" });
  await dlg.getByLabel("Conta").selectOption({ label: "Banco Import" });
  await dlg.getByLabel(/Arquivo/).setInputFiles({ name: "extrato.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx, "latin1") });
  const preview = dlg.getByTestId("import-preview");
  await expect(preview.locator('[data-import-row="DEBITO AUTOMATICO INTERNET"]')).toContainText("Conciliar");
  await expect(preview.locator('[data-import-row="DEBITO AUTOMATICO INTERNET"]')).toContainText("Internet fibra");
  await expect(preview.locator('[data-import-row="FARMACIA SAO JOAO"]')).toContainText("Novo");
  await dlg.getByLabel("Categoria de FARMACIA SAO JOAO").selectOption({ label: "Saúde" });
  await dlg.getByRole("button", { name: /^Importar 3/ }).click();
  await expect(page.getByText("Importado: 2 novo(s), 1 conciliado(s).")).toBeVisible();
  await expect(page.getByTestId("imports")).toContainText("extrato.ofx");
  // Saldo: −119,90 − 42,50 + 800,00
  await expect(page.getByTestId("accounts").locator("li", { hasText: "Banco Import" })).toContainText("R$ 637,60");

  // O previsto virou pago (não há uma segunda despesa de internet)
  await page.goto(`/financas/pessoal?aba=lancamentos&mes=${day.slice(0, 7)}`);
  await expect(page.locator('[data-row="Internet fibra"]')).toContainText("Pago");
  await expect(page.locator('[data-row="DEBITO AUTOMATICO INTERNET"]')).toHaveCount(0);

  // Reimportar o mesmo arquivo: tudo reconhecido como já importado
  await page.goto("/financas/pessoal?aba=contas");
  await page.getByRole("button", { name: "Importar extrato" }).first().click();
  const again = page.getByRole("dialog", { name: "Importar extrato" });
  await again.getByLabel("Conta").selectOption({ label: "Banco Import" });
  await again.getByLabel(/Arquivo/).setInputFiles({ name: "extrato.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx, "latin1") });
  await expect(again.getByTestId("import-preview").getByText("Já importado")).toHaveCount(3);
  await expect(again.getByRole("button", { name: /^Importar/ })).toBeDisabled();
});

test("integrações mostram o estado real da configuração", async ({ page }) => {
  await page.goto("/configuracoes/integracoes");
  await expect(page.getByTestId("google-integration")).toContainText(/Ainda não configurado|Conectar Google Calendar/);
  await expect(page.getByTestId("meta-integration")).toContainText(/Ainda não configurado|Conectar com a Meta/);
  await expect(page.locator("main")).toContainText("Open Finance");
  // Sem credenciais, iniciar o OAuth volta com aviso em vez de quebrar
  const res = await page.request.get("/api/integrations/google/start", { maxRedirects: 0 });
  expect([302, 307]).toContain(res.status());
});
