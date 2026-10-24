import "server-only";
import { cookies } from "next/headers";
import { WORKSPACE_FILTER_COOKIE, type WorkspaceSummary } from "@/server/workspaces";

/** Filtro de ambiente ativo ("all" ou id), validado contra os ambientes da usuária. */
export async function getWorkspaceFilter(workspaces: WorkspaceSummary[]): Promise<string> {
  const store = await cookies();
  const value = store.get(WORKSPACE_FILTER_COOKIE)?.value ?? "all";
  return value === "all" || workspaces.some((w) => w.id === value) ? value : "all";
}
