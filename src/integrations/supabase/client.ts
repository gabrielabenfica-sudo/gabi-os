// Gabi OS data client.
// Talks to Neon (Managed Better Auth + Data API) through the Supabase-compatible
// adapter, so the rest of the app keeps using `supabase.auth.*` and
// `supabase.from(...)` exactly as before.
import { createClient } from "@neon/neon-js/supabase";

/** Neon database URL without credentials, e.g. https://ep-xxx.c-14.us-east-1.aws.neon.tech/gabios */
export const NEON_URL: string =
  import.meta.env.VITE_NEON_URL ?? "https://ep-fragrant-field-b8hkanuk.c-14.us-east-1.aws.neon.tech/gabios";

/** Small server that runs the assistant, integrations and first-time seed. */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? "https://gabi-os-api.onrender.com").replace(/\/$/, "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = createClient(NEON_URL);

/** Current access token, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** Calls one of the server functions (assistant, integrations, seed-gabi-os). */
export async function invokeFunction<T = unknown>(
  name: string,
  body: unknown,
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const token = await getAccessToken();
    if (!token) return { data: null, error: new Error("Sessão expirada. Entre novamente.") };
    const res = await fetch(`${API_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      const message = (data as { error?: string } | null)?.error ?? `Erro ${res.status}`;
      return { data, error: new Error(message) };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
