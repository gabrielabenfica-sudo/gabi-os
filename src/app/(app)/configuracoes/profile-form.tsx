"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { updateProfileAction } from "./actions";

type Theme = "LIGHT" | "DARK" | "SYSTEM";
type Profile = { name: string; timezone: string; appName: string; theme: Theme };

const COMMON_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Rio_Branco",
  "America/Noronha",
  "Europe/Lisbon",
  "America/New_York",
  "UTC",
];

export function ProfileForm({ initial, email }: { initial: Profile; email: string }) {
  const [values, setValues] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const zones = COMMON_TIMEZONES.includes(values.timezone) ? COMMON_TIMEZONES : [values.timezone, ...COMMON_TIMEZONES];

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfileAction(values);
      if (result.ok) {
        toast.success(result.message ?? "Salvo.");
        const root = document.documentElement;
        root.dataset.theme = values.theme;
        root.classList.toggle(
          "dark",
          values.theme === "DARK" || (values.theme === "SYSTEM" && window.matchMedia("(prefers-color-scheme: dark)").matches),
        );
      } else toast.error(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="profile-name">
          <Input id="profile-name" value={values.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="E-mail" htmlFor="profile-email" hint="Usado para entrar.">
          <Input id="profile-email" value={email} disabled readOnly />
        </Field>
        <Field label="Fuso horário" htmlFor="profile-tz">
          <Select id="profile-tz" value={values.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tema" htmlFor="profile-theme">
          <Select id="profile-theme" value={values.theme} onChange={(e) => set("theme", e.target.value as Theme)}>
            <option value="LIGHT">Claro</option>
            <option value="DARK">Escuro</option>
            <option value="SYSTEM">Seguir o sistema</option>
          </Select>
        </Field>
        <Field label="Nome do aplicativo" htmlFor="profile-app" className="sm:col-span-2">
          <Input id="profile-app" value={values.appName} onChange={(e) => set("appName", e.target.value)} maxLength={40} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
