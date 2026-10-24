"use client";

import * as React from "react";
import { buildRRule, describeRRule, parseRRule, type RecurrenceFreq } from "@/lib/recurrence";
import { Input, Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type Preset = "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

function presetOf(rule: string | null): Preset {
  if (!rule) return "NONE";
  const s = parseRRule(rule);
  if (!s) return "CUSTOM";
  const simple = (s.interval ?? 1) === 1 && !s.count && !s.until;
  if (s.freq === "WEEKLY" && s.byWeekday?.join(",") === "1,2,3,4,5" && simple) return "WEEKDAYS";
  if (simple && !s.byWeekday?.length) return s.freq;
  return "CUSTOM";
}

/** Escolha de recorrência. `value` é a regra RRULE (ou null). */
export function RecurrencePicker({
  value,
  onChange,
  id,
  baseWeekday,
}: {
  value: string | null;
  onChange: (rule: string | null) => void;
  id?: string;
  baseWeekday?: number;
}) {
  const [preset, setPreset] = React.useState<Preset>(() => presetOf(value));
  const spec = value ? parseRRule(value) : null;
  const [freq, setFreq] = React.useState<RecurrenceFreq>(spec?.freq ?? "WEEKLY");
  const [interval, setInterval] = React.useState(spec?.interval ?? 1);
  const [days, setDays] = React.useState<number[]>(spec?.byWeekday ?? (baseWeekday !== undefined ? [baseWeekday] : []));
  const [endType, setEndType] = React.useState<"never" | "count" | "until">(spec?.count ? "count" : spec?.until ? "until" : "never");
  const [count, setCount] = React.useState(spec?.count ?? 10);
  const [until, setUntil] = React.useState(spec?.until ?? "");

  const emitCustom = (patch: Partial<{ freq: RecurrenceFreq; interval: number; days: number[]; endType: typeof endType; count: number; until: string }> = {}) => {
    const f = patch.freq ?? freq;
    const d = patch.days ?? days;
    const e = patch.endType ?? endType;
    onChange(
      buildRRule({
        freq: f,
        interval: patch.interval ?? interval,
        byWeekday: f === "WEEKLY" ? d : undefined,
        count: e === "count" ? patch.count ?? count : undefined,
        until: e === "until" && (patch.until ?? until) ? patch.until ?? until : undefined,
      }),
    );
  };

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p === "NONE") onChange(null);
    else if (p === "WEEKDAYS") onChange(buildRRule({ freq: "WEEKLY", byWeekday: [1, 2, 3, 4, 5] }));
    else if (p === "CUSTOM") emitCustom();
    else onChange(buildRRule({ freq: p }));
  };

  return (
    <div className="grid gap-2">
      <Select id={id} value={preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
        <option value="NONE">Não se repete</option>
        <option value="DAILY">Todo dia</option>
        <option value="WEEKDAYS">Dias úteis (seg. a sex.)</option>
        <option value="WEEKLY">Toda semana</option>
        <option value="MONTHLY">Todo mês</option>
        <option value="YEARLY">Todo ano</option>
        <option value="CUSTOM">Personalizada…</option>
      </Select>
      {preset === "CUSTOM" && (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm">
            <span>A cada</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={interval}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                setInterval(v);
                emitCustom({ interval: v });
              }}
              className="w-16"
              aria-label="Intervalo"
            />
            <Select
              value={freq}
              onChange={(e) => {
                const f = e.target.value as RecurrenceFreq;
                setFreq(f);
                emitCustom({ freq: f });
              }}
              className="w-32"
              aria-label="Unidade"
            >
              <option value="DAILY">dia(s)</option>
              <option value="WEEKLY">semana(s)</option>
              <option value="MONTHLY">mês(es)</option>
              <option value="YEARLY">ano(s)</option>
            </Select>
          </div>
          {freq === "WEEKLY" && (
            <div className="flex gap-1" role="group" aria-label="Dias da semana">
              {WEEKDAYS.map((d, i) => {
                const on = days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[i]}
                    onClick={() => {
                      const next = on ? days.filter((x) => x !== i) : [...days, i];
                      setDays(next);
                      emitCustom({ days: next });
                    }}
                    className={cn(
                      "size-8 rounded-full text-xs font-medium",
                      on ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border hover:bg-accent",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Termina</span>
            <Select
              value={endType}
              onChange={(e) => {
                const v = e.target.value as typeof endType;
                setEndType(v);
                emitCustom({ endType: v });
              }}
              className="w-36"
              aria-label="Término"
            >
              <option value="never">nunca</option>
              <option value="count">após N vezes</option>
              <option value="until">em uma data</option>
            </Select>
            {endType === "count" && (
              <Input
                type="number"
                min={1}
                max={999}
                value={count}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1);
                  setCount(v);
                  emitCustom({ count: v });
                }}
                className="w-20"
                aria-label="Número de vezes"
              />
            )}
            {endType === "until" && (
              <Input
                type="date"
                value={until}
                onChange={(e) => {
                  setUntil(e.target.value);
                  emitCustom({ until: e.target.value });
                }}
                className="w-40"
                aria-label="Data final"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{describeRRule(value)}</p>
        </div>
      )}
    </div>
  );
}
