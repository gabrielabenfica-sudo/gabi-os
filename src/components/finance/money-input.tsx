"use client";

import * as React from "react";
import { Input } from "@/components/ui/form-controls";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Campo de valor em reais. Trabalha em centavos (inteiros); nunca em float. */
export function MoneyInput({
  id,
  value,
  onChange,
  allowNegative = false,
  className,
  placeholder = "0,00",
  ...rest
}: {
  id?: string;
  value: number | null;
  onChange: (cents: number | null) => void;
  allowNegative?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const format = (c: number | null) =>
    c === null ? "" : `${c < 0 ? "-" : ""}${formatBRL(Math.abs(c)).replace("R$", "").replace(/\s/g, "")}`;
  const [text, setText] = React.useState(() => format(value));
  const [invalid, setInvalid] = React.useState(false);
  const lastValue = React.useRef(value);

  React.useEffect(() => {
    if (value !== lastValue.current) {
      setText(format(value));
      lastValue.current = value;
    }
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={cn("pl-9 text-right tabular", className)}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const cents = raw.trim() ? parseBRLToCents(raw) : null;
          const ok = raw.trim() === "" || (cents !== null && (allowNegative || cents >= 0));
          setInvalid(!ok);
          if (ok) {
            lastValue.current = cents;
            onChange(cents);
          }
        }}
        onBlur={() => {
          if (!invalid) setText(format(lastValue.current));
        }}
        {...rest}
      />
    </div>
  );
}

/** Valor formatado com cor semântica opcional (entrada/saída). */
export function Money({ cents, tone, className, signed = false }: { cents: number; tone?: "auto" | "in" | "out" | "muted"; className?: string; signed?: boolean }) {
  const t = tone === "auto" ? (cents > 0 ? "in" : cents < 0 ? "out" : "muted") : tone;
  const text = signed && cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents);
  return (
    <span className={cn("tabular whitespace-nowrap", t === "in" && "text-success", t === "out" && "text-danger", t === "muted" && "text-muted-foreground", className)}>
      {text}
    </span>
  );
}
