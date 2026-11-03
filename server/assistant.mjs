// Claude assistant: builds Gabriela's daily context from her data and streams Claude's answer.
import { corsHeaders, env, getUser, userClient, OWNER_EMAIL } from "./lib.mjs";

const sseError = (message, type = "api_error", status = 500) =>
  new Response(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type, message } })}\n\n`, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });

const DAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    label: `${get("weekday")}, ${get("day")} de ${get("month")} de ${get("year")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function minutesOf(time) {
  if (!time) return 0;
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}


export async function assistant(req) {
  try {
    const apiKey = env("ANTHROPIC_API_KEY", "");
    if (!apiKey) return sseError("O assistente ainda não está configurado (falta a chave da Anthropic).", "permission_error", 403);

    const user = await getUser(req);
    if (!user) return sseError("Sessão expirada. Entre novamente.", "authentication_error", 401);
    if ((user.email ?? "").toLowerCase() !== OWNER_EMAIL) {
      return sseError("O Claude está disponível apenas na conta principal deste app.", "permission_error", 403);
    }
    const supabase = userClient(user.token);

    const body = await req.json().catch(() => ({}));
    const history = Array.isArray(body.messages) ? body.messages : [];
    if (!history.length) return sseError("Escreva uma mensagem para começar.");

    const now = saoPauloNow();
    const weekday = (new Date(`${now.date}T12:00:00-03:00`).getUTCDay() + 6) % 7;

    const [workspaces, statuses, tasks, events, blocks, logs, habits, entries, goals, content, maas, prefs] =
      await Promise.all([
        supabase.from("workspaces").select("id, name, kind").order("position"),
        supabase.from("task_statuses").select("id, name, workspace_id, is_done").order("position"),
        supabase
          .from("tasks")
          .select("title, priority, due_date, status_id, workspace_id, estimate_minutes")
          .is("completed_at", null)
          .order("position", { ascending: false })
          .limit(40),
        supabase
          .from("events")
          .select("title, start_at, end_at, workspace_id, rrule")
          .gte("start_at", `${now.date}T03:00:00.000Z`)
          .lte("start_at", `${now.date}T23:59:59.000Z`)
          .limit(30),
        supabase
          .from("routine_blocks")
          .select("id, title, start_time, end_time, days, workspace_id, active")
          .eq("active", true)
          .order("start_time"),
        supabase.from("routine_logs").select("block_id, log_date, done").eq("log_date", now.date),
        supabase.from("habits").select("id, name, active").eq("active", true).order("position"),
        supabase.from("habit_entries").select("habit_id, done").eq("entry_date", now.date),
        supabase
          .from("goals")
          .select("title, type, category, unit, start_value, target_value, current_value, due_date, status, is_objective")
          .eq("status", "ACTIVE"),
        supabase
          .from("content_items")
          .select("title, format, publish_date, owner, profile_id")
          .is("published_at", null)
          .order("publish_date")
          .limit(10),
        supabase
          .from("maas_scores")
          .select("area_name, score, action_plan")
          .order("score")
          .limit(12),
        supabase.from("notification_prefs").select("daily_time, weekly_day").maybeSingle(),
      ]);

    const workspaceName = new Map((workspaces.data ?? []).map((row) => [row.id, row.name]));
    const statusName = new Map((statuses.data ?? []).map((row) => [row.id, row.name]));
    const doneIds = new Set((statuses.data ?? []).filter((row) => row.is_done).map((row) => row.id));
    const doneLogs = new Set((logs.data ?? []).filter((row) => row.done).map((row) => row.block_id));
    const doneHabits = new Set((entries.data ?? []).filter((row) => row.done).map((row) => row.habit_id));

    const todayBlocks = (blocks.data ?? []).filter((block) => (block.days ?? []).includes(weekday));
    const formatHour = (value) => (value ?? "").slice(0, 5);

    const lines = [];
    lines.push(`Hoje é ${now.label}, ${now.time} (horário de São Paulo).`);
    lines.push("");
    lines.push("ÁREAS DE TRABALHO:");
    (workspaces.data ?? []).forEach((row) => lines.push(`- ${row.name} (${row.kind})`));

    lines.push("");
    lines.push("ROTINA DE HOJE (bloco · feito/não feito):");
    if (todayBlocks.length) {
      todayBlocks
        .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time))
        .forEach((block) =>
          lines.push(
            `- ${formatHour(block.start_time)}–${formatHour(block.end_time)} ${block.title} · ${
              doneLogs.has(block.id) ? "cumprido" : "pendente"
            }`,
          ),
        );
    } else {
      lines.push("- sem blocos definidos para hoje");
    }

    const openTasks = (tasks.data ?? []).filter((task) => !doneIds.has(task.status_id ?? ""));
    lines.push("");
    lines.push("TAREFAS EM ABERTO:");
    if (openTasks.length) {
      openTasks.slice(0, 25).forEach((task) =>
        lines.push(
          `- ${task.title} · ${workspaceName.get(task.workspace_id) ?? "—"} · etapa ${
            statusName.get(task.status_id ?? "") ?? "—"
          } · prioridade ${task.priority ?? "—"}${task.due_date ? ` · vence ${task.due_date}` : ""}`,
        ),
      );
    } else {
      lines.push("- nenhuma");
    }

    lines.push("");
    lines.push("AGENDA DE HOJE:");
    if ((events.data ?? []).length) {
      (events.data ?? []).forEach((event) =>
        lines.push(
          `- ${new Date(event.start_at).toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
          })} ${event.title} · ${workspaceName.get(event.workspace_id) ?? "—"}`,
        ),
      );
    } else {
      lines.push("- nenhum evento");
    }

    lines.push("");
    lines.push("HÁBITOS DE HOJE:");
    (habits.data ?? []).forEach((habit) =>
      lines.push(`- ${habit.name}: ${doneHabits.has(habit.id) ? "feito" : "pendente"}`),
    );

    lines.push("");
    lines.push("METAS ATIVAS:");
    (goals.data ?? []).forEach((goal) => {
      const current = Number(goal.current_value ?? goal.start_value ?? 0);
      const target = Number(goal.target_value ?? 0);
      const unit = goal.unit ?? "";
      lines.push(
        `- ${goal.title} (${goal.category ?? goal.type ?? "meta"}): ${current}${unit} de ${target}${unit}${
          goal.due_date ? ` até ${goal.due_date}` : ""
        }${goal.is_objective ? " · objetivo qualitativo" : ""}`,
      );
    });

    lines.push("");
    lines.push("CONTEÚDO AINDA NÃO PUBLICADO:");
    if ((content.data ?? []).length) {
      (content.data ?? []).forEach((item) =>
        lines.push(
          `- ${item.title} · ${item.format ?? "—"} · ${item.owner ?? "—"}${
            item.publish_date ? ` · publicação ${item.publish_date.slice(0, 10)}` : ""
          }`,
        ),
      );
    } else {
      lines.push("- nada pendente");
    }

    lines.push("");
    lines.push("RODA DA VIDA (áreas com nota mais baixa primeiro):");
    (maas.data ?? []).forEach((score) => lines.push(`- ${score.area_name}: ${score.score}/10`));

    if (prefs.data?.daily_time) {
      lines.push("");
      lines.push(`Preferência de resumo diário: ${prefs.data.daily_time}.`);
    }

    const systemPrompt = [
      "Você é o Claude dentro do Gabi OS, o sistema pessoal da Gabriela Benfica.",
      "Fale em português do Brasil, com tom caloroso, direto e prático — como uma mentora organizada.",
      "Use o contexto abaixo para responder com base na vida real dela: rotina, tarefas, agenda, metas, hábitos, conteúdo e roda da vida.",
      "Você não altera dados do app: quando algo precisa ser mudado, diga exatamente onde clicar e o que ajustar.",
      "Seja concisa: respostas curtas em parágrafos ou listas, sem repetir o contexto.",
      "Quando fizer sentido, proponha um plano com horários compatíveis com a rotina dela e sinalize conflitos de agenda.",
      "",
      "CONTEXTO ATUAL DO GABI OS:",
      lines.join("\n"),
    ].join("\n");

    const messages = history
      .filter((item) => item?.content)
      .map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      messages.push({ role: "user", content: "Me dê um panorama do meu dia." });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
        system: systemPrompt,
        messages,
        stream: true,
        max_tokens: 1600,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      let message = "Não consegui falar com o assistente agora.";
      let code = "api_error";
      try {
        const parsed = JSON.parse(text);
        message = parsed.error?.message ?? message;
        code = parsed.error?.type ?? code;
      } catch (_error) {
        // keep defaults
      }
      console.error("assistant upstream error", upstream.status, text.slice(0, 400));
      return sseError(message, code, upstream.status);
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("assistant failed", message);
    return sseError(message);
  }
}
