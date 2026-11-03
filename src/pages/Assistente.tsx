import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  CalendarClock,
  Check,
  ListChecks,
  RotateCcw,
  Sparkles,
  Square,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/hooks/use-assistant";
import { PageHeader } from "@/components/common/page-parts";

const SUGGESTIONS = [
  {
    icon: CalendarClock,
    label: "Planeje meu dia",
    prompt: "Monta um plano para o meu dia de hoje encaixando a rotina, os compromissos e as tarefas que estão em aberto.",
  },
  {
    icon: ListChecks,
    label: "O que priorizar",
    prompt: "Olhando minhas tarefas em aberto, o que eu deveria priorizar nesta semana e por quê?",
  },
  {
    icon: Target,
    label: "Revisar minhas metas",
    prompt: "Como estão minhas metas? O que está travado e qual o próximo passo concreto para cada uma?",
  },
  {
    icon: Sparkles,
    label: "Ideia de conteúdo",
    prompt: "Sugere três ideias de conteúdo para o Instagram da TURBO que conversem com o que eu já estou produzindo.",
  },
];

export default function Assistente() {
  const { messages, loading, error, send, stop, reset } = useAssistant();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || messages.length === 0) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    void send(text);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assistente"
        title="Claude dentro do Gabi OS"
        description="Conversa com quem já conhece a sua rotina, suas tarefas, metas e conteúdo — sem precisar explicar tudo de novo."
        actions={
          messages.length ? (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="size-4" /> Nova conversa
            </Button>
          ) : null
        }
      />

      <Card className="border-border/70 shadow-card">
        <CardContent className="flex h-[calc(100vh-300px)] min-h-[440px] flex-col p-0">
          <div
            ref={scrollRef}
            className="flex-1 space-y-5 overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6"
          >
            {isEmpty ? (
              <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-4 text-center">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="font-display text-xl text-foreground">Por onde começamos?</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Eu vejo sua rotina, tarefas, metas, hábitos e conteúdo de hoje.
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2">
                  {SUGGESTIONS.map((suggestion) => {
                    const Icon = suggestion.icon;
                    return (
                      <button
                        key={suggestion.label}
                        type="button"
                        onClick={() => void send(suggestion.prompt)}
                        className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left text-sm text-foreground transition hover:border-primary/40 hover:bg-accent/30"
                      >
                        <Icon className="size-4 shrink-0 text-primary" />
                        <span className="truncate">{suggestion.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              messages.map((message, index) =>
                message.role === "user" ? (
                  <div key={index} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-foreground">
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ) : (
                  <div key={index} className="flex gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                      C
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Claude
                      </p>
                      {message.content ? (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {message.content}
                          {message.isStreaming ? (
                            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-primary align-middle" />
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 py-1">
                          {[0, 1, 2].map((dot) => (
                            <span
                              key={dot}
                              className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                              style={{ animationDelay: `${dot * 120}ms` }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )
            )}
            {error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <div />
          </div>

          <div className="border-t border-border/70 bg-secondary/25 px-3 py-3 sm:px-4">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder="Escreva para o Claude…"
                className="max-h-32 min-h-[42px] resize-none bg-card"
              />
              {loading ? (
                <Button size="icon" variant="outline" onClick={stop} aria-label="Parar resposta">
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button size="icon" onClick={submit} disabled={!input.trim()} aria-label="Enviar">
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Check className="size-3" />
              O Claude lê seus dados apenas para responder — ele não altera nada no app.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
