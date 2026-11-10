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
