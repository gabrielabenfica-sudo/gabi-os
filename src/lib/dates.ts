import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const DEFAULT_TZ = "America/Sao_Paulo";

/** Data atual no fuso da usuária. */
export function nowIn(tz: string = DEFAULT_TZ): TZDate {
  return TZDate.tz(tz);
}

export function formatDateBR(date: Date, tz: string = DEFAULT_TZ): string {
  return format(new TZDate(date, tz), "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTimeBR(date: Date, tz: string = DEFAULT_TZ): string {
  return format(new TZDate(date, tz), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatLongDateBR(date: Date, tz: string = DEFAULT_TZ): string {
  return format(new TZDate(date, tz), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function greetingFor(date: Date, tz: string = DEFAULT_TZ): string {
  const hour = new TZDate(date, tz).getHours();
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Valida um identificador de fuso IANA. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
