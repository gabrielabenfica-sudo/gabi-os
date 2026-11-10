// Regras puras do quadro (tarefas e conteúdo): onde um card cai e que posições gravar.
// Os quadros mostram a maior posição no topo (ordem decrescente).

export type Positioned = { id: string; position: number };

/**
 * `column`: cards da coluna de destino, na ordem em que aparecem (pode incluir o próprio card,
 * se ele já estava nessa coluna). `index`: posição de soltura contada sobre essa mesma lista.
 * Devolve as novas posições (só as que mudaram, e sempre a do card movido), do topo para baixo.
 */
export function dropPositions(column: Positioned[], movedId: string, index: number, moved?: Positioned) {
  const from = column.findIndex((c) => c.id === movedId);
  const card = from >= 0 ? column[from] : moved;
  if (!card) return [];
  const rest = column.filter((c) => c.id !== movedId);
  let at = from >= 0 && from < index ? index - 1 : index;
  at = Math.max(0, Math.min(rest.length, at));
  const ordered = [...rest.slice(0, at), card, ...rest.slice(at)];
  // Topo recebe o maior número; renumera só a coluna (números pequenos, cabem em integer)
  const n = ordered.length;
  return ordered
    .map((c, i) => ({ id: c.id, position: n - i }))
    .filter((c) => c.id === movedId || column.find((o) => o.id === c.id)?.position !== c.position);
}

/** Próxima posição para um card novo no topo da coluna. */
export const topPosition = (column: Positioned[]) => column.reduce((m, c) => Math.max(m, c.position ?? 0), 0) + 1;
