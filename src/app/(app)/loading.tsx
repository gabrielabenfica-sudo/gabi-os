export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
