// French catalog for the Heatmap tool. Typed Record<HeatmapKey, string>.

import type { HeatmapKey } from "./en";

const fr: Record<HeatmapKey, string> = {
  "heatmap.dl.csv": "CSV",
  "heatmap.dl.csvTitle":
    "Télécharger la matrice tracée en CSV — normalisation et réordonnancement lignes / colonnes appliqués",
  "heatmap.dl.r": "Script R",
  "heatmap.dl.rTitle":
    "Télécharger un script R exécutable qui reproduit ce graphique avec pheatmap (inclut la matrice brute, le clustering, la normalisation, la palette)",
  "heatmap.cluster.none": "Aucun",
  "heatmap.cluster.hier": "Hiér.",
  "heatmap.cluster.kmeans": "K-means",
  "heatmap.cluster.k": "k",
  "heatmap.cluster.rows": "Lignes",
  "heatmap.cluster.columns": "Colonnes",
  "heatmap.cluster.modeAria": "Mode de clustering {label}",
  "heatmap.sec.normalisation": "Normalisation",
  "heatmap.sec.clustering": "Clustering",
  "heatmap.sec.colourScale": "Échelle de couleurs",
  "heatmap.sec.cellBorders": "Bordures de cellule",
  "heatmap.sec.labels": "Étiquettes",
  "heatmap.norm.none": "Aucune",
  "heatmap.norm.zrow": "Z ligne",
  "heatmap.norm.zcol": "Z col",
  "heatmap.norm.log2": "log₂",
  "heatmap.dist.heading": "Hiérarchique · Distance",
  "heatmap.dist.aria": "Métrique de distance",
  "heatmap.dist.euclidean": "Euclidienne",
  "heatmap.dist.manhattan": "Manhattan",
  "heatmap.dist.correlation": "1 − r",
  "heatmap.link.heading": "Hiérarchique · Liaison",
  "heatmap.link.aria": "Méthode de liaison",
  "heatmap.link.average": "Moyenne",
  "heatmap.link.complete": "Complète",
  "heatmap.link.single": "Simple",
  "heatmap.dendro.rowHeading": "Hiérarchique · Dendrogramme des lignes",
  "heatmap.dendro.colHeading": "Hiérarchique · Dendrogramme des colonnes",
  "heatmap.dendro.rowAria": "Afficher le dendrogramme des lignes",
  "heatmap.dendro.colAria": "Afficher le dendrogramme des colonnes",
  "heatmap.dendro.note":
    "L’ordre des feuilles + la structure de clusters restent appliqués lorsqu’ils sont masqués. Glissez sur la heatmap pour ouvrir une sélection zoomée si vous avez besoin d’exports par cluster. S’applique aux tracés principal et zoomé.",
  "heatmap.on": "Activé",
  "heatmap.off": "Désactivé",
  "heatmap.kmeans.seed": "K-means · Graine",
  "heatmap.kmeans.seedNote": 'Changez la "seed" pour essayer une autre initialisation k-means++.',
  "heatmap.colour.palette": "Palette",
  "heatmap.colour.diverging": "  (divergente)",
  "heatmap.colour.cbSafe": " · 👁",
  "heatmap.colour.cbSafeNote": "👁 adapté au daltonisme",
  "heatmap.colour.direction": "Direction",
  "heatmap.colour.directionAria": "Direction de la palette",
  "heatmap.colour.normal": "Normale",
  "heatmap.colour.inverted": "Inversée",
  "heatmap.colour.min": "Min",
  "heatmap.colour.max": "Max",
  "heatmap.colour.skewWarn.one":
    "{n} cellule sur {total} ({pct}) étire l’échelle de couleurs — les autres valeurs n’en occupent que {occupied}.",
  "heatmap.colour.skewWarn.other":
    "{n} cellules sur {total} ({pct}) étirent l’échelle de couleurs — les autres valeurs n’en occupent que {occupied}.",
  "heatmap.colour.skewFix.one": "Exclure {n} valeur aberrante de l’échelle",
  "heatmap.colour.skewFix.other": "Exclure {n} valeurs aberrantes de l’échelle",
  "heatmap.colour.skewNote":
    "Les valeurs aberrantes prennent la couleur extrême ; la barre de couleurs les signale par ≥ / ≤. Survolez une cellule pour voir sa valeur réelle.",
  "heatmap.range.title": "Plage de couleurs",
  "heatmap.range.aria": "Distribution des valeurs avec les poignées de la plage de couleurs",
  "heatmap.range.minAria": "Minimum de l’échelle de couleurs",
  "heatmap.range.maxAria": "Maximum de l’échelle de couleurs",
  "heatmap.range.clipped.one": "{n} écrêtée",
  "heatmap.range.clipped.other": "{n} écrêtées",
  "heatmap.range.presetsAria": "Plages de couleurs prédéfinies",
  "heatmap.range.full": "Tout",
  "heatmap.range.fullTitle": "Couvrir toutes les valeurs des données",
  "heatmap.range.outliers": "Aberrantes",
  "heatmap.range.outliersTitle":
    "Exclure les cellules aberrantes : ajuster l’échelle exactement aux autres valeurs",
  "heatmap.range.noOutliers": "Aucune valeur aberrante détectée",
  "heatmap.range.pctTitle": "Couvrir du {lo}e au {hi}e centile des valeurs",
  "heatmap.range.legendHist": "Distribution dans la légende",
  "heatmap.border.width": "Épaisseur",
  "heatmap.labels.title": "Titre",
  "heatmap.labels.subtitle": "Sous-titre",
  "heatmap.labels.xAxis": "Étiquette axe X",
  "heatmap.labels.yAxis": "Étiquette axe Y",
  "heatmap.labels.rowNames": "Noms des lignes",
  "heatmap.labels.colNames": "Noms des colonnes",
  "heatmap.labels.rowNamesAria": "Afficher les noms des lignes",
  "heatmap.labels.colNamesAria": "Afficher les noms des colonnes",
  "heatmap.chart.cluster": "Groupe n° {n}",
  "heatmap.chart.colorbarAria": "Barre de couleurs : valeurs de {min} à {max}",
  "heatmap.chart.legendHistCaption": "Barres grises =\ncellules par\nbande de couleur\n(max : {n})",
  "heatmap.chart.legendHistAria":
    "Distribution des valeurs affichées le long de l’échelle de couleurs",
  "heatmap.chart.colorbarClippedAria":
    "Barre de couleurs : valeurs de {min} à {max} ; les valeurs hors de cette plage prennent les couleurs extrêmes",
  "heatmap.chart.fallbackTitle": "Carte de chaleur",
  "heatmap.chart.descRows.one": "{n} ligne",
  "heatmap.chart.descRows.other": "{n} lignes",
  "heatmap.chart.descCols.one": "{n} colonne",
  "heatmap.chart.descCols.other": "{n} colonnes",
  "heatmap.chart.desc": "Carte de chaleur de {rows} × {cols}{clustering}",
  "heatmap.chart.descClustering": ", avec regroupement",
  "heatmap.chart.cellsAria": "Matrice de {rows} × {cols}, valeurs de {min} à {max}",
  "heatmap.chart.rowLabelsAria.one": "{n} étiquette de ligne",
  "heatmap.chart.rowLabelsAria.other": "{n} étiquettes de ligne",
  "heatmap.chart.colLabelsAria.one": "{n} étiquette de colonne",
  "heatmap.chart.colLabelsAria.other": "{n} étiquettes de colonne",
  "heatmap.err.matrix":
    "Le fichier doit comporter au moins une colonne d’étiquettes de ligne et une colonne de données avec un en-tête.",
  "heatmap.step.importCheck": "Vérifier l’import",
  "heatmap.cfg.pastedData": "Données collées",
  "heatmap.cfg.parsed": " — {rows} lignes × {cols} colonnes analysées",
  "heatmap.cfg.nonNumeric.one": "{n} cellule non numérique rendue en NaN",
  "heatmap.cfg.nonNumeric.other": "{n} cellules non numériques rendues en NaN",
  "heatmap.cfg.large": "la matrice est grande — le clustering peut prendre quelques secondes",
  "heatmap.cfg.clusterCapped":
    "matrice trop grande pour le clustering ({max}+ sur un axe) — ordre du fichier affiché",
  "heatmap.table.summary": "Afficher les valeurs en tableau",
  "heatmap.table.caption":
    "Valeurs de la carte — {rows} lignes × {cols} colonnes, dans l’ordre affiché",
  "heatmap.table.truncated": "Grande matrice — affichage des {shown} premières lignes sur {total}.",
  "heatmap.table.rowHeader": "Ligne",
  "heatmap.plot.controlsLabel": "Réglages du graphique",
  "heatmap.tab.data": "Données",
  "heatmap.tab.colours": "Couleurs",
  "heatmap.tab.labels": "Étiquettes",
  "heatmap.plot.clear": "Effacer",
  "heatmap.plot.dragHint":
    "↳ Glissez sur la heatmap ou cliquez sur un dendrogramme / une bande k-means pour ouvrir une vue zoomée",
  "heatmap.example.title": "Matrice d’expression génique",
  "heatmap.example.subtitle":
    "500 gènes × 6 échantillons (3 Contrôle · 3 Stress) · démo clustérisée",
  "heatmap.upload.hint":
    "CSV · TSV · TXT — première colonne = étiquettes de ligne, première ligne = étiquettes de colonne, le reste numérique · 2 Mo max",
  "heatmap.howto.title": "Heatmap — Comment l’utiliser",
  "heatmap.howto.subtitle": "Matrice numérique avec clustering optionnel des lignes / colonnes",
  "heatmap.howto.purpose":
    "Visualisez une matrice numérique 2D (gènes × échantillons, taxons × conditions, matrice de distances). Réordonnez lignes + colonnes par clustering hiérarchique ou k-means pour révéler la structure.",
  "heatmap.howto.dataLayout":
    "Matrice large — la première colonne contient les étiquettes de ligne (gènes / caractéristiques), la ligne d’en-tête contient les étiquettes de colonne (échantillons / conditions), le reste est une grille numérique. Les valeurs manquantes sont tolérées.",
  "heatmap.howto.display":
    "Choisissez une <strong>palette</strong> (continue famille viridis ou divergente), une normalisation optionnelle <strong>z-score</strong> / <strong>log₂</strong> par ligne ou colonne, et des modes de clustering indépendants lignes / colonnes (<strong>hiérarchique</strong> avec liaison + métrique de distance, ou <strong>k-means</strong> avec k explicite). Glissez pour sélectionner une région et obtenir une vue détaillée zoomée.",
  "heatmap.methods.size": "La heatmap représente {r} lignes × {c} colonnes.",
  "heatmap.methods.zrow":
    "Les valeurs ont été centrées-réduites par ligne (moyenne 0, écart-type 1) avant le regroupement et la coloration.",
  "heatmap.methods.zcol":
    "Les valeurs ont été centrées-réduites par colonne (moyenne 0, écart-type 1) avant le regroupement et la coloration.",
  "heatmap.methods.log2":
    "Les valeurs ont été transformées en log2(x + 1) avant le regroupement et la coloration.",
  "heatmap.methods.hierBoth":
    "Les lignes et les colonnes ont été ordonnées par classification hiérarchique (lien {linkage}) sur {distance}.",
  "heatmap.methods.hierRows":
    "Les lignes ont été ordonnées par classification hiérarchique (lien {linkage}) sur {distance}.",
  "heatmap.methods.hierCols":
    "Les colonnes ont été ordonnées par classification hiérarchique (lien {linkage}) sur {distance}.",
  "heatmap.methods.link.average": "moyen",
  "heatmap.methods.link.complete": "complet",
  "heatmap.methods.link.single": "simple",
  "heatmap.methods.dist.euclidean": "des distances euclidiennes",
  "heatmap.methods.dist.manhattan": "des distances de Manhattan",
  "heatmap.methods.dist.correlation":
    "des distances 1 − corrélation de Pearson (observations complètes deux à deux)",
  "heatmap.methods.missing":
    "En présence de cellules manquantes, les distances ont été calculées sur les paires complètes puis mises à l’échelle du nombre total de valeurs, comme dans la fonction dist() de R.",
  "heatmap.methods.kmRows":
    "Les lignes ont été réparties en k = {k} groupes par k-means (initialisation k-means++, itérations de Lloyd, meilleur de 8 départs selon la somme des carrés intra-groupe ; graine {seed}).",
  "heatmap.methods.kmCols":
    "Les colonnes ont été réparties en k = {k} groupes par k-means (initialisation k-means++, itérations de Lloyd, meilleur de 8 départs selon la somme des carrés intra-groupe ; graine {seed}).",
  "heatmap.methods.colour":
    "Les couleurs représentent les valeurs de {lo} à {hi} avec la palette {palette} ; les valeurs hors de cet intervalle prennent les couleurs extrêmes.",
};

export default fr;
