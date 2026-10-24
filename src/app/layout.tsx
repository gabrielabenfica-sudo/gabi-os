import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { getSession } from "@/server/auth/current";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  const appName = session?.user.appName ?? "Gabi OS";
  return {
    title: { default: `${appName} — Central de Gestão`, template: `%s · ${appName}` },
    description: "Central de gestão pessoal, profissional, financeira e estratégica.",
    applicationName: appName,
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4EFEC" },
    { media: "(prefers-color-scheme: dark)", color: "#1D191F" },
  ],
};

// Aplica o tema "Sistema" antes da pintura para evitar flash
const systemThemeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var r=document.documentElement;if(r.dataset.theme==='SYSTEM'){r.classList.toggle('dark',m.matches);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const theme = session?.user.theme ?? "LIGHT";
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${theme === "DARK" ? "dark" : ""}`}
      data-theme={theme}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: systemThemeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
