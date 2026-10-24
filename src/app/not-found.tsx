import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-brand">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">O endereço pode ter mudado ou não existe.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Voltar ao Dashboard
        </Link>
      </div>
    </main>
  );
}
