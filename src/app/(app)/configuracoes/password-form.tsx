"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await changePasswordAction({
        current: String(fd.get("current") ?? ""),
        next: String(fd.get("next") ?? ""),
        confirm: String(fd.get("confirm") ?? ""),
      });
      if (r.ok) {
        toast.success(r.message ?? "Senha alterada.");
        formRef.current?.reset();
      } else toast.error(r.error);
    });
  };

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4">
      <Field label="Senha atual" htmlFor="pw-current">
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nova senha" htmlFor="pw-next" hint="Mínimo de 10 caracteres.">
          <Input id="pw-next" name="next" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirmar nova senha" htmlFor="pw-confirm">
          <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Alterando…" : "Alterar senha"}
        </Button>
      </div>
    </form>
  );
}
