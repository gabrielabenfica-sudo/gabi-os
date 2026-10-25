import { describe, expect, it } from "vitest";
import { positionAt, POSITION_GAP } from "./positions";

describe("positionAt", () => {
  it("calcula posições no início, meio e fim", () => {
    expect(positionAt([], 0)).toBe(POSITION_GAP);
    expect(positionAt([1024, 2048], 0)).toBe(0);
    expect(positionAt([1024, 2048], 1)).toBe(1536);
    expect(positionAt([1024, 2048], 9)).toBe(3072);
  });
  it("pede renumeração quando não há espaço", () => {
    expect(positionAt([1, 1 + 1e-9], 1)).toBeNull();
  });
});
