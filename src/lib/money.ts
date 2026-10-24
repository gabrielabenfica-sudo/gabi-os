/**
 * Utilitários monetários. Todos os valores trafegam como centavos inteiros.
 * Nada aqui usa aritmética de ponto flutuante sobre valores em reais.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Valor monetário inválido (esperado inteiro em centavos): ${value}`);
  }
}

/** 123456 → "R$ 1.234,56" */
export function formatBRL(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.trunc(abs / 100);
  const centavos = abs % 100;
  // Formata só a parte inteira com Intl, depois anexa centavos — evita float.
  const formatted = brl.format(reais).replace(/,00$/, "") + "," + String(centavos).padStart(2, "0");
  return negative ? `-${formatted}` : formatted;
}

/**
 * Converte texto digitado pela usuária em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 10", "-5,5".
 * Retorna null se o texto não for um valor válido.
 */
export function parseBRLToCents(input: string): number | null {
  let s = input.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let decPart = "";
  if (lastComma > -1 && lastComma > lastDot) {
    // vírgula é o separador decimal; pontos são milhar
    intPart = s.slice(0, lastComma).replace(/\./g, "");
    decPart = s.slice(lastComma + 1);
  } else if (lastDot > -1 && lastDot > lastComma) {
    const after = s.slice(lastDot + 1);
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount === 1 && after.length !== 3) {
      // "1234.56" → ponto decimal
      intPart = s.slice(0, lastDot).replace(/,/g, "");
      decPart = after;
    } else {
      // "1.234" ou "1.234.567" → milhar
      intPart = s.replace(/[.,]/g, "");
    }
  } else {
    intPart = s;
  }
  if (!/^\d+$/.test(intPart || "0") || !/^\d*$/.test(decPart) || decPart.length > 2) return null;
  const cents = Number(intPart || "0") * 100 + Number(decPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Divide um total em N parcelas; a diferença de arredondamento vai para a 1ª. */
export function splitInstallments(totalCents: number, count: number): number[] {
  assertCents(totalCents);
  if (!Number.isInteger(count) || count < 1) throw new Error("Número de parcelas inválido");
  const base = Math.trunc(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total);
  return total;
}
