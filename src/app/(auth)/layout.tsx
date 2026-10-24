export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-brand font-semibold text-white">G</span>
          <span className="text-lg font-semibold tracking-tight">Gabi OS</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Sua vida, seu trabalho e seus negócios em um só lugar.
          </p>
          <p className="mt-4 text-sidebar-muted">
            TURBO, vida pessoal e Mentoria organizados com clareza, sem misturar o que deve ficar separado.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">Central de Gestão</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand/25 blur-3xl"
        />
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
