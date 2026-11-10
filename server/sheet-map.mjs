// Regras puras para transformar uma linha da aba "Tarefas" da planilha em uma tarefa do Gabi OS.
// Sem acesso a banco: testadas em sheet-map.test.mjs.

/** Minúsculas, sem acentos e sem espaços nas pontas. */
export const norm = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const clean = (v) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** "Alta", "média", "URGENTE"… → código usado no app. Vazio ou desconhecido → MEDIUM. */
export function mapPriority(v) {
  const p = norm(v);
  // Escala por letra usada na planilha: A = alta, B = média, C = baixa
  if (p === "a") return "HIGH";
  if (p === "b") return "MEDIUM";
  if (p === "c") return "LOW";
  if (p.startsWith("urg")) return "URGENT";
  if (p.startsWith("alt") || p === "high") return "HIGH";
  if (p.startsWith("baix") || p === "low") return "LOW";
  return "MEDIUM";
}

/** Status da planilha → categoria da coluna do quadro de tarefas. */
export function mapStatus(v) {
  const s = norm(v);
  if (s.startsWith("resolv") || s.startsWith("conclu") || s === "feito") return "DONE";
  if (s.startsWith("respond")) return "REVIEW";
  if (s.includes("andamento") || s.startsWith("fazendo") || s.startsWith("iniciad")) return "IN_PROGRESS";
  return "TODO";
}

/**
 * Datas chegam como "2026-11-10" (o script da planilha já manda assim) ou como texto
 * "10/11/2026" / "10/11/26" / "10/11" (ano atual). Qualquer outra coisa vira null.
 */
export function parseDate(v, today = new Date()) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? +m[3] : today.getUTCFullYear();
    if (y < 100) y += 2000;
    return valid(y, +m[2], +m[1]);
  }
  return null;
}
function valid(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Só as linhas da Gabriela (ou sem proprietário) entram. */
export function isMine(row) {
  const owner = norm(row["Proprietário"] ?? row.Proprietario);
  return !owner || owner === "gabriela" || owner === "gabi" || owner.startsWith("gabriela ");
}

/** Campos da tarefa que vêm da planilha (comparados com a última leitura para saber o que mudou). */
export function taskFieldsFromRow(row, today) {
  const gravacao = parseDate(row["Data gravação"] ?? row["Data gravacao"], today);
  const postagem = parseDate(row["Data postagem"], today);
  const extras = [
    ["Fase", clean(row.Fase)],
    ["Produtos", clean(row.Produtos)],
    ["Data de gravação", gravacao ? gravacao.split("-").reverse().join("/") : null],
    ["Data de postagem", postagem ? postagem.split("-").reverse().join("/") : null],
  ].filter(([, v]) => v);
  const obs = clean(row["Observações"] ?? row.Observacoes);
  const description = [
    ...extras.map(([k, v]) => `${k}: ${v}`),
    ...(obs ? ["", obs] : []),
    "",
    "Vinda da planilha “Resultados Marketing — Turbo” (aba Tarefas).",
  ]
    .join("\n")
    .replace(/^\n+/, "");
  return {
    title: clean(row.Tarefa),
    priority: mapPriority(row.Prioridade),
    status: mapStatus(row.Status),
    assignee: clean(row["Proprietário"] ?? row.Proprietario) ?? "Gabriela",
    start_date: gravacao ?? postagem,
    due_date: postagem ?? gravacao,
    description,
  };
}

/**
 * O que gravar numa tarefa já existente: só os campos que mudaram NA PLANILHA desde a última
 * sincronização. Assim, o que você muda no app (ex.: arrastar para "Concluído") não é desfeito
 * pela planilha, a não ser que a própria planilha mude aquele campo.
 */
export function changedFields(previous, current) {
  const out = {};
  for (const k of Object.keys(current)) {
    if (current[k] === null && k === "title") continue; // título apagado na planilha não apaga a tarefa
    if ((previous?.[k] ?? null) !== (current[k] ?? null)) out[k] = current[k];
  }
  return out;
}
