import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { session, loading, signIn, resetSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("gabrielabenficamkt@hotmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate("/", { replace: true });
    } catch (submitError) {
      const message = (submitError instanceof Error ? submitError.message : "").toLowerCase();
      if (message.includes("invalid login") || message.includes("invalid credentials")) {
        setError("E-mail ou senha incorretos. Confira a senha temporária e tente de novo.");
      } else if (message.includes("email not confirmed")) {
        setError("Este e-mail ainda não foi confirmado.");
      } else if (message.includes("failed to fetch") || message.includes("network")) {
        setError("Não conseguimos falar com o servidor. Tente novamente em instantes.");
      } else {
        setError("Não foi possível entrar. Tente novamente.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-warm p-10 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 font-display text-xl text-primary ring-1 ring-primary/25">
            G
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg text-foreground">Gabi OS</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              sistema da vida
            </p>
          </div>
        </div>

        <div className="max-w-md space-y-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
            Rotina · metas · conteúdo · vida
          </p>
          <h1 className="font-display text-[2.6rem] leading-[1.1] text-foreground">
            Tudo o que você construiu, em um só lugar.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Suas áreas de trabalho, a rotina que sustenta o dia, as metas da roda da vida e o
            conteúdo do Instagram — juntos, no seu ritmo.
          </p>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {["Trabalho TURBO", "Pessoal", "Mentoria"].map((area) => (
              <span key={area} className="rounded-full border border-border bg-card/70 px-3 py-1">
                {area}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Seus dados são privados e ficam vinculados apenas à sua conta.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2 lg:hidden">
            <h1 className="font-display text-2xl text-foreground">Gabi OS</h1>
            <p className="text-sm text-muted-foreground">Entre para abrir o seu sistema.</p>
          </div>

          <div className="space-y-1">
            <h2 className="font-display text-2xl text-foreground">Bem-vinda de volta</h2>
            <p className="text-sm text-muted-foreground">
              Seu painel, sua rotina e seus projetos estão esperando.
            </p>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Entrar
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              Acesso privado · seus dados não são compartilhados.
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Este app é pessoal: só a sua conta tem acesso. Troque a senha em Ajustes quando quiser.
            </p>
            <button
              type="button"
              className="text-[11px] text-primary underline-offset-2 hover:underline"
              onClick={async () => {
                await resetSession();
                window.location.reload();
              }}
            >
              Problemas para entrar? Limpar a sessão deste navegador
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
