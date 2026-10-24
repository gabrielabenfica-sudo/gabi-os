import { RRule, Weekday } from "rrule";

/**
 * Recorrência no formato RFC 5545 sem o prefixo "RRULE:"
 * (ex.: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE").
 *
 * O rrule trabalha com datas "flutuantes" em UTC. Para manter o horário de parede
 * estável no fuso da usuária (inclusive em mudanças de horário de verão), as
 * ocorrências são calculadas a partir do horário local e convertidas de volta.
 */

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type RecurrenceSpec = {
  freq: RecurrenceFreq;
  interval?: number;
  /** 0=domingo … 6=sábado (apenas WEEKLY) */
  byWeekday?: number[];
  count?: number;
  /** Último dia "YYYY-MM-DD" (inclusive) */
  until?: string;
};

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const RRULE_WEEKDAYS = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];

export function buildRRule(spec: RecurrenceSpec): string {
  const parts = [`FREQ=${spec.freq}`, `INTERVAL=${Math.max(1, Math.floor(spec.interval ?? 1))}`];
  if (spec.freq === "WEEKLY" && spec.byWeekday?.length) {
    const days = [...new Set(spec.byWeekday)].sort((a, b) => a - b).map((d) => WEEKDAY_CODES[d]);
    parts.push(`BYDAY=${days.join(",")}`);
  }
  if (spec.count) parts.push(`COUNT=${spec.count}`);
  else if (spec.until) parts.push(`UNTIL=${spec.until.replace(/-/g, "")}T235959Z`);
  return parts.join(";");
}

export function parseRRule(rule: string): RecurrenceSpec | null {
  try {
    const opts = RRule.parseString(rule.replace(/^RRULE:/, ""));
    const freqMap: Record<number, RecurrenceFreq> = {
      [RRule.DAILY]: "DAILY",
      [RRule.WEEKLY]: "WEEKLY",
      [RRule.MONTHLY]: "MONTHLY",
      [RRule.YEARLY]: "YEARLY",
    };
    const freq = opts.freq !== undefined ? freqMap[opts.freq] : undefined;
    if (!freq) return null;
    const byweekday = (Array.isArray(opts.byweekday) ? opts.byweekday : opts.byweekday != null ? [opts.byweekday] : [])
      .map((w) => (typeof w === "number" ? w : (w as Weekday).weekday))
      // rrule: 0=segunda … 6=domingo → converte para 0=domingo
      .map((w) => (w + 1) % 7);
    return {
      freq,
      interval: opts.interval ?? 1,
      byWeekday: byweekday.length ? byweekday : undefined,
      count: opts.count ?? undefined,
      until: opts.until ? opts.until.toISOString().slice(0, 10) : undefined,
    };
  } catch {
    return null;
  }
}

export function isValidRRule(rule: string): boolean {
  return parseRRule(rule) !== null;
}

/** Converte um instante para a "data flutuante" (horário local tratado como UTC). */
function toFloating(date: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

/** Converte a "data flutuante" de volta para o instante real no fuso. */
function fromFloating(floating: Date, tz: string): Date {
  // Primeiro palpite: considera o offset atual e corrige uma vez (resolve DST)
  let guess = new Date(floating.getTime());
  for (let i = 0; i < 2; i++) {
    const diff = toFloating(guess, tz).getTime() - floating.getTime();
    guess = new Date(guess.getTime() - diff);
  }
  return guess;
}

function ruleFor(rule: string, dtstart: Date, tz: string): RRule {
  const opts = RRule.parseString(rule.replace(/^RRULE:/, ""));
  return new RRule({ ...opts, dtstart: toFloating(dtstart, tz) });
}

/** Próxima ocorrência estritamente depois de `after`. */
export function nextOccurrence(rule: string, dtstart: Date, after: Date, tz = "America/Sao_Paulo"): Date | null {
  const next = ruleFor(rule, dtstart, tz).after(toFloating(after, tz), false);
  return next ? fromFloating(next, tz) : null;
}

/** Ocorrências cujo início está entre `from` e `to` (inclusive). Limite de segurança. */
export function occurrencesBetween(
  rule: string,
  dtstart: Date,
  from: Date,
  to: Date,
  tz = "America/Sao_Paulo",
  limit = 1000,
): Date[] {
  const r = ruleFor(rule, dtstart, tz);
  const result: Date[] = [];
  r.between(toFloating(from, tz), toFloating(to, tz), true, (d) => {
    result.push(fromFloating(d, tz));
    return result.length < limit;
  });
  return result;
}

const FREQ_LABEL: Record<RecurrenceFreq, [string, string]> = {
  DAILY: ["Todo dia", "dias"],
  WEEKLY: ["Toda semana", "semanas"],
  MONTHLY: ["Todo mês", "meses"],
  YEARLY: ["Todo ano", "anos"],
};
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function describeRRule(rule: string | null | undefined): string {
  if (!rule) return "Não se repete";
  const spec = parseRRule(rule);
  if (!spec) return "Recorrência personalizada";
  const [single, plural] = FREQ_LABEL[spec.freq];
  let text = spec.interval && spec.interval > 1 ? `A cada ${spec.interval} ${plural}` : single;
  if (spec.byWeekday?.length) {
    const days = [...spec.byWeekday].sort();
    text = days.join(",") === "1,2,3,4,5" ? "Dias úteis" : `${text} (${days.map((d) => WEEKDAY_SHORT[d]).join(", ")})`;
  }
  if (spec.count) text += `, ${spec.count} vezes`;
  if (spec.until) text += `, até ${spec.until.slice(8, 10)}/${spec.until.slice(5, 7)}/${spec.until.slice(0, 4)}`;
  return text;
}
