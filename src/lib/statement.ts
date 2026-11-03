export type ParsedEntry = {
  date: string;
  description: string;
  amountCents: number;
  externalId: string;
};

function toCents(raw: string) {
  const cleaned = raw
    .replace(/[^\d,.\-+]/g, "")
    .replace(/\s/g, "")
    .replace(/\+/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma > lastDot) {
    // 1.234,56 → 1234.56
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // 1,234.56 → 1234.56
    normalized = cleaned.replace(/,/g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function toISO(raw: string) {
  const value = raw.trim();
  const br = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const [, day, month, year] = br;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fallback = new Date(value);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString().slice(0, 10);
  return null;
}

function signature(date: string, amountCents: number, description: string) {
  const base = `${date}|${amountCents}|${description.trim().toLowerCase()}`;
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 31 + base.charCodeAt(index)) % 1_000_000_007;
  }
  return `imp_${hash.toString(36)}_${Math.abs(amountCents)}`;
}

function parseOFX(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);

  blocks.forEach((block) => {
    const amountMatch = block.match(/<TRNAMT>([^<\r\n]+)/i);
    const dateMatch = block.match(/<DTPOSTED>([^<\r\n]+)/i);
    const memoMatch =
      block.match(/<MEMO>([^<\r\n]+)/i) ?? block.match(/<NAME>([^<\r\n]+)/i);
    if (!amountMatch || !dateMatch) return;

    const amountCents = toCents(amountMatch[1]);
    const date = toISO(dateMatch[1].slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
    if (!date || !amountCents) return;

    const description = (memoMatch?.[1] ?? "Lançamento importado").trim();
    entries.push({
      date,
      description,
      amountCents,
      externalId: signature(date, amountCents, description),
    });
  });

  return entries;
}

function splitCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalise(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseCsv(text: string): ParsedEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";

  let headerIndex = -1;
  let dateColumn = 0;
  let descriptionColumn = 1;
  let amountColumn = 2;

  for (let index = 0; index < Math.min(lines.length, 6); index += 1) {
    const cells = splitCsvLine(lines[index], delimiter).map(normalise);
    const dateCell = cells.findIndex((cell) => /data|date/.test(cell));
    const amountCell = cells.findIndex((cell) => /valor|amount|value|debito|credito|quantia/.test(cell));
    const descriptionCell = cells.findIndex((cell) =>
      /descri|histor|memo|lancamento|title|nome/.test(cell),
    );

    if (dateCell >= 0 && amountCell >= 0) {
      headerIndex = index;
      dateColumn = dateCell;
      amountColumn = amountCell;
      descriptionColumn = descriptionCell >= 0 ? descriptionCell : dateCell === 0 ? 1 : 0;
      break;
    }
  }

  const entries: ParsedEntry[] = [];
  const rows = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  rows.forEach((line) => {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length < 2) return;

    const rawDate = cells[dateColumn] ?? "";
    const rawAmount = cells[amountColumn] ?? "";
    const date = toISO(rawDate);
    const amountCents = toCents(rawAmount);
    if (!date || !amountCents) return;

    const description = (cells[descriptionColumn] ?? "Lançamento importado").trim() || "Lançamento importado";
    entries.push({
      date,
      description,
      amountCents,
      externalId: signature(date, amountCents, description),
    });
  });

  return entries;
}

export function parseStatement(text: string, fileName = ""): ParsedEntry[] {
  const lower = fileName.toLowerCase();
  const isOfx = lower.endsWith(".ofx") || /<STMTTRN>/i.test(text);
  const entries = isOfx ? parseOFX(text) : parseCsv(text);

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export function formatCentsCompact(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}
