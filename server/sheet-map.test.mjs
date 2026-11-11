import { test } from "node:test";
import assert from "node:assert/strict";
import { changedFields, isMine, mapPriority, mapStatus, parseDate, taskFieldsFromRow } from "./sheet-map.mjs";

test("prioridade e status", () => {
  assert.equal(mapPriority("Alta"), "HIGH");
  assert.equal(mapPriority("média"), "MEDIUM");
  assert.equal(mapPriority("URGENTE"), "URGENT");
  assert.equal(mapPriority("baixa"), "LOW");
  assert.equal(mapPriority(""), "MEDIUM");
  assert.equal(mapPriority("A"), "HIGH");
  assert.equal(mapPriority("b"), "MEDIUM");
  assert.equal(mapPriority("C"), "LOW");
  assert.equal(mapStatus("Pendente"), "TODO");
  assert.equal(mapStatus("Respondido"), "REVIEW");
  assert.equal(mapStatus("Resolvido"), "DONE");
  assert.equal(mapStatus(""), "TODO");
  assert.equal(mapStatus("Não iniciada"), "TODO");
  assert.equal(mapStatus("Em andamento"), "IN_PROGRESS");
  assert.equal(mapStatus("Concluída"), "DONE");
});

test("datas", () => {
  const hoje = new Date("2026-11-10T12:00:00Z");
  assert.equal(parseDate("2026-11-12", hoje), "2026-11-12");
  assert.equal(parseDate("12/11/2026", hoje), "2026-11-12");
  assert.equal(parseDate("12/11/26", hoje), "2026-11-12");
  assert.equal(parseDate("5/1", hoje), "2026-01-05");
  assert.equal(parseDate("31/02/2026", hoje), null);
  assert.equal(parseDate("amanhã", hoje), null);
  assert.equal(parseDate("", hoje), null);
});

test("só linhas da Gabriela", () => {
  assert.equal(isMine({ "Proprietário": "Gabriela" }), true);
  assert.equal(isMine({ "Proprietário": " gabriela " }), true);
  assert.equal(isMine({ "Proprietário": "" }), true);
  assert.equal(isMine({ "Proprietário": "Noemi" }), false);
  assert.equal(isMine({ "Proprietário": "Gabriela Benfica" }), true);
  assert.equal(isMine({ "Proprietário": "Kayke Eduardo Nunes Macedo" }), false);
});

test("linha vira tarefa", () => {
  const f = taskFieldsFromRow({ Tarefa: "Gravar reels de case", Prioridade: "Alta", "Proprietário": "Gabriela", Status: "Pendente", "Data gravação": "2026-11-12", "Data postagem": "2026-11-14", Fase: "Fabricado", Produtos: "Criativos", "Observações": "Levar o produto" });
  assert.deepEqual({ ...f, description: undefined }, { title: "Gravar reels de case", priority: "HIGH", status: "TODO", assignee: "Gabriela", start_date: "2026-11-12", due_date: "2026-11-14", description: undefined });
  assert.match(f.description, /Fase: Fabricado\nProdutos: Criativos\nData de gravação: 12\/11\/2026\nData de postagem: 14\/11\/2026\n\nLevar o produto/);
  const so = taskFieldsFromRow({ Tarefa: "x", "Data postagem": "2026-11-14" });
  assert.equal(so.start_date, "2026-11-14");
  assert.equal(so.due_date, "2026-11-14");
});

test("só o que mudou na planilha é aplicado", () => {
  const a = taskFieldsFromRow({ Tarefa: "x", Status: "Pendente" });
  const b = taskFieldsFromRow({ Tarefa: "x", Status: "Resolvido" });
  assert.deepEqual(changedFields(a, a), {});
  assert.deepEqual(changedFields(a, b), { status: "DONE" });
  assert.deepEqual(changedFields(a, { ...a, title: null }), {});
});

import { matchContentStatus, parseHour, profileHint, reelFields, sheetKind, sourceOf, spInstant, storyFields, trendFields } from "./sheet-map.mjs";

test("abas reconhecidas", () => {
  assert.equal(sheetKind("Tarefas"), "tasks");
  assert.equal(sheetKind("Stories"), "stories");
  assert.equal(sheetKind("Reels"), "reels");
  assert.equal(sheetKind("Tendências"), "trends");
  assert.equal(sheetKind("Tendencias"), "trends");
  assert.equal(sheetKind("Perfil"), null);
});

test("linha de Stories vira conteúdo", () => {
  const f = storyFields({ "Data da postagem": "2026-11-16", "Conteúdo": "TURBO · 15h · Marketing fala · 4 frames", Status: "Roteirizado", Arquivo: "Stories_2026-11-16_segunda.pdf", "Proprietário": "Gabriela Benfica" });
  assert.equal(f.title, "TURBO · 15h · Marketing fala · 4 frames");
  assert.equal(f.format, "STORIES");
  assert.equal(f.publish_date, "2026-11-16T18:00:00.000Z"); // 15h em São Paulo
  assert.equal(f.profile, "turbo");
  assert.equal(f.owner, "Gabriela Benfica");
  assert.match(f.notes, /^Arquivo: Stories_2026-11-16_segunda\.pdf\n\nVindo da planilha/);
  assert.equal(parseHour("às 9h30 no story"), "09:30");
  assert.equal(parseHour("sem hora"), null);
  assert.equal(spInstant(null), null);
  assert.equal(profileHint("SAMUEL · bastidores"), "samuel");
});

test("linha de Reels vira conteúdo", () => {
  const f = reelFields({ "Conteúdo": "Case da fábrica de móveis", Tipo: "Case", Detalhes: "Gravar na loja", Arquivo: "https://drive.google.com/x" });
  assert.equal(f.format, "REELS");
  assert.equal(f.publish_date, null);
  assert.equal(f.notes.split("\n")[0], "Tipo: Case");
  assert.match(f.notes, /Gravar na loja\nArquivo: https:\/\/drive\.google\.com\/x/);
});

test("status da planilha → etapa do conteúdo", () => {
  const st = [{ name: "Ideia" }, { name: "Roteirização" }, { name: "Gravado" }, { name: "Em edição" }, { name: "Publicado", is_published: true }];
  assert.equal(matchContentStatus("Roteirizado", st).name, "Roteirização");
  assert.equal(matchContentStatus("gravado", st).name, "Gravado");
  assert.equal(matchContentStatus("Postado", st).name, "Publicado");
  assert.equal(matchContentStatus("Em edição", st).name, "Em edição");
  assert.equal(matchContentStatus("", st), null);
  assert.equal(matchContentStatus("qualquer", st), null);
});

test("linha de Tendências vira referência", () => {
  const f = trendFields({ "Conteúdo": "Guia de Reels 2026 (Metricool)", Arquivo: "https://metricool.com/pt/guia-reels-instagram/", Detalhes: "Fatores de ranqueamento.", Status: "Pendente" });
  assert.deepEqual(f, { theme: "Guia de Reels 2026 (Metricool)", url: "https://metricool.com/pt/guia-reels-instagram/", creator: "Metricool", format: "Tendência", notes: "Fatores de ranqueamento.", tags: ["tendência", "Pendente"] });
  assert.equal(sourceOf("Anúncio de concorrente: Agência Value"), "Agência Value");
  assert.equal(trendFields({ "Conteúdo": "x", Arquivo: "relatorio.pdf" }).url, null);
  assert.equal(trendFields({ "Conteúdo": "x", Arquivo: "relatorio.pdf" }).notes, "Arquivo: relatorio.pdf");
});
