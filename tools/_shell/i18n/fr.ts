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

  // FileDropZone
  "shell.upload.dropAria": "Déposez un fichier de données ici ou appuyez sur Entrée pour parcourir",
  "shell.upload.dropMain": "Déposez un CSV, TSV ou TXT — ou cliquez pour parcourir",
  "shell.upload.dropHint": "CSV · TSV · TXT · DAT — 2 Mo max",
  "shell.upload.tooLarge":
    "Fichier trop volumineux ({mb} Mo). Le maximum est 2 Mo — divisez le fichier ou échantillonnez des lignes et réessayez.",
  "shell.upload.largeWarn": "Fichier volumineux ({mb} Mo) — l’analyse peut prendre un moment.",
  "shell.upload.readError":
    "Impossible de lire le fichier ({msg}). Vérifiez les autorisations et réessayez.",
  "shell.upload.unknownError": "erreur inconnue",
  "shell.upload.reading": "Lecture du fichier…",

  // DataPreview
  "shell.preview.more": "… {n} de plus ({total} au total)",

  // ColumnRoleEditor
  "shell.roles.group": "groupe",
  "shell.roles.value": "valeur",
  "shell.roles.filter": "filtre",
  "shell.roles.ignore": "ignorer",
  "shell.cols.heading": "Rôles des colonnes",
  "shell.cols.help.exactlyOne": "Exactement une colonne ",
  "shell.cols.help.xAxisAndOne": " (axe des x) et une colonne ",
  "shell.cols.help.numericPicking": " (numérique). Choisir ",
  "shell.cols.help.or": " ou ",
  "shell.cols.help.demotesTo": " sur une autre colonne rétrograde la précédente en ",
  "shell.cols.help.period": ".",

  // StepNavBar
  "shell.step.upload": "Importer",
  "shell.step.configure": "Configurer",
  "shell.step.filter": "Filtrer",
  "shell.step.output": "Sortie",
  "shell.step.plot": "Tracé",
  "shell.step.aria": "Étape {n} sur {total} : {label}",

  // UploadPanel — separator picker + options
  "shell.sep.label": "Séparateur de colonnes",
  "shell.sep.force": "Forcer le séparateur",
  "shell.sep.select": "— Sélectionner —",
  "shell.sep.auto": "Détection auto",
  "shell.sep.comma": "Virgule (,)",
  "shell.sep.semicolon": "Point-virgule (;)",
  "shell.sep.tab": "Tabulation (\\t)",
  "shell.sep.space": "Espace",
  "shell.sep.pickToEnable":
    "Choisissez un séparateur de colonnes ci-dessus pour activer le chargement de fichier",
  "shell.sep.overrideHint":
    "Nécessaire uniquement lorsque le détecteur choisit le mauvais délimiteur.",
  "shell.sep.autoInfo":
    "Plöttr détecte automatiquement le séparateur de colonnes (virgule, tabulation, point-virgule, …) à partir des données.",
  "shell.sep.overrideShow": "Forcer ▾",
  "shell.sep.overrideHide": "Masquer ▴",

  // UploadPanel — sample-dataset CTA
  "shell.sample.try": "Essayer des données d’exemple :",
  "shell.sample.loadExample": "Charger l’exemple →",
  "shell.sample.tryDataset": "Essayer un jeu de données d’exemple",
  "shell.sample.plotThis": "Tracer cet exemple →",
  "shell.sample.quickStart": "Nouveau ici ? Démarrage rapide",

  // UploadPanel — paste card
  "shell.paste.dropTitle": "Déposer un fichier",
  "shell.paste.pasteTitle": "Coller des données",
  "shell.paste.placeholder":
    "Collez ici des lignes séparées par des virgules, tabulations ou points-virgules.\nAstuce : une sélection copiée depuis Excel ou Google Sheets devient automatiquement séparée par des tabulations.",
  "shell.paste.aria": "Coller des données tabulaires",
  "shell.paste.parse": "Analyser les données collées",
  "shell.paste.clear": "Effacer",
  "shell.paste.maxSize": "2 Mo max",
  "shell.paste.empty":
    "Collez d’abord des données — copiez une sélection depuis Excel, Sheets ou n’importe quel CSV.",
  "shell.paste.tooLarge":
    "Données collées trop volumineuses ({mb} Mo). Le maximum est 2 Mo — divisez les données ou échantillonnez des lignes et réessayez.",
  "shell.paste.largeWarn": "Collage volumineux ({mb} Mo) — l’analyse peut prendre un moment.",

  // ActionsPanel
  "shell.actions.title": "Actions",
  "shell.actions.svgTitle":
    "Télécharger le tracé en SVG — graphique vectoriel, modifiable dans Inkscape ou Illustrator",
  "shell.actions.pngTitle":
    "Télécharger le tracé en PNG — raster 2× à la résolution native du tracé",
  "shell.actions.startOver": "Recommencer",
  "shell.actions.resetTitle":
    "Effacer toutes les données, les réglages et la session en cours — retour à l’étape d’import",

  // HowTo
  "shell.howto.purpose": "Objectif",
  "shell.howto.dataLayout": "Disposition des données",
  "shell.howto.display": "Affichage",
  "shell.howto.tips": "Astuces",

  // SegToggle / OnOffToggle
  "shell.toggle.on": "Activé",
  "shell.toggle.off": "Désactivé",

  // FilterCheckboxPanel
  "shell.filter.heading": "Filtrer les lignes ({shown}/{total})",
  "shell.filter.all": "Tout",
  "shell.filter.none": "Aucun",
  "shell.filter.numericHint": "numérique — utiliser la plage de l’axe dans le tracé",

  // RenameReorderPanel
  "shell.rename.heading": "Renommer les valeurs & réordonner les groupes ",
  "shell.rename.hint": "(glissez ☰ pour réordonner les groupes sur le tracé)",
  "shell.rename.empty": "(vide)",

  // DiscretePaletteRow
  "shell.palette.copied": "✓ Copié {hex}",
  "shell.palette.clickToCopy": "Cliquez sur une pastille pour copier son hex",

  // PrefsPanel
  "shell.prefs.title": "Réglages visuels du tracé",
  "shell.prefs.save": "Enregistrer dans un fichier",
  "shell.prefs.saveTitle": "Télécharger les réglages visuels actuels dans un fichier JSON",
  "shell.prefs.load": "Charger depuis un fichier",
  "shell.prefs.loadTitle": "Appliquer les réglages visuels depuis un fichier JSON enregistré",
  "shell.prefs.reset": "Réinitialiser",
  "shell.prefs.resetTitle":
    "Restaurer les réglages visuels par défaut et effacer les préférences enregistrées",
  "shell.prefs.loadError": "Impossible de charger le fichier de réglages.",
};

export default fr;
