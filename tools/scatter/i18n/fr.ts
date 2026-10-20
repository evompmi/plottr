// French catalog for the Scatter tool. Typed Record<ScatterKey, string>.

import type { ScatterKey } from "./en";

const fr: Record<ScatterKey, string> = {
  "scatter.err.empty":
    "Le fichier semble vide ou sans lignes de données. Vérifiez votre fichier et réessayez.",
  "scatter.set.all": "Tout",
  "scatter.shapeWarning":
    "Cette colonne a {n} valeurs uniques — seulement 4 formes sont disponibles. Les catégories au-delà de la 4ᵉ réutiliseront les mêmes formes.",
  "scatter.aes.color": "Couleur",
  "scatter.aes.size": "Taille",
  "scatter.aes.shape": "Forme",
  "scatter.example.title": "Jeu de données Iris de Fisher",
  "scatter.example.subtitle": "150 fleurs × 4 mesures · 3 espèces",
  "scatter.upload.hint":
    "CSV · TSV · TXT — une colonne par variable, une ligne par point · 2 Mo max",
  "scatter.dl.csv": "CSV",
  "scatter.dl.csvTitle":
    "Télécharger la table de données filtrée — seulement les colonnes et lignes actuellement tracées",
  "scatter.loaded": "Chargé ",
  "scatter.pastedData": "données collées",
  "scatter.colsRows": " — {rows} lignes × {cols} colonnes",
  "scatter.tile.variables": "Variables",
  "scatter.var.xAxis": "Axe X",
  "scatter.var.yAxis": "Axe Y",
  "scatter.sec.pointStyle": "Style des points",
  "scatter.pt.color": "Couleur",
  "scatter.pt.size": "Taille",
  "scatter.pt.opacity": "Opacité",
  "scatter.pt.stroke": "Contour",
  "scatter.pt.strokeWidth": "Épaisseur du contour",
  "scatter.on": "Activé",
  "scatter.off": "Désact.",
  "scatter.reg.title": "Droite de régression",
  "scatter.reg.needPoints": "Il faut ≥ 2 points avec de la variation en X.",
  "scatter.reg.slope": "pente : ",
  "scatter.reg.intercept": "ordonnée : ",
  "scatter.reg.r2": "R² : ",
  "scatter.reg.undefined": "indéfini",
  "scatter.reg.nEq": "n = ",
  "scatter.reg.color": "Couleur",
  "scatter.reg.width": "Épaisseur",
  "scatter.reg.dashed": "Pointillés",
  "scatter.reg.showEq": "Afficher l’équation & R² sur le tracé",
  "scatter.reg.labelPos": "Position de l’étiquette",
  "scatter.reg.tl": "haut-gauche",
  "scatter.reg.tr": "haut-droite",
  "scatter.reg.bl": "bas-gauche",
  "scatter.reg.br": "bas-droite",
  "scatter.ref.title": "Ligne de référence",
  "scatter.ref.addH": "+ Horiz.",
  "scatter.ref.addV": "+ Vert.",
  "scatter.ref.none": "Aucune ligne de référence.",
  "scatter.ref.yEq": "Y =",
  "scatter.ref.xEq": "X =",
  "scatter.ref.width": "Épaisseur",
  "scatter.ref.dashed": "Pointillés",
  "scatter.ref.labelPlaceholder": "étiquette",
  "scatter.ref.right": "droite",
  "scatter.ref.left": "gauche",
  "scatter.ref.top": "haut",
  "scatter.ref.bottom": "bas",
  "scatter.aes.none": "— Aucun —",
  "scatter.aes.detected": "Détecté : ",
  "scatter.aes.continuous": "numérique (continu)",
  "scatter.aes.categorical.one": "catégoriel ({n} groupe)",
  "scatter.aes.categorical.other": "catégoriel ({n} groupes)",
  "scatter.aes.range": "plage : {min} → {max}",
  "scatter.aes.cbSafe": " · 👁",
  "scatter.aes.cbSafeNote": "👁 adapté au daltonisme",
  "scatter.size.min": "Taille min",
  "scatter.size.max": "Taille max",
  "scatter.sec.axes": "Axes",
  "scatter.axes.xMin": "X min",
  "scatter.axes.xMax": "X max",
  "scatter.axes.yMin": "Y min",
  "scatter.axes.yMax": "Y max",
  "scatter.axes.auto": "auto ({v})",
  "scatter.axes.xLabel": "Étiquette X",
  "scatter.axes.yLabel": "Étiquette Y",
  "scatter.axes.title": "Titre",
  "scatter.axes.tickFontSize": "Taille du texte",
  "scatter.sec.style": "Style",
  "scatter.filters.title": "Filtres",
  "scatter.filters.rows": "{shown} sur {total} lignes",
  "scatter.filters.all": "tout",
  "scatter.chart.fallbackTitle": "Nuage de points",
  "scatter.chart.pointsAria.one": "{n} point de données",
  "scatter.chart.pointsAria.other": "{n} points de données",
  "scatter.chart.regressionAria":
    "Régression linéaire : pente {slope}, ordonnée {intercept}, R² {r2}, n={n}",
  "scatter.corr.pearson": "Pearson r",
  "scatter.corr.spearman": "Spearman ρ",
  "scatter.corr.kendall": "Kendall τ",
  "scatter.sp.correlation": "Corrélation",
  "scatter.sp.assumptionsChecked": "Hypothèses vérifiées",
  "scatter.sp.normalityOf": "Normalité de {axis} · Shapiro-Wilk",
  "scatter.sp.pickGroup":
    "Chaque groupe est testé séparément. Sélectionnez-en un pour voir le détail.",
  "scatter.sp.needsPairs": "Il faut ≥ 3 paires complètes ({n} disponibles).",
  "scatter.sp.analysisExports": "Exports de l’analyse",
  "scatter.sp.rScript": "Script R",
  "scatter.sp.reportTxt": "Rapport .txt",
  "scatter.tab.data": "Données",
  "scatter.tab.points": "Points",
  "scatter.tab.lines": "Lignes",
  "scatter.tab.axes": "Axes",
  "scatter.controlsLabel": "Réglages du graphique",
  "scatter.statsLabel": "Statistiques",
  "scatter.sp.variables": "Variables",
  "scatter.sp.axis": "Axe",
  "scatter.sp.n": "n",
  "scatter.sp.mean": "Moyenne",
  "scatter.sp.sd": "SD",
  "scatter.sp.test": "Test",
  "scatter.sp.recommendedSuffix": "  (recommandé)",
  "scatter.sp.useRecommendation": "Utiliser la recommandation",
  "scatter.sp.suggestedAlt": "Alternative suggérée :",
  "scatter.sp.suggestConsider": "Shapiro-Wilk a signalé des données non normales — envisagez ",
  "scatter.sp.useSuggestion": "Utiliser la suggestion",
  "scatter.sp.kendallNote":
    "Kendall τ ne fournit pas d’IC analytique — utilisez le bootstrap si un IC est requis.",
  "scatter.sp.headingSingle": "Corrélation",
  "scatter.sp.headingGroup": "Corrélation par groupe",
  "scatter.sp.txtTitleSingle": "Télécharger un rapport de corrélation en texte brut",
  "scatter.sp.txtTitleMulti":
    "Télécharger un rapport de corrélation en texte brut couvrant chaque groupe",
  "scatter.sp.rTitleSingle":
    "Télécharger un script R exécutable reproduisant cor.test sur cet ensemble",
  "scatter.sp.rTitleMulti":
    "Télécharger un script R exécutable reproduisant cor.test pour chaque groupe",
  "scatter.howto.title": "Scatter Plot — Comment l’utiliser",
  "scatter.howto.subtitle": "Nuage XY avec mappage optionnel couleur / taille / forme",
  "scatter.howto.purpose":
    "Tracez une colonne numérique contre une autre. Mappez une troisième (ou quatrième, ou cinquième) colonne à la couleur, la taille ou la forme des points pour révéler une structure multivariée en une seule vue.",
  "scatter.howto.dataLayout":
    "Une ligne par point. Au moins deux colonnes <strong>numériques</strong> (les axes X et Y). Les colonnes supplémentaires — catégorielles ou numériques — deviennent des catégories esthétiques ou des filtres.",
  "scatter.howto.display":
    "Couleur-par-colonne optionnelle (dégradé continu ou discrètes), taille-par-colonne et forme-par-colonne. Ajoutez des <strong>lignes de référence</strong> à des valeurs X / Y fixes, superposez une <strong>régression linéaire</strong> avec R² + p-value. Filtrez les lignes par n’importe quelle colonne catégorielle.",
  "scatter.methods.pearson":
    "la corrélation de Pearson (test t bilatéral sur r, avec un intervalle de confiance à 95 % par la transformation z de Fisher)",
  "scatter.methods.spearmanExact":
    "la corrélation de rangs de Spearman (bilatérale ; p-values issues de la distribution nulle de S — exacte pour n ≤ 9, approximation par série d’Edgeworth au-delà, comme dans R)",
  "scatter.methods.spearmanApprox":
    "la corrélation de rangs de Spearman (bilatérale ; approximation t, utilisée en présence d’ex aequo)",
  "scatter.methods.spearmanMixed":
    "la corrélation de rangs de Spearman (bilatérale ; distribution nulle de S sans ex aequo, approximation t avec ex aequo)",
  "scatter.methods.kendallExact": "le τ-b de Kendall (bilatéral ; p-values exactes)",
  "scatter.methods.kendallApprox":
    "le τ-b de Kendall (bilatéral ; approximation normale avec correction des ex aequo)",
  "scatter.methods.kendallMixed":
    "le τ-b de Kendall (bilatéral ; p-values exactes sans ex aequo et n < 50, approximation normale avec correction des ex aequo sinon)",
  "scatter.methods.one":
    "L’association entre {x} et {y} (n = {n} paires complètes) a été évaluée par {test}.",
  "scatter.methods.manySame":
    "L’association entre {x} et {y} a été évaluée séparément pour {names} ({n} paires complètes) par {test}.",
  "scatter.methods.manyMixed":
    "L’association entre {x} et {y} a été évaluée séparément pour chaque groupe ({n} paires complètes) : {list}.",
  "scatter.methods.testFor": "{test} pour {names}",
  "scatter.methods.policy":
    "Le r de Pearson était le test par défaut ; la normalité de chaque variable a été vérifiée par le test de Shapiro-Wilk à titre de diagnostic.",
  "scatter.methods.diagnostics":
    "La normalité de chaque variable a été évaluée par le test de Shapiro-Wilk.",
  "scatter.methods.regression":
    "La droite ajustée est une régression des moindres carrés ordinaires de {y} sur {x}.",
};

export default fr;
