import { requireUser } from "@/server/auth/current";
import { listRoutineDay } from "@/server/routine";
import { todayYmd } from "@/lib/dates";
import { durationLabel, longDate, routineProgress } from "@/lib/routine";
import { br } from "@/app/(app)/conteudo/shared";
import { PrintToolbar } from "@/app/(print)/print-toolbar";

export const metadata = { title: "Rotina do dia" };

export default async function RoutinePrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const date = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : todayYmd(user.timezone);
  const items = await listRoutineDay(user.id, date);
  const progress = routineProgress(items);
  const title = longDate(date);

  return (
    <>
      <PrintToolbar
        label="Rotina do dia"
        fileTitle={`Rotina - ${br(date).replaceAll("/", "-")}`}
        backHref={`/rotina?dia=${date}`}
        autoPrint={sp.auto !== "0" && items.length > 0}
      />
      <main className="pr-sheet" data-testid="print-routine">
        <header className="pr-doc-head">
          <h1 style={{ textTransform: "capitalize" }}>{title}</h1>
          <p>Rotina do dia</p>
        </header>
        {items.length === 0 ? (
          <p className="pr-empty">Nenhum bloco na rotina deste dia.</p>
        ) : (
          <>
            {progress.done > 0 && <p className="pr-progress">{progress.done} de {progress.total} concluídos</p>}
            <table className="pr-table">
              <thead>
                <tr>
                  <th className="pr-check" aria-label="Feito" />
                  <th>Horário</th>
                  <th>Atividade</th>
                  <th>Ambiente</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const dur = durationLabel(i.startTime, i.endTime);
                  return (
                    <tr key={i.id} data-item={i.title}>
                      <td className="pr-check"><span className="pr-box">{i.done ? "✓" : ""}</span></td>
                      <td className="pr-time">
                        {i.startTime ? `${i.startTime}${i.endTime ? `–${i.endTime}` : ""}` : "—"}
                        {dur && <small>{dur}</small>}
                      </td>
                      <td>
                        <span className={i.done ? "pr-done" : undefined}>{i.title}</span>
                        {i.notes && <span className="pr-notes">{i.notes}</span>}
                      </td>
                      <td>
                        {i.workspace && (
                          <span className="pr-ws">
                            <span className="pr-dot" style={{ background: i.workspace.color }} />
                            {i.workspace.name}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        <div className="pr-lines" aria-hidden>
          <h3>Anotações</h3>
          <div />
          <div />
          <div />
          <div />
        </div>
      </main>
    </>
  );
}
