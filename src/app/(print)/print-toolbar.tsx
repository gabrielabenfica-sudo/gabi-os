"use client";

import * as React from "react";
import { ArrowLeft, FileDown } from "lucide-react";

/**
 * Barra das páginas de PDF. "Salvar em PDF" abre a janela de impressão do navegador,
 * onde se escolhe "Salvar como PDF" — o arquivo sai com o nome do título do documento.
 */
export function PrintToolbar({
  label, fileTitle, backHref, autoPrint, breaksToggle,
}: { label: string; fileTitle: string; backHref: string; autoPrint: boolean; breaksToggle?: boolean }) {
  const [breaks, setBreaks] = React.useState(true);

  React.useEffect(() => {
    document.title = fileTitle;
  }, [fileTitle]);

  React.useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pr-root");
    if (root) root.dataset.breaks = breaksToggle && breaks ? "on" : "off";
  }, [breaks, breaksToggle]);

  React.useEffect(() => {
    if (!autoPrint) return;
    // Espera as fontes e o layout antes de abrir a janela de impressão
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className="pr-toolbar" role="toolbar" aria-label="Ações do PDF">
      <a className="pr-btn" href={backHref} onClick={(e) => {
        // Aberta em nova aba: fecha; senão, volta para o app
        if (window.opener) {
          e.preventDefault();
          window.close();
        }
      }}>
        <ArrowLeft /> Voltar
      </a>
      <span className="pr-toolbar-title">{label}</span>
      {breaksToggle && (
        <label>
          <input type="checkbox" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} />
          Cada roteiro em uma página
        </label>
      )}
      <button type="button" className="pr-btn pr-btn-primary" onClick={() => window.print()}>
        <FileDown /> Salvar em PDF
      </button>
    </div>
  );
}
