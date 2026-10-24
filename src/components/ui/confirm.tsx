"use client";

import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Input } from "./form-controls";

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PromptOptions = { title: string; label: string; defaultValue?: string; placeholder?: string; confirmLabel?: string; validate?: (v: string) => string | null };

const ConfirmContext = React.createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);
const PromptContext = React.createContext<(opts: PromptOptions) => Promise<string | null>>(async () => null);

/** Provedor de diálogo de confirmação: `const confirm = useConfirm(); if (await confirm({...}))` */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const [prompt, setPrompt] = React.useState<(PromptOptions & { resolve: (v: string | null) => void; value: string; error: string | null }) | null>(null);
  const ask = React.useCallback(
    (opts: PromptOptions) => new Promise<string | null>((resolve) => setPrompt({ ...opts, resolve, value: opts.defaultValue ?? "", error: null })),
    [],
  );
  const closePrompt = (submit: boolean) => {
    if (!prompt) return;
    if (submit) {
      const value = prompt.value.trim();
      const error = !value ? "Preencha este campo." : prompt.validate?.(value) ?? null;
      if (error) return setPrompt({ ...prompt, error });
      prompt.resolve(value);
    } else prompt.resolve(null);
    setPrompt(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={ask}>
      {children}
      <Dialog open={Boolean(prompt)} onOpenChange={(open) => !open && closePrompt(false)}>
        <DialogContent className="max-w-md" hideClose aria-describedby={undefined}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              closePrompt(true);
            }}
          >
            <DialogHeader>
              <DialogTitle>{prompt?.title}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-1.5">
              <label htmlFor="prompt-input" className="text-sm font-medium">{prompt?.label}</label>
              <Input
                id="prompt-input"
                autoFocus
                value={prompt?.value ?? ""}
                placeholder={prompt?.placeholder}
                aria-invalid={Boolean(prompt?.error)}
                onChange={(e) => prompt && setPrompt({ ...prompt, value: e.target.value, error: null })}
              />
              {prompt?.error && <p className="text-xs text-danger" role="alert">{prompt.error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closePrompt(false)}>Cancelar</Button>
              <Button type="submit">{prompt?.confirmLabel ?? "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(state)} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-md" hideClose>
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
            {state?.description && <DialogDescription asChild><div>{state.description}</div></DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {state?.cancelLabel ?? "Cancelar"}
            </Button>
            <Button variant={state?.danger ? "danger" : "default"} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return React.useContext(ConfirmContext);
}

export function usePrompt() {
  return React.useContext(PromptContext);
}
