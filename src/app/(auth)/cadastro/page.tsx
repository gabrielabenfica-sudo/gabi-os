import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/current";
import { isRegistrationOpen } from "@/server/auth/accounts";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/");
  if (!(await isRegistrationOpen())) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Cadastro desativado</h1>
        <p className="text-sm text-muted-foreground">
          Esta central já tem uma administradora. Novos acessos são liberados por ela.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Criar sua conta</h1>
        <p className="text-sm text-muted-foreground">
          A primeira conta criada é a administradora. Os ambientes TURBO, Pessoal e Mentoria são preparados
          automaticamente.
        </p>
      </div>
      <RegisterForm />
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
