"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { registerAction } from "../actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field label="Nome" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required autoFocus defaultValue={state?.fields?.name} />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Senha" htmlFor="password" hint="Mínimo de 10 caracteres, com letras e números ou símbolos.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirmar senha" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
