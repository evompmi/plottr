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
  "heatmap.colour.auto": "Auto depuis les données",
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
  "heatmap.err.matrix":
    "Le fichier doit comporter au moins une colonne d’étiquettes de ligne et une colonne de données avec un en-tête.",
  "heatmap.step.importCheck": "Vérification d’import",
  "heatmap.cfg.pastedData": "Données collées",
  "heatmap.cfg.parsed": " — {rows} lignes × {cols} colonnes analysées",
  "heatmap.cfg.nonNumeric.one": "{n} cellule non numérique rendue en NaN",
  "heatmap.cfg.nonNumeric.other": "{n} cellules non numériques rendues en NaN",
  "heatmap.cfg.large": "la matrice est grande — le clustering peut prendre quelques secondes",
  "heatmap.cfg.clusterCapped":
    "matrice trop grande pour le clustering ({max}+ sur un axe) — ordre du fichier affiché",
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
};

export default fr;
