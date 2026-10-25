/** Rótulos compartilhados entre servidor e telas. */
export const NATURES = ["ONE_OFF", "FIXED", "VARIABLE", "RECURRING", "INSTALLMENT"] as const;
export const NATURE_LABEL: Record<(typeof NATURES)[number], string> = {
  ONE_OFF: "Avulsa",
  FIXED: "Fixa",
  VARIABLE: "Variável",
  RECURRING: "Recorrente",
  INSTALLMENT: "Parcelada",
};
