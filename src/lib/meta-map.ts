/** Conversões puras dos dados da Graph API (Instagram). */

export type MetaInsight = { name: string; period?: string; values?: { value: number | Record<string, number>; end_time?: string }[]; total_value?: { value: number } };

/** Valor de uma métrica: `total_value` (insights de conta) ou a soma dos `values`. */
export function pickInsight(list: MetaInsight[], name: string): number | null {
  const m = list.find((i) => i.name === name);
  if (!m) return null;
  if (m.total_value && typeof m.total_value.value === "number") return m.total_value.value;
  const nums = (m.values ?? []).map((v) => v.value).filter((v): v is number => typeof v === "number");
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

export function mapMediaType(mediaType?: string, productType?: string): string {
  if (productType === "REELS") return "REELS";
  if (productType === "STORY") return "STORIES";
  if (mediaType === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (mediaType === "VIDEO") return "VIDEO";
  if (mediaType === "IMAGE") return "STATIC";
  return "OTHER";
}

export function titleFromCaption(caption?: string | null): string {
  const first = (caption ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (!first) return "Publicação do Instagram";
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}

/** Link do post sem parâmetros e sem barra final (para comparar com o link salvo no app). */
export function normalizePermalink(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.instagram.com${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}
