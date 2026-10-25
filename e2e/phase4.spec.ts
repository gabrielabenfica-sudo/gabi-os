import { expect, test } from "./diagnostics";
import { login, ymdSP } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * Fase 4: CRM (lead → venda → mentorado), ficha do mentorado com encontro na
 * agenda, conteúdo (produção, publicação e métricas) e metas.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
});

const uid = () => Date.now().toString(36).slice(-5);

async function dragTo(page: Page, card: ReturnType<Page["locator"]>, target: ReturnType<Page["locator"]>, path: string) {
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 20, from!.y + 20, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 80, { steps: 15 });
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === path);
  await page.mouse.up();
  expect((await saved).status()).toBe(200);
}

test("CRM: lead percorre o funil, recebe histórico e vira venda + mentorado", async ({ page }) => {
  const name = `Carla ${uid()}`;
  await page.goto("/mentoria/crm");
  await page.getByRole("button", { name: "Novo lead", exact: true }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome", { exact: true }).fill(name);
  await d.getByLabel("Origem").fill("Instagram");
  await d.getByLabel("Valor potencial").fill("3.000,00");
  await d.getByLabel("Próxima ação", { exact: true }).fill("Enviar proposta");
  await d.getByRole("button", { name: "Criar lead" }).click();
  await expect(page.getByText("Lead criado.")).toBeVisible();

  const card = page.locator(`[data-column="Novo lead"] [data-card="${name}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText("R$ 3.000,00");

  // Arrasta para "Qualificação"
  await dragTo(page, card, page.locator('[data-column="Qualificação"]'), "/mentoria/crm");
  await expect(page.locator(`[data-column="Qualificação"] [data-card="${name}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-column="Qualificação"] [data-card="${name}"]`)).toBeVisible();

  // Abre e registra um contato
  await page.locator(`[data-card="${name}"]`).click();
  const lead = page.getByRole("dialog", { name });
  await lead.getByRole("tab", { name: /Histórico/ }).click();
  await lead.getByLabel("Tipo de registro").selectOption("CALL");
  await lead.getByLabel("Registro", { exact: true }).fill("Conversa sobre objetivos");
  await lead.getByRole("button", { name: "Registrar", exact: true }).click();
  const history = lead.getByTestId("lead-history");
  await expect(history).toContainText("Conversa sobre objetivos");
  await expect(history).toContainText("Novo lead → Qualificação");

  // Converte em venda parcelada e cadastra o mentorado
  await lead.getByRole("button", { name: "Registrar venda" }).click();
  const sale = page.getByRole("dialog", { name: /Registrar venda/ });
  await sale.getByLabel("Descrição").fill("Mentoria individual");
  await expect(sale.getByLabel("Valor total")).toHaveValue("3.000,00");
  await sale.getByLabel("Pagamento").selectOption("INSTALLMENTS");
  await sale.getByLabel("Parcelas").fill("3");
  await expect(sale.getByText(/1ª R\$\s1\.000,00/)).toBeVisible();
  await expect(sale.getByLabel("Cadastrar como mentorado")).toBeChecked();
  await sale.getByRole("button", { name: "Confirmar venda" }).click();
  await expect(page.getByText("Venda registrada e mentorado cadastrado.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(`[data-column="Venda realizada"] [data-card="${name}"]`)).toContainText("Mentorado");

  // A venda está no financeiro, com as 3 parcelas
  await page.goto(`/financas/mentoria?aba=vendas&q=${encodeURIComponent(name)}`);
  const row = page.locator(`[data-sale="${name}"]`);
  await expect(row).toContainText("R$ 3.000,00");

  // E o mentorado tem a ficha com a venda e a linha do tempo
  await page.goto("/mentoria/mentorados");
  const href = await page.locator(`[data-mentee="${name}"]`).getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByTestId("mentee-sales")).toContainText("Mentoria individual");
  await expect(page.getByTestId("mentee-sales")).toContainText("1ª");
  await expect(page.getByTestId("timeline")).toContainText("Início da mentoria");
});

test("mentorado: encontro na agenda (com verificação de conflito), meta e realização", async ({ page }) => {
  const name = `Fernanda ${uid()}`;
  await page.goto("/mentoria/mentorados?novo=1");
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome", { exact: true }).fill(name);
  await d.getByLabel("E-mail").fill("fernanda@exemplo.com");
  await d.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const day = ymdSP(9);
  const schedule = async () => {
    await page.getByRole("button", { name: "Agendar encontro" }).click();
    const s = page.getByRole("dialog");
    await s.getByLabel("Data").fill(day);
    await s.getByLabel("Horário").fill("22:10");
    await expect(s.getByLabel("Adicionar à agenda")).toBeChecked();
    await s.getByRole("button", { name: "Agendar", exact: true }).click();
  };
  await schedule();
  // Em execuções repetidas pode já existir algo no horário: o aviso de conflito aparece
  const conflict = page.getByRole("heading", { name: "Conflito de horário" });
  const ok = page.getByText("Encontro agendado e adicionado à agenda.");
  await expect(conflict.or(ok)).toBeVisible();
  if (await conflict.isVisible()) await page.getByRole("button", { name: "Salvar mesmo assim" }).click();
  await expect(ok).toBeVisible();

  // Segundo encontro no mesmo horário: sempre conflita com o primeiro
  await schedule();
  await expect(conflict).toBeVisible();
  await expect(page.getByTestId("conflicts")).toContainText(`Mentoria · ${name}`);
  await page.getByRole("button", { name: "Escolher outro horário" }).click();
  await page.getByRole("dialog").getByLabel("Horário").fill("08:05");
  await page.getByRole("dialog").getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(ok).toBeVisible();

  const sessions = page.getByTestId("sessions");
  await expect(sessions.locator('[data-session="SCHEDULED"]')).toHaveCount(2);

  // O compromisso foi criado na agenda (a busca global encontra o evento)
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Buscar tarefas, compromissos, anotações ou páginas…").fill(`Mentoria · ${name}`);
  await expect(page.getByRole("option", { name: new RegExp(`Mentoria · ${name}`) }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Marca o primeiro como realizado
  await sessions.getByRole("button", { name: "Editar encontro" }).first().click();
  const e = page.getByRole("dialog");
  await e.getByLabel("Status").selectOption("DONE");
  await e.getByLabel("Resumo").fill("Plano de 90 dias definido");
  await e.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("timeline")).toContainText("Encontro realizado");

  // Meta individual
  await page.getByLabel("Nova meta do mentorado").fill("Primeira venda");
  await page.getByTestId("mentee-goals").getByRole("button", { name: "Adicionar" }).click();
  await page.getByLabel("Concluir Primeira venda").check();
  await expect(page.getByTestId("timeline")).toContainText("Meta atingida");
});

test("conteúdo: produção, publicação, métricas e relatório por formato", async ({ page }) => {
  const title = `Reel 3 erros ${uid()}`;
  await page.goto("/conteudo");
  await page.getByRole("button", { name: "Novo conteúdo", exact: true }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Título", { exact: true }).fill(title);
  await d.getByLabel("Formato").selectOption("REELS");
  await d.getByLabel("Data de gravação").fill(ymdSP(2));
  await d.getByLabel("Horário da gravação").fill("09:30");
  await d.getByLabel("Gancho").fill("Você está cometendo esses 3 erros?");
  await d.getByRole("button", { name: "Criar conteúdo" }).click();
  await expect(page.getByText("Conteúdo criado.")).toBeVisible();
  const card = page.locator(`[data-column="Ideia"] [data-card="${title}"]`);
  await expect(card).toContainText("Gravação");

  // Calendário editorial mostra a gravação
  await page.goto(`/conteudo?aba=calendario&mes=${ymdSP(2).slice(0, 7)}`);
  await expect(page.locator(`[data-day="${ymdSP(2)}"]`)).toContainText(title);

  // Publica (mudança explícita de etapa) e registra métricas
  await page.goto("/conteudo");
  await page.locator(`[data-card="${title}"]`).click();
  const item = page.getByRole("dialog", { name: title });
  await item.getByLabel("Etapa").selectOption({ label: "Publicado" });
  await item.getByLabel("Link publicado").fill("https://instagram.com/reel/abc123");
  await item.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Conteúdo salvo.")).toBeVisible();
  await expect(item.getByText(/Publicado em/)).toBeVisible();
  await item.getByRole("tab", { name: /Métricas/ }).click();
  await item.getByLabel("Alcance").fill("2000");
  await item.getByLabel("Curtidas").fill("150");
  await item.getByLabel("Comentários").fill("20");
  await item.getByLabel("Compartilhamentos").fill("10");
  await item.getByLabel("Salvamentos").fill("20");
  await item.getByRole("button", { name: "Salvar métricas" }).click();
  await expect(item.getByTestId("metrics-table")).toContainText("10%");
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-column="Publicado"] [data-card="${title}"]`)).toBeVisible();

  // Relatório do mês: aparece entre os publicados e na comparação de formatos
  await page.goto("/conteudo?aba=relatorio");
  await expect(page.locator("main")).toContainText(title);
  await expect(page.getByTestId("format-comparison").locator('[data-format="REELS"]')).toBeVisible();
});

test("perfil e referência: números manuais e ideia a partir de referência", async ({ page }) => {
  const user = `gabi${uid()}`;
  await page.goto("/conteudo?aba=perfis");
  await page.getByRole("button", { name: "Cadastrar perfil" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome do perfil").fill("Perfil teste");
  await d.getByLabel("Usuário (@)").fill(`@${user}`);
  await d.getByLabel("Meta de posts por semana").fill("3");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Perfil criado.")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`@${user}`) }).click();
  await expect(page.getByRole("heading", { name: `@${user}` })).toBeVisible();

  await page.getByLabel("Data", { exact: true }).fill(ymdSP(-3));
  await page.getByLabel("Seguidores", { exact: true }).fill("1.000");
  await page.getByRole("button", { name: "Registrar números" }).click();
  await expect(page.getByTestId("snapshots")).toContainText("1.000");
  await page.getByLabel("Data", { exact: true }).fill(ymdSP(0));
  await page.getByLabel("Seguidores", { exact: true }).fill("1.120");
  await page.getByRole("button", { name: "Registrar números" }).click();
  await expect(page.getByLabel("Indicadores do perfil")).toContainText("+120");

  const theme = `Rotina ${uid()}`;
  await page.goto("/conteudo?aba=referencias");
  await page.getByRole("button", { name: "Nova referência" }).first().click();
  const r = page.getByRole("dialog");
  await r.getByLabel("Link").fill("https://instagram.com/reel/xyz");
  await r.getByLabel("Tema").fill(theme);
  await r.getByLabel("Etiquetas").fill("rotina, estudos");
  await r.getByRole("button", { name: "Salvar" }).click();
  const ref = page.locator(`[data-reference="${theme}"]`);
  await expect(ref).toContainText("#rotina");
  await ref.getByRole("button", { name: "Virar conteúdo" }).click();
  await expect(page.getByRole("dialog", { name: theme })).toBeVisible();
});

test("metas: manual com histórico e automática com dados reais; busca global", async ({ page }) => {
  const manual = `Ler livros ${uid()}`;
  await page.goto("/metas?nova=1");
  const d = page.getByRole("dialog");
  await d.getByLabel("Título").fill(manual);
  await d.getByLabel("Ambiente").selectOption({ label: "Pessoal Gabriela" });
  await d.getByLabel("Tipo").selectOption("PERSONAL");
  await d.getByLabel("Horizonte").selectOption("YEARLY");
  await d.getByLabel("Unidade").fill("livros");
  await d.getByLabel("Valor-alvo").fill("12");
  await d.getByRole("button", { name: "Criar meta" }).click();
  await expect(page.getByText("Meta criada.")).toBeVisible();
  const detail = page.getByRole("dialog", { name: manual });
  await detail.getByLabel("Novo valor").fill("3");
  await detail.getByRole("button", { name: "Registrar" }).click();
  await expect(detail.getByTestId("goal-progress")).toContainText("3 livros");
  await expect(detail.getByTestId("goal-progress")).toContainText("25% concluído");
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-goal="${manual}"]`)).toContainText("25% concluído");

  const auto = `Faturamento ${uid()}`;
  await page.getByRole("button", { name: "Nova meta" }).click();
  const a = page.getByRole("dialog");
  await a.getByLabel("Título").fill(auto);
  await a.getByLabel("Ambiente").selectOption({ label: "Trabalho Mentoria" });
  await a.getByLabel("Cálculo").selectOption("mentoria.revenue");
  await a.getByLabel("Valor-alvo").fill("100000");
  await a.getByRole("button", { name: "Criar meta" }).click();
  const autoDetail = page.getByRole("dialog", { name: auto });
  // As vendas deste mês (registradas nos testes anteriores) já contam
  await expect(autoDetail.getByTestId("goal-progress")).toContainText("Faturamento da Mentoria, calculado com os dados do app");
  await expect(autoDetail.getByTestId("goal-progress")).not.toContainText("R$ 0,00");
  await page.keyboard.press("Escape");

  // Dashboard mostra o cartão de metas
  await page.goto("/");
  await expect(page.locator('[data-widget="goals"]')).toContainText("Metas");

  // Busca global encontra lead, mentorado e meta
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Buscar tarefas, compromissos, anotações ou páginas…").fill("Carla");
  await expect(page.getByRole("dialog")).toContainText("Leads");
  await expect(page.getByRole("dialog")).toContainText("Mentorados");
  await page.getByPlaceholder("Buscar tarefas, compromissos, anotações ou páginas…").fill(manual);
  await expect(page.getByRole("option", { name: new RegExp(manual) })).toBeVisible();
});
