import { expect, test } from "./diagnostics";
import { login, ymdSP } from "./helpers";

/**
 * Fase 2: tarefas (Kanban), agenda com conflito, anotações com salvamento
 * automático, hábitos, notificações e busca global. Depende da conta criada
 * em foundation.spec.ts.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("tarefas: criar, arrastar no Kanban, detalhar e concluir", async ({ page }) => {
  await page.goto("/tarefas");
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  const newDialog = page.getByRole("dialog");
  await newDialog.getByLabel("Título", { exact: true }).fill("Roteiro Reels de lançamento");
  await newDialog.getByLabel("Prioridade", { exact: true }).selectOption("HIGH");
  await newDialog.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByText("Tarefa criada.")).toBeVisible();

  const todo = page.locator('[data-column="A fazer"]');
  const doing = page.locator('[data-column="Em andamento"]');
  const card = todo.locator('[data-task-title="Roteiro Reels de lançamento"]');
  await expect(card).toBeVisible();

  // Arrasta para "Em andamento"
  const from = await card.boundingBox();
  const to = await doing.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 20, from!.y + 20, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 80, { steps: 15 });
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/tarefas");
  await page.mouse.up();
  await (await saved).finished();
  await expect(doing.locator('[data-task-title="Roteiro Reels de lançamento"]')).toBeVisible();

  // Persistiu no servidor
  await page.reload();
  await expect(page.locator('[data-column="Em andamento"] [data-task-title="Roteiro Reels de lançamento"]')).toBeVisible();

  // Abre, adiciona checklist e vê o histórico com a data de início
  await page.getByRole("button", { name: "Roteiro Reels de lançamento", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Editar tarefa" })).toBeVisible();
  await dialog.getByLabel("Novo item da checklist").fill("Escrever gancho");
  await dialog.getByLabel("Novo item da checklist").press("Enter");
  await expect(dialog.getByText("Escrever gancho")).toBeVisible();
  await expect(dialog.getByText(/Iniciada em/)).toBeVisible();
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.getByText("Tarefa concluída.").first()).toBeVisible();
  await expect(dialog.getByText(/Concluída em/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Na lista, concluídas ficam fora por padrão
  await page.goto("/tarefas?view=lista");
  await expect(page.getByText("Roteiro Reels de lançamento")).toHaveCount(0);
  await page.goto("/tarefas?view=lista&concluidas=1");
  await expect(page.getByRole("button", { name: "Roteiro Reels de lançamento", exact: true })).toBeVisible();
});

test("agenda: conflito entre ambientes e linha do tempo", async ({ page }) => {
  const day = ymdSP(1);
  const create = async (title: string, ws: string, start: string, end: string) => {
    await page.getByRole("button", { name: "Novo compromisso" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Título", { exact: true }).fill(title);
    await d.getByLabel("Ambiente", { exact: true }).selectOption({ label: ws });
    await d.locator("#ev-start").fill(day);
    await d.getByLabel("Hora de início").fill(start);
    await d.locator("#ev-end").fill(day);
    await d.getByLabel("Hora de fim").fill(end);
    await d.getByRole("button", { name: "Criar compromisso" }).click();
  };

  await page.goto("/agenda?v=timeline");
  await create("Gravação TURBO", "TURBO Digital", "09:00", "10:00");
  await expect(page.getByText("Compromisso criado.").first()).toBeVisible();

  await create("Sessão de mentoria", "Trabalho Mentoria", "09:30", "10:30");
  const conflicts = page.getByTestId("conflicts");
  await expect(page.getByRole("heading", { name: "Conflito de horário" })).toBeVisible();
  await expect(conflicts).toContainText("Gravação TURBO");
  await page.getByRole("button", { name: "Salvar mesmo assim" }).click();
  await expect(page.getByRole("heading", { name: "Conflito de horário" })).toHaveCount(0);

  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText("Gravação TURBO");
  await expect(timeline).toContainText("Sessão de mentoria");
  await expect(timeline.getByText("Sobreposição")).toHaveCount(2);

  // Visão semanal carrega o calendário
  await page.getByRole("tab", { name: "Semana" }).click();
  await expect(page.getByTestId("calendar")).toBeVisible();
});

test("anotações: salvamento automático, recarregar e buscar", async ({ page }) => {
  await page.goto("/anotacoes");
  await page.getByRole("button", { name: "Nova", exact: true }).click();
  const title = page.getByLabel("Título da anotação");
  await expect(title).toBeVisible();
  await title.fill("Pauta reunião de marketing");
  await page.getByLabel("Conteúdo da anotação").click();
  await page.keyboard.type("Definir orçamento de tráfego para novembro");
  await expect(page.locator('[data-save-state="pending"], [data-save-state="saving"]')).toBeVisible();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByLabel("Título da anotação")).toHaveValue("Pauta reunião de marketing");
  await expect(page.getByLabel("Conteúdo da anotação")).toContainText("orçamento de tráfego");

  await page.getByLabel("Buscar anotações").fill("tráfego");
  await expect(page.getByRole("button", { name: /Pauta reunião de marketing/ })).toBeVisible();
});

test("hábitos: criar e marcar hoje", async ({ page }) => {
  await page.goto("/habitos?novo=1");
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome", { exact: true }).fill("Leitura");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Hábito criado.")).toBeVisible();
  const today = ymdSP(0).split("-").reverse().join("/");
  const toggle = page.getByRole("button", { name: `Leitura em ${today}: não feito` });
  await toggle.click();
  await expect(page.getByRole("button", { name: `Leitura em ${today}: feito` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: `Leitura em ${today}: feito` })).toBeVisible();
  await expect(page.getByText("Hoje: 1/1")).toBeVisible();
});

test("dashboard, notificações e busca global", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-widget="next-event"]')).toContainText("Gravação TURBO");
  await expect(page.locator('[data-widget="habits"]').getByRole("button", { name: "Leitura" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/notificacoes");
  await page.getByRole("button", { name: "Resumo de hoje" }).click();
  await expect(page.getByRole("heading", { name: "Compromissos de hoje" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hábitos de hoje" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Buscar tarefas, compromissos, anotações ou páginas…").fill("Pauta reunião");
  await expect(page.getByRole("option", { name: /Pauta reunião de marketing/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/anotacoes\?n=/);
  await expect(page.getByLabel("Título da anotação")).toHaveValue("Pauta reunião de marketing");
});
