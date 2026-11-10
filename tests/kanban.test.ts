import { test } from "node:test";
import assert from "node:assert/strict";
import { dropPositions, topPosition } from "../src/lib/kanban.ts";
const col = [{ id: "a", position: 30 }, { id: "b", position: 20 }, { id: "c", position: 10 }];
const order = (column, res) => { const m = new Map(column.map((c) => [c.id, c.position])); res.forEach((r) => m.set(r.id, r.position)); return [...m.entries()].sort((x, y) => y[1] - x[1]).map((x) => x[0]); };
test("vindo de outra coluna, solto no meio", () => {
  const res = dropPositions(col, "x", 1, { id: "x", position: 99 });
  assert.deepEqual(order([...col, { id: "x", position: 99 }], res), ["a", "x", "b", "c"]);
});
test("mesma coluna, desce do topo para o fim", () => {
  const res = dropPositions(col, "a", 3);
  assert.deepEqual(order(col, res), ["b", "c", "a"]);
});
test("mesma coluna, sobe para o topo", () => {
  assert.deepEqual(order(col, dropPositions(col, "c", 0)), ["c", "a", "b"]);
});
test("solto no mesmo lugar não muda a ordem", () => {
  assert.deepEqual(order(col, dropPositions(col, "b", 1)), ["a", "b", "c"]);
  assert.deepEqual(order(col, dropPositions(col, "b", 2)), ["a", "b", "c"]);
});
test("coluna vazia e topo", () => {
  assert.deepEqual(dropPositions([], "x", 0, { id: "x", position: 5 }), [{ id: "x", position: 1 }]);
  assert.equal(topPosition(col), 31);
  assert.equal(topPosition([]), 1);
});
test("posições ficam pequenas (cabem em integer)", () => {
  const big = [{ id: "a", position: 1762800000000 }, { id: "b", position: 5 }];
  const res = dropPositions(big, "b", 0);
  assert.ok(res.every((r) => r.position <= 2));
});
