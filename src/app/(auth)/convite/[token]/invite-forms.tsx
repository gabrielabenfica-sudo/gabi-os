"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { acceptInviteAction, registerInviteAction, type InviteState } from "./actions";

export function InviteForms({ token, email, hasAccount, loggedInAs }: { token: string; email: string; hasAccount: boolean; loggedInAs: string | null }) {
  const [state, register, pending] = useActionState(registerInviteAction.bind(null, token), undefined as InviteState);
  const [acceptState, setAcceptState] = React.useState<InviteState>(undefined);
  const [accepting, setAccepting] = React.useState(false);

  if (loggedInAs) {
    return (
      <div className="grid gap-3">
        <p className="text-sm">Você está conectada como <b>{loggedInAs}</b>.</p>
        {loggedInAs !== email && <p className="text-sm text-danger">O convite é para {email}. Saia e entre com essa conta.</p>}
        {acceptState?.error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{acceptState.error}</p>}
        <Button
          disabled={accepting || loggedInAs !== email}
          onClick={async () => {
            setAccepting(true);
            setAcceptState(await acceptInviteAction(token));
            setAccepting(false);
          }}
        >
          Aceitar convite
        </Button>
      </div>
    );
  }
  if (hasAccount) {
    return (
      <p className="text-sm">
        Já existe uma conta para {email}. <Link className="text-primary hover:underline" href={`/login?next=/convite/${token}`}>Entre</Link> para aceitar o convite.
      </p>
    );
  }
  return (
    <form action={register} className="grid gap-4" noValidate>
      <Field label="E-mail" htmlFor="email"><Input id="email" value={email} disabled readOnly /></Field>
      <Field label="Nome" htmlFor="name"><Input id="name" name="name" autoComplete="name" required autoFocus /></Field>
      <Field label="Senha" htmlFor="password" hint="Mínimo de 10 caracteres, com letras e números ou símbolos."><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Confirmar senha" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      {state?.error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Criando conta…" : "Criar conta e entrar"}</Button>
    </form>
  );
}
