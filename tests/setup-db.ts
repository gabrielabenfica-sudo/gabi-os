import { afterAll, beforeEach } from "vitest";
import { db } from "@/server/db";

if (!process.env.DATABASE_URL) {
  throw new Error("Testes de integração exigem DATABASE_URL apontando para um Postgres de teste.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Recusando limpar o banco com NODE_ENV=production.");
}

/** Limpa todas as tabelas antes de cada teste (banco de teste descartável). */
beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await db.$disconnect();
});
