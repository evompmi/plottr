// French catalog for the Volcano tool. Typed Record<VolcanoKey, string>.

import type { VolcanoKey } from "./en";

const fr: Record<VolcanoKey, string> = {
  "volcano.err.fewCols":
    "Le fichier semble vide ou comporte moins de deux colonnes. Volcano attend au moins une colonne log2FC et une colonne de p-value.",
  "volcano.xLabelFallback": "log₂(variation d’expression)",
  "volcano.example.title": "Résultats DESeq2 fictifs",
  "volcano.example.subtitle": "200 caractéristiques · transcriptomique circadienne végétale",
  "volcano.upload.hint":
    "CSV · TSV · TXT · une ligne par caractéristique · attend des colonnes log2FC + p-value · 2 Mo max",
  "volcano.class.ns": "non significatif",
  "volcano.class.down": "sous-exprimé",
  "volcano.class.up": "surexprimé",
  "volcano.chart.fallbackTitle": "Volcano plot",
  "volcano.chart.pointsTotal.one": "{n} point au total",
  "volcano.chart.pointsTotal.other": "{n} points au total",
  "volcano.chart.descPoints.one": "{n} point",
  "volcano.chart.descPoints.other": "{n} points",
  "volcano.chart.desc":
    "Volcano plot de {points} : {up} surexprimés, {down} sous-exprimés, {ns} non significatifs{discarded}",
  "volcano.chart.descDiscarded": ", {n} écartés",
  "volcano.chart.classPointsAria.one": "{count} point {label}",
  "volcano.chart.classPointsAria.other": "{count} points {label}",
  "volcano.table.summary": "Afficher les points en tableau",
  "volcano.table.caption":
    "{n} points avec log₂ de la variation, p-value et classe de significativité, dans l’ordre du fichier",
  "volcano.table.truncated": "Nombreux points — affichage des {shown} premiers sur {total}.",
  "volcano.table.colLabel": "Étiquette",
  "volcano.table.colFc": "log₂FC",
  "volcano.table.colP": "p",
  "volcano.table.colClass": "Classe",
  "volcano.table.noLabel": "(sans étiquette)",
  "volcano.aes.x": "Axe X · log₂ de la variation d’expression",
  "volcano.aes.y": "Axe Y · p-value (−log₁₀)",
  "volcano.aes.label": "Étiquette de caractéristique (optionnel)",
  "volcano.aes.colorMap": "Couleur",
  "volcano.aes.sizeMap": "Taille",
  "volcano.thresh.title": "Seuils",
  "volcano.thresh.fcCutoff": "Seuil |log2FC|",
  "volcano.thresh.pCutoff": "Seuil de p-value",
  "volcano.thresh.none": "Aucun",
  "volcano.thresh.showRefLines": "Afficher les lignes de référence",
  "volcano.on": "Activé",
  "volcano.off": "Désactivé",
  "volcano.colors.title": "Couleurs",
  "volcano.colors.up": "Surexprimé",
  "volcano.colors.down": "Sous-exprimé",
  "volcano.colors.ns": "Non significatif",
  "volcano.search.label": "Rechercher par nom",
  "volcano.search.placeholder": "nom de gène (ou collez une liste)",
  "volcano.search.inputTitle": "Séparés par virgule ou retour à la ligne. Insensible à la casse.",
  "volcano.search.add": "Ajouter",
  "volcano.search.disabledTitle":
    "Choisissez une colonne d’étiquettes dans Configurer pour activer la recherche",
  "volcano.search.typeTitle": "Saisissez un nom à rechercher",
  "volcano.search.addTitle.one": "Ajouter {n} point correspondant à l’ensemble étiqueté",
  "volcano.search.addTitle.other": "Ajouter {n} points correspondants à l’ensemble étiqueté",
  "volcano.search.disabledHint":
    "↳ Choisissez une colonne d’étiquettes dans Configurer pour activer la recherche",
  "volcano.search.placeholderHint":
    "↳ Séparés par virgule ou retour à la ligne · sous-chaîne insensible à la casse",
  "volcano.search.noMatches": "aucune correspondance",
  "volcano.search.matches.one": "{n} correspondance",
  "volcano.search.matches.other": "{n} correspondances",
  "volcano.search.overlap": " — les étiquettes peuvent se chevaucher",
  "volcano.search.unmatched": " · {n} sans correspondance",
  "volcano.search.showUnmatched": "afficher les non correspondants",
  "volcano.search.hideUnmatched": "masquer les non correspondants",
  "volcano.search.unmatchedToggleTitle": "Afficher/masquer la liste des termes sans correspondance",
  "volcano.cfg.adjusted":
    "Cette colonne est une p-value <strong>ajustée</strong> (FDR / BH / qvalue)",
  "volcano.cfg.adjustedNote":
    "Tracée en −log₁₀(p). La détection automatique préfère une colonne ajustée lorsque brute et ajustée sont toutes deux présentes.",
  "volcano.cfg.labelNone": "— aucune —",
  "volcano.cfg.labelNote":
    "Colonne catégorielle servant à annoter les top-N caractéristiques les plus significatives (symbole de gène, nom de protéine, accession). À ignorer si vos données n’ont pas de telle colonne.",
  "volcano.cfg.assignWarn":
    "Attribuez à la fois une <strong>colonne log₂FC</strong> et une <strong>colonne p-value</strong> pour débloquer l’étape Graphe dans la navigation ci-dessus.",
  "volcano.cfg.pastedData": "(données collées)",
  "volcano.cfg.colsRows": " — {cols} colonnes × {rows} lignes",
  "volcano.cfg.preview": "Aperçu (8 premières lignes) :",
  "volcano.dl.csv": "CSV",
  "volcano.dl.csvTitle":
    "Télécharger la table de classification par caractéristique — caractéristique, log2FC, p, −log10(p), classe",
  "volcano.dl.r": "R",
  "volcano.dl.rTitle":
    "Télécharger un script R ggplot2 autonome qui reproduit ce volcano à partir des données sous-jacentes",
  "volcano.steps.clamped.one":
    "{count} caractéristique avait p = 0 ; bornée à un plancher fini pour l’affichage afin que l’axe Y reste borné.",
  "volcano.steps.clamped.other":
    "{count} caractéristiques avaient p = 0 ; bornées à un plancher fini pour l’affichage afin que l’axe Y reste borné.",
  "volcano.labels.title": "Étiquettes",
  "volcano.labels.annotateTop": "Annoter les caractéristiques principales",
  "volcano.labels.clicked.one": "{n} point cliqué",
  "volcano.labels.clicked.other": "{n} points cliqués",
  "volcano.labels.clearTitle":
    "Effacer la sélection manuelle — l’étiquetage revient aux choix top-N automatiques",
  "volcano.labels.clear": "Effacer",
  "volcano.labels.clickHint": "↳ Cliquez sur un point du graphique pour l’étiqueter directement",
  "volcano.labels.topUp": "Top surexprimés",
  "volcano.labels.topDown": "Top sous-exprimés",
  "volcano.labels.fontSize": "Taille de police",
  "volcano.labels.densityWarn":
    "{forced} étiquettes sur {attempted} n’ont pas pu se placer proprement à cette densité de données.",
  "volcano.labels.dropTitle":
    "Réduire le top-N à ({up} haut / {down} bas) pour que chaque étiquette se place sans chevauchement.",
  "volcano.labels.useSuggested": "Utiliser la suggestion ({up} / {down})",
  "volcano.style.title": "Style",
  "volcano.style.plotWidth": "Largeur du tracé",
  "volcano.style.pointRadius": "Rayon des points",
  "volcano.style.pointAlpha": "Opacité des points",
  "volcano.style.showGrid": "Afficher la grille",
  "volcano.style.tickFontSize": "Taille du texte",
  "volcano.style.plotTitle": "Titre du tracé",
  "volcano.style.optional": "(optionnel)",
  "volcano.map.none": "— Aucun —",
  "volcano.map.detected": "Détecté : ",
  "volcano.map.continuous": "numérique (continu)",
  "volcano.map.categorical.one": "catégoriel ({n} groupe)",
  "volcano.map.categorical.other": "catégoriel ({n} groupes)",
  "volcano.map.diverging": "  (divergente)",
  "volcano.map.direction": "Direction",
  "volcano.map.directionAria": "Direction de la palette",
  "volcano.map.normal": "Normale",
  "volcano.map.inverted": "Inversée",
  "volcano.map.range": "plage : {min} → {max}",
  "volcano.size.minRadius": "Rayon min",
  "volcano.size.maxRadius": "Rayon max",
  "volcano.size.fallbackNote":
    "Les cellules non numériques / vides reviennent au rayon par défaut de la tuile Style.",
  "volcano.summary.up": "↑ haut",
  "volcano.summary.down": "↓ bas",
  "volcano.summary.ns": "· ns",
  "volcano.summary.ofValid": "sur {n} valides",
  "volcano.summary.discarded": " (+{n} écartés)",
  "volcano.summary.cutoffs": "|log2FC| > {fc} · p < {p}",
  "volcano.howto.title": "Volcano Plot — Comment l’utiliser",
  "volcano.howto.subtitle": "Une ligne par caractéristique · log₂FC en X · p-value (−log₁₀) en Y",
  "volcano.howto.purpose":
    "Mettez en évidence les caractéristiques différentiellement exprimées en combinant <strong>variation d’expression</strong> et <strong>significativité statistique</strong> — la façon canonique d’inspecter des tables RNA-seq, protéomiques ou métabolomiques.",
  "volcano.howto.dataLayout":
    "Une <strong>ligne</strong> par caractéristique. Deux colonnes numériques : une <strong>variation d’expression log₂</strong> et une <strong>p-value</strong> (brute ou ajustée). Une colonne <strong>étiquette</strong> optionnelle (symbole de gène, identifiant) pilote les annotations. Les noms de colonnes DESeq2, limma, edgeR, MaxQuant sont détectés automatiquement.",
  "volcano.howto.display":
    "Ajustez les seuils <strong>|log₂FC|</strong> + <strong>p</strong> dans la tuile Seuils pour définir la répartition haut / bas / ns. Étiquetez les caractéristiques via top-N automatique, clic-pour-étiqueter, ou recherche par liste collée dans la tuile Étiquettes. Des mappages esthétiques optionnels de couleur et de taille (p. ex. niveau d’expression) génèrent des légendes en SVG.",
};

export default fr;
