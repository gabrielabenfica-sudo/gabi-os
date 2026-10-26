import { requireUser } from "@/server/auth/current";
import { contentForExport } from "@/server/content";
import { formatLabel } from "@/lib/content";
import { todayYmd } from "@/lib/dates";
import { br, partsInTz } from "@/app/(app)/conteudo/shared";
import { PrintToolbar } from "@/app/(print)/print-toolbar";

export const metadata = { title: "Roteiros" };

export default async function ScriptsPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tz = user.timezone;
  const ids = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const items = await contentForExport(user.id, ids);
  const today = todayYmd(tz);
  const when = (d: Date | null) => {
    if (!d) return null;
    const p = partsInTz(d, tz);
    return p.hm === "12:00" ? br(p.ymd) : `${br(p.ymd)} às ${p.hm}`;
  };
  const fileTitle = items.length === 1 ? `Roteiro - ${items[0]!.title}` : `Roteiros - ${br(today).replaceAll("/", "-")}`;

  return (
    <>
      <PrintToolbar
        label={`${items.length} ${items.length === 1 ? "roteiro" : "roteiros"}`}
        fileTitle={fileTitle}
        backHref="/conteudo?aba=lista"
        autoPrint={sp.auto !== "0" && items.length > 0}
        breaksToggle={items.length > 1}
      />
      <main className="pr-sheet" data-testid="print-scripts">
        <header className="pr-doc-head">
          <h1>{items.length === 1 ? "Roteiro" : "Roteiros"}</h1>
          <p>
            {items.length} {items.length === 1 ? "conteúdo" : "conteúdos"}
            <br />
            Exportado em {br(today)}
          </p>
        </header>

        {items.length === 0 && <p className="pr-empty">Nenhum conteúdo encontrado. Volte e selecione os roteiros que quer exportar.</p>}

        {items.map((c, i) => {
          const recording = when(c.recordingDate);
          const publish = when(c.publishedAt ?? c.publishDate);
          const sections: { title: string; text: string | null; className?: string; long?: boolean }[] = [
            { title: "Objetivo", text: c.objective },
            { title: "Público", text: c.audience },
            { title: "Gancho", text: c.hook, className: "pr-hook" },
            { title: "Roteiro", text: c.script, className: "pr-script", long: true },
            { title: "Chamada para ação (CTA)", text: c.cta },
            { title: "Participantes", text: c.participants },
            { title: "Referências", text: c.references, long: true },
            { title: "Observações", text: c.notes, long: true },
          ];
          return (
            <article key={c.id} className="pr-item" data-script={c.title}>
              <h2>
                {items.length > 1 && <span className="pr-index">{i + 1}.</span>}
                {c.title}
              </h2>
              <p className="pr-meta">
                <span>{c.workspace.name}</span>
                {c.format && <span>{formatLabel(c.format)}</span>}
                {c.profile && <span>@{c.profile.username}</span>}
                <span>{c.status.name}</span>
              </p>
              {(recording || publish) && (
                <p className="pr-meta">
                  {recording && <span>Gravação: {recording}</span>}
                  {publish && <span>{c.publishedAt ? "Publicado" : "Publicação"}: {publish}</span>}
                </p>
              )}
              {sections.map((s) => {
                const text = s.text?.trim();
                return text ? (
                  <section key={s.title} className={`pr-section${s.long ? " pr-long" : ""}`}>
                    <h3>{s.title}</h3>
                    <p className={`pr-text ${s.className ?? ""}`}>{text}</p>
                  </section>
                ) : null;
              })}
              {!c.script?.trim() && (
                <section className="pr-section">
                  <h3>Roteiro</h3>
                  <p className="pr-text pr-muted">Roteiro ainda não escrito.</p>
                </section>
              )}
            </article>
          );
        })}
      </main>
    </>
  );
}
