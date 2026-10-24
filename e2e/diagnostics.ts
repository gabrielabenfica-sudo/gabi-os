import { test as base } from "@playwright/test";

/**
 * Fixture que registra console, erros de página e respostas de Server Actions.
 * Em falha no CI, emite tudo como anotação do GitHub Actions (os artefatos nem
 * sempre são acessíveis), facilitando o diagnóstico.
 */
export const test = base.extend<{ diag: string[] }>({
  diag: [
    async ({ page }, use, testInfo) => {
      const lines: string[] = [];
      const t0 = Date.now();
      const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") lines.push(`${stamp()} console.${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => lines.push(`${stamp()} pageerror: ${e.message}`));
      page.on("requestfailed", (r) => lines.push(`${stamp()} requestfailed ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
      page.on("request", (r) => {
        if (r.method() === "POST") lines.push(`${stamp()} → POST ${new URL(r.url()).pathname} action=${r.headers()["next-action"] ?? "-"}`);
      });
      page.on("response", (r) => {
        if (r.request().method() === "POST") lines.push(`${stamp()} ← ${r.status()} ${new URL(r.url()).pathname}`);
      });
      page.on("requestfinished", (r) => {
        if (r.method() === "POST") lines.push(`${stamp()} ✓ body done POST ${new URL(r.url()).pathname}`);
      });
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) lines.push(`${stamp()} nav ${new URL(f.url()).pathname}`);
      });
      await use(lines);
      if (testInfo.status !== testInfo.expectedStatus && process.env.CI) {
        const body = lines.filter((l) => !l.includes("requestfailed GET")).slice(-80).join("\n").replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
        console.log(`::warning title=Diagnóstico E2E (${testInfo.title})::${body || "sem eventos"}`);
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
