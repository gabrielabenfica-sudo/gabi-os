"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { listWorkspaces, WORKSPACE_FILTER_COOKIE } from "@/server/workspaces";
import { updateTheme } from "@/server/settings";

export async function setWorkspaceFilterAction(value: string) {
  const user = await requireUser();
  const workspaces = await listWorkspaces(user.id);
  const valid = value === "all" || workspaces.some((w) => w.id === value);
  const store = await cookies();
  store.set(WORKSPACE_FILTER_COOKIE, valid ? value : "all", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export async function setThemeAction(theme: "LIGHT" | "DARK" | "SYSTEM") {
  const user = await requireUser();
  if (!["LIGHT", "DARK", "SYSTEM"].includes(theme)) return;
  await updateTheme(user.id, theme);
  revalidatePath("/", "layout");
}
