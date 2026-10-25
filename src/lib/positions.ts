/**
 * Ordem fracionária para listas reordenáveis (Kanban).
 * Recebe as posições dos vizinhos (já sem o item movido), na ordem, e o índice
 * de destino; devolve a nova posição ou `null` quando é preciso renumerar.
 */
export const POSITION_GAP = 1024;

export function positionAt(siblings: number[], index: number): number | null {
  const i = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[i - 1];
  const after = siblings[i];
  if (before === undefined && after === undefined) return POSITION_GAP;
  if (before === undefined) return after! - POSITION_GAP;
  if (after === undefined) return before + POSITION_GAP;
  if (after - before < 1e-6) return null;
  return (before + after) / 2;
}
