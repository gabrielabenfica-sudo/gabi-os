/**
 * Leitura de extratos bancários (OFX e CSV) para importação.
 * Puro: sem banco, sem rede. Valores sempre em centavos inteiros (sinal: + entrada, − saída).
 */

export type ParsedRow = {
  /** Linha/ordem no arquivo (1-based) */
  line: number;
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  /** FITID do OFX ou hash estável da linha do CSV */
  externalId: string;
};

export type ParseResult = { rows: ParsedRow[]; errors: { line: number; message: string }[]; account?: string | null; currency?: string | null };

// ─── Valores e datas ───────────────────────────────────────────

/**
 * Converte "1.234,56", "-1234.56", "R$ 1.234,56", "(123,45)", "123,45 D" em centavos.
 * Decide o separador decimal pelo último "." ou "," seguido de 1–2 dígitos.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\s*[Dd]$/.test(s) && !/\d[Dd]$/.test(s.replace(/\s/g, "x"))) {
    negative = true;
    s = s.replace(/\s*[Dd]$/, "");
  } else if (/\s+[Cc]$/.test(s)) {
    s = s.replace(/\s*[Cc]$/, "");
  }
  s = s.replace(/R\$|\s| /g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const m = s.match(/[.,](\d{1,2})$/);
  let intPart: string;
  let frac = "00";
  if (m) {
    intPart = s.slice(0, -m[0].length);
    frac = m[1]!.padEnd(2, "0");
  } else {
    intPart = s;
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || (!intPart && !m)) return null;
  const cents = Number(intPart || "0") * 100 + Number(frac);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

const pad = (n: number) => String(n).padStart(2, "0");
function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Aceita dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd e aaaammdd. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validYmd(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let y = +m[3]!;
    if (m[3]!.length === 2) y += y >= 70 ? 1900 : 2000;
    return validYmd(y, +m[2]!, +m[1]!);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return validYmd(+m[1]!, +m[2]!, +m[3]!);
  return null;
}

/** Hash curto e estável (FNV-1a 64 bits em hex) para identificar linhas de CSV. */
export function stableHash(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const ch of new TextEncoder().encode(text)) {
    h ^= BigInt(ch);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

const cleanText = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// ─── OFX (SGML 1.x e XML 2.x) ──────────────────────────────────

function tag(block: string, name: string): string | null {
  // Funciona com e sem tag de fechamento (OFX 1.x não fecha as folhas)
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1]!.trim() : null;
}

export function parseOfx(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: ParseResult["errors"] = [];
  if (!/<OFX>/i.test(text)) return { rows, errors: [{ line: 0, message: "Arquivo não parece ser OFX (falta a tag <OFX>)." }] };
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const seen = new Map<string, number>();
  blocks.forEach((raw, i) => {
    const block = raw.split(/<\/STMTTRN>/i)[0]!;
    const line = i + 1;
    const date = parseDate(tag(block, "DTPOSTED") ?? "");
    const amount = parseAmount(tag(block, "TRNAMT") ?? "");
    const desc = cleanText(tag(block, "MEMO") || tag(block, "NAME") || tag(block, "PAYEE") || "");
    if (!date) return errors.push({ line, message: "Data inválida (DTPOSTED)." });
    if (amount === null) return errors.push({ line, message: "Valor inválido (TRNAMT)." });
    if (amount === 0) return errors.push({ line, message: "Lançamento com valor zero ignorado." });
    let fitid = tag(block, "FITID");
    if (!fitid) fitid = `h:${stableHash(`${date}|${amount}|${desc}`)}`;
    // Alguns bancos repetem FITID dentro do mesmo arquivo: desambigua pela ocorrência
    const n = (seen.get(fitid) ?? 0) + 1;
    seen.set(fitid, n);
    rows.push({ line, date, description: desc || (amount > 0 ? "Crédito" : "Débito"), amountCents: amount, externalId: n > 1 ? `${fitid}#${n}` : fitid });
  });
  const acct = tag(text, "ACCTID");
  return { rows, errors, account: acct, currency: tag(text, "CURDEF") };
}

// ─── CSV ───────────────────────────────────────────────────────

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts = [";", ",", "\t", "|"].map((d) => [d, splitCsvLine(first, d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export type CsvMapping = {
  delimiter?: string;
  /** Índices das colunas (0-based) */
  date: number;
  description: number;
  /** Uma coluna com valor sinalizado… */
  amount?: number | null;
  /** …ou colunas separadas de débito e crédito */
  debit?: number | null;
  credit?: number | null;
  /** Primeira linha é cabeçalho */
  header: boolean;
  /** Inverter sinal (ex.: fatura de cartão em que compras vêm positivas) */
  invert?: boolean;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Sugere o mapeamento pelos nomes do cabeçalho (Data, Descrição/Histórico, Valor, Débito, Crédito). */
export function guessCsvMapping(text: string): { mapping: CsvMapping | null; headers: string[]; delimiter: string } {
  const delimiter = detectDelimiter(text);
  const first = (text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) ?? "");
  const headers = splitCsvLine(first, delimiter);
  const h = headers.map(norm);
  const find = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.startsWith(n)));
  const date = find("data", "date", "dt");
  const description = find("descricao", "historico", "lancamento", "description", "memo", "estabelecimento", "titulo");
  const amount = find("valor", "amount", "value", "quantia");
  const debit = find("debito", "saida", "debit");
  const credit = find("credito", "entrada", "credit");
  if (date < 0 || description < 0 || (amount < 0 && debit < 0 && credit < 0)) return { mapping: null, headers, delimiter };
  return {
    mapping: { delimiter, date, description, amount: amount >= 0 ? amount : null, debit: amount < 0 && debit >= 0 ? debit : null, credit: amount < 0 && credit >= 0 ? credit : null, header: true },
    headers,
    delimiter,
  };
}

export function parseCsv(text: string, mapping: CsvMapping): ParseResult {
  const delimiter = mapping.delimiter ?? detectDelimiter(text);
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const errors: ParseResult["errors"] = [];
  const seen = new Map<string, number>();
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim() || (mapping.header && idx === lines.findIndex((l) => l.trim()))) return;
    const cols = splitCsvLine(raw, delimiter);
    const date = parseDate(cols[mapping.date] ?? "");
    const description = cleanText(cols[mapping.description] ?? "");
    let amount: number | null;
    if (mapping.amount != null) amount = parseAmount(cols[mapping.amount] ?? "");
    else {
      const d = mapping.debit != null ? parseAmount(cols[mapping.debit] ?? "") : null;
      const c = mapping.credit != null ? parseAmount(cols[mapping.credit] ?? "") : null;
      amount = d === null && c === null ? null : (c ?? 0) - Math.abs(d ?? 0);
    }
    if (!date) {
      // Linhas de saldo/rodapé costumam não ter data: ignora em silêncio se também não houver valor
      if (amount !== null) errors.push({ line, message: `Data inválida: “${cols[mapping.date] ?? ""}”.` });
      return;
    }
    if (amount === null) return errors.push({ line, message: "Valor inválido." });
    if (amount === 0) return;
    if (mapping.invert) amount = -amount;
    if (/^saldo\b/i.test(description)) return; // linhas de saldo não são lançamentos
    const base = stableHash(`${date}|${amount}|${description.toLowerCase()}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({ line, date, description: description || (amount > 0 ? "Crédito" : "Débito"), amountCents: amount, externalId: `csv:${base}:${n}` });
  });
  return { rows, errors };
}

export function detectFormat(fileName: string, text: string): "OFX" | "CSV" {
  return /\.(ofx|qfx)$/i.test(fileName) || /<OFX>/i.test(text) || /^OFXHEADER/m.test(text) ? "OFX" : "CSV";
}
