import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/current";
import { isRegistrationOpen } from "@/server/auth/accounts";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  const canRegister = await isRegistrationOpen();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse sua central de gestão.</p>
      </div>
      <LoginForm next={next ?? "/"} />
      {canRegister && (
        <p className="text-center text-sm text-muted-foreground">
          Primeiro acesso?{" "}
          <Link href="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </p>
      )}
    </div>
  );
}
