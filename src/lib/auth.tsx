import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Minimal shapes used by the app (Neon's Supabase-compatible auth returns these fields).
export type User = { id: string; email?: string | null; [key: string]: unknown };
export type Session = { access_token: string; user: User; [key: string]: unknown };

/** Never leave the app stuck on the loading screen if the server is slow. */
const AUTH_TIMEOUT_MS = 12_000;
function withTimeout<T>(promise: Promise<T>, ms = AUTH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetSession: () => Promise<void>;
  changePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Removes any leftover auth token from this browser. */
function clearStoredSession() {
  try {
    Object.keys(localStorage)
      .filter((key) => (key.startsWith("sb-") && key.includes("auth-token")) || key.startsWith("neon"))
      .forEach((key) => localStorage.removeItem(key));
  } catch (_error) {
    // storage may be unavailable; signOut below still clears in-memory state
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const queryClient = useQueryClient();

  useEffect(() => {
    let settled = false;
    let lastToken: string | null = null;
    const finish = (next: Session | null) => {
      settled = true;
      setSession(next);
      setLoading(false);
      // Data asked for before the sign-in finished loading came back empty:
      // fetch everything again as soon as a (new) token is available.
      const token = next?.access_token ?? null;
      if (token && token !== lastToken) {
        const firstToken = lastToken === null;
        lastToken = token;
        void queryClient.invalidateQueries();
        // On the very first load the data client can lag a moment behind; check once more.
        if (firstToken) setTimeout(() => void queryClient.invalidateQueries(), 1500);
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event: string, nextSession: Session | null) => finish(nextSession),
    );

    // A stored session may have been revoked elsewhere (password change,
    // sign-out on another device). Validate it before opening the app.
    withTimeout(supabase.auth.getSession())
      .then(async ({ data }: { data: { session: Session | null } }) => {
        if (!data?.session) return finish(null);
        const { error } = await withTimeout(supabase.auth.getUser()).catch(() => ({ error: null }));
        if (error) {
          clearStoredSession();
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          finish(null);
        } else {
          finish(data.session);
        }
      })
      .catch(() => {
        // Server unreachable or slow: show the login screen instead of spinning forever.
        if (!settled) finish(null);
      });

    return () => subscription?.subscription?.unsubscribe?.();
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearStoredSession();
  }, []);

  const resetSession = useCallback(async () => {
    clearStoredSession();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }, []);

  const changePassword = useCallback(async (password: string) => {
    // Neon's auth changes passwords through its own endpoint (needs a fresh session).
    const auth = supabase.auth as { changePassword?: (args: unknown) => Promise<{ error?: Error | null }> };
    if (typeof auth.changePassword === "function") {
      const { error } = await auth.changePassword({ newPassword: password, revokeOtherSessions: false });
      if (error) throw error;
      return;
    }
    throw new Error("Para trocar a senha, saia e use “Esqueci minha senha” na tela de login.");
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signOut,
      resetSession,
      changePassword,
    }),
    [session, loading, signIn, signUp, signOut, resetSession, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return context;
}
