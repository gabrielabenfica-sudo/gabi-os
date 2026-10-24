import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/current";
import { addFileAttachment, MAX_ATTACHMENT_BYTES } from "@/server/attachments";
import { errorMessage } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Upload de arquivo (multipart): campos entityType, entityId e file. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "O arquivo passa do limite de 5 MB." }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    const attachment = await addFileAttachment(session.user.id, {
      entityType: String(form.get("entityType") ?? ""),
      entityId: String(form.get("entityId") ?? ""),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ attachment, url: `/api/attachments/${attachment.id}` });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
