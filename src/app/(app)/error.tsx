"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-6 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Não foi possível carregar esta tela. Seus dados não foram alterados.
        {error.digest && <span className="mt-1 block text-xs">Código: {error.digest}</span>}
      </p>
      <Button className="mt-4" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
