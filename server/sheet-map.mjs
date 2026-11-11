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

// ── Abas de conteúdo (Stories, Reels) e de referências (Tendências) ─────────────────────────

/** Nome da aba sem acento/caixa → tipo de sincronização. */
export function sheetKind(name) {
  const n = norm(name);
  if (n === "tarefas") return "tasks";
  if (n === "stories" || n === "story") return "stories";
  if (n === "reels") return "reels";
  if (n.startsWith("tendenc")) return "trends";
  return null;
}

/** "TURBO · 15h · ..." → 15:00; "às 9h30" → 09:30. Sem horário → null. */
export function parseHour(text) {
  const m = String(text ?? "").match(/(?:^|[\s·,(])(\d{1,2})h(\d{2})?(?=$|[\s·,)])/i);
  if (!m) return null;
  const h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Instante ISO para uma data (YYYY-MM-DD) e hora local de São Paulo (UTC−3, sem horário de verão). */
export function spInstant(ymd, hhmm) {
  if (!ymd) return null;
  return new Date(`${ymd}T${hhmm ?? "12:00"}:00-03:00`).toISOString();
}

/** Qual perfil do Instagram: pelo começo do texto (TURBO / SAMUEL / GABI). */
export function profileHint(text) {
  const n = norm(text);
  if (/^(turbo|@?turbodigital)/.test(n)) return "turbo";
  if (/^(samuel|sam\b|@?eu\.samuel)/.test(n)) return "samuel";
  if (/^(gabi|gabriela)/.test(n)) return "gabi";
  return null;
}

/** Status da planilha → etapa do quadro de conteúdo (pelo nome; ex.: Roteirizado → Roteirização). */
export function matchContentStatus(value, statuses) {
  const v = norm(value);
  if (!v) return null;
  const byName = statuses.map((s) => ({ s, n: norm(s.name) }));
  const exact = byName.find((x) => x.n === v);
  if (exact) return exact.s;
  const stem = v.slice(0, Math.min(7, v.length));
  const pref = byName.find((x) => x.n.startsWith(stem) || v.startsWith(x.n));
  if (pref) return pref.s;
  if (v.startsWith("public") || v === "postado") return statuses.find((s) => s.is_published) ?? null;
  return null;
}

const fileLine = (v) => {
  const s = clean(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? `Arquivo: ${s}` : `Arquivo: ${s}`;
};
const origem = (aba) => `Vindo da planilha “Resultados Marketing — Turbo” (aba ${aba}).`;

/** Linha da aba Stories → campos do conteúdo. */
export function storyFields(row, today) {
  const texto = clean(row["Conteúdo"] ?? row.Conteudo);
  const data = parseDate(row["Data da postagem"] ?? row["Data postagem"], today);
  const hora = parseHour(texto);
  return {
    title: texto,
    format: "STORIES",
    status: clean(row.Status),
    owner: clean(row["Proprietário"] ?? row.Proprietario),
    publish_date: spInstant(data, hora),
    profile: profileHint(texto),
    notes: [fileLine(row.Arquivo), "", origem("Stories")].filter((x) => x !== null).join("\n").replace(/^\n+/, ""),
  };
}

/** Linha da aba Reels → campos do conteúdo. */
export function reelFields(row) {
  const texto = clean(row["Conteúdo"] ?? row.Conteudo);
  const tipo = clean(row.Tipo);
  const detalhes = clean(row.Detalhes);
  return {
    title: texto,
    format: "REELS",
    status: clean(row.Status),
    owner: clean(row["Proprietário"] ?? row.Proprietario),
    publish_date: spInstant(parseDate(row["Data da postagem"] ?? row["Data postagem"]), parseHour(texto)),
    profile: profileHint(texto) ?? profileHint(tipo),
    notes: [tipo ? `Tipo: ${tipo}` : null, detalhes, fileLine(row.Arquivo), "", origem("Reels")]
      .filter((x) => x !== null)
      .join("\n")
      .replace(/^\n+/, ""),
  };
}

/** "Guia de Reels 2026 (Metricool)" → Metricool; "Anúncio de concorrente: Agência Value" → Agência Value. */
export function sourceOf(title) {
  const t = clean(title) ?? "";
  const par = t.match(/\(([^()]+)\)\s*$/);
  if (par) return par[1].trim();
  const conc = t.match(/concorrente:\s*(.+)$/i);
  if (conc) return conc[1].trim();
  return null;
}

/** Linha da aba Tendências → campos da referência. */
export function trendFields(row) {
  const titulo = clean(row["Conteúdo"] ?? row.Conteudo);
  const link = clean(row.Arquivo ?? row.Link);
  const status = clean(row.Status);
  const isUrl = link && /^https?:\/\//i.test(link);
  return {
    theme: titulo,
    url: isUrl ? link : null,
    creator: sourceOf(titulo),
    format: "Tendência",
    notes: [clean(row.Detalhes), link && !isUrl ? `Arquivo: ${link}` : null].filter(Boolean).join("\n") || null,
    tags: ["tendência", ...(status ? [status] : [])],
  };
}
