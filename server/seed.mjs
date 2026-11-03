// One-time import of the Gabi OS starter data for the owner's account.
import { readFileSync } from "node:fs";
import { getUser, json, userClient, OWNER_EMAIL } from "./lib.mjs";

const seedData = JSON.parse(readFileSync(new URL("./seed-data.json", import.meta.url), "utf8"));

async function insertAll(client, table, rows, userId) {
  if (!rows?.length) return 0;
  const chunkSize = 40;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({ ...row, user_id: userId }));
    const { error } = await client.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return rows.length;
}

const TABLES = [
  "workspaces", "task_statuses", "labels", "tasks", "events", "notes", "goals", "habits", "accounts",
  "categories", "compensation", "pipeline_stages", "content_statuses", "content_items", "content_references",
  "social_profiles", "social_snapshots", "maas_areas", "maas_assessments", "maas_scores", "routine_blocks",
];

export async function seed(req) {
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const client = userClient(user.token);

    // The export belongs to one person: only her account receives the data.
    if ((user.email ?? "").toLowerCase() !== OWNER_EMAIL) {
      return json({ seeded: false, reason: "owner account only" });
    }

    const { data: profile } = await client.from("profiles").select("id, seeded_at").eq("id", user.id).maybeSingle();
    if (!profile) {
      const { error } = await client.from("profiles").insert({
        id: user.id,
        email: user.email,
        name: "Gabriela Benfica",
        timezone: "America/Sao_Paulo",
        theme: "light",
        app_name: "Gabi OS",
      });
      if (error) return json({ error: `profiles: ${error.message}` }, 500);
    }

    // While real data is being migrated from the old app, never load the starter data.
    if (process.env.SEED_DISABLED === "true") return json({ seeded: false, reason: "seed disabled" });

    const { count } = await client
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) > 0) {
      await client.from("profiles").update({ seeded_at: new Date().toISOString() }).eq("id", user.id);
      return json({ seeded: false, reason: "already seeded" });
    }

    const inserted = {};
    for (const table of TABLES) inserted[table] = await insertAll(client, table, seedData[table], user.id);

    const { error: prefsError } = await client
      .from("notification_prefs")
      .upsert({ ...seedData.notification_prefs, user_id: user.id });
    if (prefsError) throw new Error(`notification_prefs: ${prefsError.message}`);

    const { error: integrationError } = await client.from("integrations").upsert(
      [
        { user_id: user.id, provider: "google_calendar", status: "disconnected" },
        { user_id: user.id, provider: "instagram", status: "disconnected" },
      ],
      { onConflict: "user_id,provider" },
    );
    if (integrationError) throw new Error(`integrations: ${integrationError.message}`);

    await client.from("profiles").update({ seeded_at: new Date().toISOString() }).eq("id", user.id);
    return json({ seeded: true, inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("seed-gabi-os failed", message);
    return json({ error: message }, 500);
  }
}
