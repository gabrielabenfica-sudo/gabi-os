import { requireUser } from "@/server/auth/current";
import "./print.css";

/** Páginas de impressão/PDF: sem menu lateral nem cabeçalho do app. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="pr-root">{children}</div>;
}
