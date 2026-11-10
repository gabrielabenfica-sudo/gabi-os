// Gabi OS API: runs the functions that need secrets (assistant, integrations, seed).
// Everything else goes straight from the browser to Neon.
import http from "node:http";
import { Readable } from "node:stream";
import { corsHeaders, json, sql } from "./lib.mjs";
import { assistant } from "./assistant.mjs";
import { integrations } from "./integrations.mjs";
import { integrationsCallback } from "./callback.mjs";
import { seed } from "./seed.mjs";
import { sheetSync } from "./sheets.mjs";

const routes = {
  "/functions/v1/assistant": assistant,
  "/functions/v1/integrations": integrations,
  "/functions/v1/integrations-callback": integrationsCallback,
  "/functions/v1/seed-gabi-os": seed,
  "/functions/v1/sheet-sync": sheetSync,
};

// Temporary: receives the export of the old app (Enter) so it can be moved into Neon.
// Only works while MIGRATION_TOKEN is set on the server; remove it after the move.
async function importStaging(req) {
  const expected = process.env.MIGRATION_TOKEN ?? "";
  if (!expected || req.headers.get("x-migration-token") !== expected) return json({ error: "forbidden" }, 403);
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "invalid payload" }, 400);
  const [row] = await sql`
    insert into public.migration_staging (source, payload) values ('enter', ${JSON.stringify(payload)}::jsonb)
    returning id`;
  return json({ ok: true, id: row.id });
}

async function handle(req) {
  const { pathname } = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (pathname === "/" || pathname === "/health") return json({ ok: true, service: "gabi-os-api" });
  if (pathname === "/migration/import" && req.method === "POST") return importStaging(req);
  const route = routes[pathname.replace(/\/$/, "")];
  if (!route) return json({ error: "not found" }, 404);
  return route(req);
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  try {
    const url = `http://${nodeReq.headers.host ?? "localhost"}${nodeReq.url}`;
    const hasBody = nodeReq.method !== "GET" && nodeReq.method !== "HEAD";
    const request = new Request(url, {
      method: nodeReq.method,
      headers: nodeReq.headers,
      body: hasBody ? Readable.toWeb(nodeReq) : undefined,
      duplex: hasBody ? "half" : undefined,
    });
    const response = await handle(request);
    nodeRes.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      Readable.fromWeb(response.body).pipe(nodeRes);
    } else {
      nodeRes.end();
    }
  } catch (error) {
    console.error("request failed", error);
    if (!nodeRes.headersSent) nodeRes.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
    nodeRes.end(JSON.stringify({ error: "internal error" }));
  }
});

const port = Number(process.env.PORT ?? 3001);
server.listen(port, () => console.log(`gabi-os-api listening on ${port}`));
