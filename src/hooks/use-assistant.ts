import { useCallback, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { API_URL, getAccessToken } from "@/integrations/supabase/client";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

const FALLBACK: Record<string, string> = {
  authentication_error: "Sua sessão expirou. Entre novamente para falar com o Claude.",
  permission_error: "A IA está desativada para este app.",
  insufficient_credits: "Os créditos de IA acabaram. Fale com o administrador do app.",
  rate_limit_error: "Muitas mensagens em pouco tempo. Aguarde um instante.",
  overloaded_error: "O serviço está ocupado. Tente de novo em instantes.",
  api_error: "Não consegui responder agora. Tente novamente.",
};

export function useAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(crypto.randomUUID());
  const abortRef = useRef<AbortController | null>(null);

  const patchLast = (patch: Partial<AssistantMessage>) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") next[next.length - 1] = { ...last, ...patch };
      return next;
    });
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const token = await getAccessToken();
      if (!token) {
        setError("Sua sessão expirou. Entre novamente.");
        return;
      }

      const history = [...messages, { role: "user" as const, content: trimmed }];
      setMessages([...history, { role: "assistant", content: "", isStreaming: true }]);
      setLoading(true);
      setError(null);
      abortRef.current = new AbortController();

      const blocks = new Map<number, { type: string; content: string }>();

      try {
        await fetchEventSource(`${API_URL}/functions/v1/assistant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Session-ID": sessionRef.current,
          },
          body: JSON.stringify({
            messages: history.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
          signal: abortRef.current.signal,

          async onopen(response) {
            const contentType = response.headers.get("content-type");
            if (!response.ok) {
              if (contentType?.includes("text/event-stream")) {
                const text = await response.text();
                const match = text.match(/data: (.+)/);
                if (match) {
                  const payload = JSON.parse(match[1]);
                  throw new Error(payload.error?.message ?? "Falha ao chamar o Claude.");
                }
              }
              throw new Error(`Não consegui responder (${response.status}).`);
            }
            if (!contentType?.includes("text/event-stream")) {
              throw new Error("Resposta inesperada do assistente.");
            }
          },

          onmessage(event) {
            if (!event.data) return;
            const payload = JSON.parse(event.data);

            if (payload.type === "error") {
              const code = payload.error?.type ?? "api_error";
              setError(payload.error?.message || FALLBACK[code] || FALLBACK.api_error);
              setMessages((prev) => prev.slice(0, -1));
              setLoading(false);
              return;
            }

            if (payload.type === "content_block_start") {
              blocks.set(payload.index, { type: payload.content_block?.type ?? "text", content: "" });
              return;
            }

            if (payload.type === "content_block_delta") {
              const block = blocks.get(payload.index);
              if (!block) return;
              if (block.type === "thinking") return;
              block.content += payload.delta?.text ?? "";
              patchLast({ content: block.content });
              return;
            }

            if (payload.type === "message_stop") {
              patchLast({ isStreaming: false });
              setLoading(false);
            }
          },

          onerror(err) {
            throw err;
          },
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          patchLast({ isStreaming: false });
        } else {
          setError((err as Error)?.message || "Não consegui responder agora.");
          setMessages((prev) => {
            const next = [...prev];
            if (next[next.length - 1]?.role === "assistant" && !next[next.length - 1].content) next.pop();
            return next;
          });
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [messages, loading],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current = crypto.randomUUID();
    setMessages([]);
    setError(null);
    setLoading(false);
  }, []);

  return { messages, loading, error, send, stop, reset };
}
