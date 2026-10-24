"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { updateTheme } from "@/server/settings";

export async function setThemeAction(theme: "LIGHT" | "DARK" | "SYSTEM") {
  const user = await requireUser();
  if (!["LIGHT", "DARK", "SYSTEM"].includes(theme)) return;
  await updateTheme(user.id, theme);
  revalidatePath("/", "layout");
}
