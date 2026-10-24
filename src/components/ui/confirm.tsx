"use client";

import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ConfirmContext = React.createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);

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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
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
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return React.useContext(ConfirmContext);
}
