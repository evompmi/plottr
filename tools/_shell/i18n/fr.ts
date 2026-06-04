// French catalog for the shared shell chrome (namespace "shell").
// Typed `Record<ShellKey, string>` against en.ts so a missing key fails
// the typecheck — completeness is enforced by the compiler.

import type { ShellKey } from "./en";

const fr: Record<ShellKey, string> = {
  // CommaFixBanner
  "shell.commaFix.title": "Virgules décimales converties automatiquement en points",
  "shell.commaFix.detail.one":
    "{count} valeur utilisait la virgule comme séparateur décimal (p. ex. « 0,5 » → « 0.5 »).",
  "shell.commaFix.detail.other":
    "{count} valeurs utilisaient la virgule comme séparateur décimal (p. ex. « 0,5 » → « 0.5 »).",

  // DetectedSeparatorBadge
  "shell.separator.comma": "virgule",
  "shell.separator.semicolon": "point-virgule",
  "shell.separator.tab": "tabulation",
  "shell.separator.space": "espace",
  "shell.separator.whitespace": "espace",
  "shell.separator.badge": "· détecté : {sep}",

  // FormulaInjectionBanner
  "shell.formula.title.one": "Cellule suspecte dans les données importées ({count} cellule)",
  "shell.formula.title.other": "Cellules suspectes dans les données importées ({count} cellules)",
  "shell.formula.explain":
    "Les cellules commençant par = + - @ tab CR sont interprétées comme des formules par Excel / LibreOffice / Sheets et pourraient exfiltrer des données ou exécuter du code si vous rouvrez ces données là-bas. Les exports Plöttr les préfixent d’une apostrophe pour les neutraliser — mais le fichier d’origine reste inchangé, donc soyez prudent.",
  "shell.formula.headerLabel": "En-tête — ",
  "shell.formula.colLabel": "colonne {n}",
  "shell.formula.cellWithHeader": "« {header} » ligne {row}",
  "shell.formula.cellNoHeader": "ligne {row} col {col}",
  "shell.formula.overflow": "… et {count} de plus.",

  // ErrorBoundary
  "shell.error.heading": "Une erreur est survenue",
  "shell.error.body":
    "{tool} a rencontré une erreur inattendue et ne peut pas continuer. Vos données sont toujours sur votre machine — rien n’a été envoyé où que ce soit. Essayez de recharger ; si le problème persiste, utilisez « Copier les détails de l’erreur » et ouvrez un ticket.",
  "shell.error.toolFallback": "Cet outil",
  "shell.error.technical": "Détails techniques",
  "shell.error.reload": "Recharger l’outil",
  "shell.error.copy": "Copier les détails de l’erreur",
};

export default fr;
