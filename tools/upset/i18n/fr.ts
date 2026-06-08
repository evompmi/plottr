// French catalog for the UpSet tool. Typed Record<UpsetKey, string>.

import type { UpsetKey } from "./en";

const fr: Record<UpsetKey, string> = {
  "upset.err.empty": "Le fichier semble vide ou sans lignes de données.",
  "upset.err.parse": "Impossible d’analyser l’appartenance aux ensembles.",
  "upset.err.longSets": "Il faut au moins 2 noms d’ensembles distincts dans la deuxième colonne.",
  "upset.err.wideSets": "Il faut au moins 2 colonnes d’ensembles non vides.",
  "upset.chart.fallbackTitle": "Diagramme UpSet",
  "upset.chart.barAria.one": "{label} : {size} élément",
  "upset.chart.barAria.other": "{label} : {size} éléments",
  "upset.dl.table": "Table",
  "upset.dl.tableTitle":
    "Télécharger la table d’intersections actuellement tracée (Intersection, Degré, Taille, + indicateurs par ensemble). Correspond exactement au tracé — reflète le tri, le Top N, les filtres de degré min/max et de taille min.",
  "upset.dl.matrix": "Matrice",
  "upset.dl.matrixTitle":
    "Télécharger la matrice d’appartenance — une ligne par élément, une colonne 0/1 pour chaque ensemble actif",
  "upset.dl.allRegions": "Toutes les régions",
  "upset.dl.allRegionsTitle":
    "Un CSV par intersection tracée (nommé _I1, _I2, … selon les identifiants du tracé) plus un _index.csv reliant Id → Intersection, Degré, Taille. Votre navigateur peut demander une autorisation pour plusieurs téléchargements.",
  "upset.sec.columns": "Colonnes",
  "upset.sort.label": "Trier par",
  "upset.sort.sizeDesc": "Taille (plus grand d’abord)",
  "upset.sort.sizeAsc": "Taille (plus petit d’abord)",
  "upset.sort.degreeDesc": "Degré (plus élevé d’abord)",
  "upset.sort.degreeAsc": "Degré (plus faible d’abord)",
  "upset.sort.sets": "Ordre des ensembles",
  "upset.minSize": "Taille d’intersection minimale",
  "upset.maxInData": "max dans les données : {n}",
  "upset.minDegree": "Degré minimal",
  "upset.maxDegree": "Degré maximal",
  "upset.sec.labels": "Étiquettes",
  "upset.label.title": "Titre",
  "upset.label.subtitle": "Sous-titre",
  "upset.sec.display": "Affichage",
  "upset.disp.barOpacity": "Opacité des barres",
  "upset.disp.dotSize": "Taille des points",
  "upset.disp.fontSize": "Taille de police",
  "upset.disp.intersectionLabels": "Étiquettes de taille d’intersection",
  "upset.disp.setSizeLabels": "Étiquettes de taille d’ensemble",
  "upset.disp.background": "Arrière-plan",
  "upset.sec.statistics": "Statistiques",
  "upset.stat.universe": "Taille de l’univers (N)",
  "upset.stat.resetUniverse": "Réinitialiser à |∪|={n}",
  "upset.stat.resetUniverseTitle": "Revenir à l’union des éléments importés",
  "upset.stat.universeNote":
    "Par défaut, l’union des éléments importés (|∪|). Remplacez par le génome / protéome / arrière-plan prédéfini pour de vraies analyses d’enrichissement — un univers plus petit agrandit les p-values.",
  "upset.stat.intersectionStats": "Statistiques d’intersection",
  "upset.stat.computeDisabledTitle": "Définissez une taille d’univers ci-dessus avant de calculer",
  "upset.stat.computingTitle": "Calcul en cours…",
  "upset.stat.computeTitle":
    "Exécuter le test exact de type SuperExactTest pour chacune des {n} intersections de la sélection d’ensembles active et appliquer la correction BH. Les filtres d’affichage (taille / degré minimal) NE changent PAS les intersections testées.",
  "upset.stat.computingProgress": "Calcul {done}/{total}…",
  "upset.stat.recompute": "Recalculer les stats ({n} intersections)",
  "upset.stat.compute": "Calculer les stats ({n} intersections)",
  "upset.stat.clearCached.one": "Effacer {n} résultat en cache",
  "upset.stat.clearCached.other": "Effacer {n} résultats en cache",
  "upset.stat.computeNote":
    "Calcule la p binomiale exacte (queue supérieure, queue inférieure, et la p bilatérale = plus petite queue × 2) par intersection, puis applique la correction BH à chaque famille sur toutes les intersections de la sélection active. Les filtres d’affichage (taille / degré minimal) n’affectent que ce qui est montré sur le tracé — ils ne changent jamais la famille BH.",
  "upset.stat.sigMarkers": "Marqueurs de significativité",
  "upset.stat.off": "Désact.",
  "upset.stat.stars": "Étoiles",
  "upset.stat.pvalue": "p-value",
  "upset.stat.on": "Activé",
  "upset.stat.sigMarkersNote":
    "Seules les intersections testées sont marquées. Utilise la p bilatérale (plus petite queue × 2, corrigée BH sur tous les tests lancés cette session), de sorte que l’enrichissement et l’appauvrissement apparaissent tous deux.",
  "upset.stat.colorBars": "Colorer les barres par significativité",
  "upset.stat.green": "Vert",
  "upset.stat.darkRed": "Rouge foncé",
  "upset.stat.colorBarsNote1": " = enrichi. ",
  "upset.stat.colorBarsNote2":
    " = appauvri. Tous deux à p_adj bilatérale < 0,05, direction selon le signe de observé − attendu. Les barres non testées ou non significatives restent noires.",
  "upset.example.title": "DEG de réponse au stress chez Arabidopsis",
  "upset.example.subtitle": "5 ensembles — Sécheresse · Chaleur · Sel · Froid · ABA",
  "upset.upload.hint":
    "CSV · TSV · TXT — large (une colonne par ensemble, 2+) ou long (élément, ensemble) · 2 Mo max",
  "upset.picker.heading": "Ensembles à inclure",
  "upset.picker.pick": "Choisissez au moins 2 ensembles à tracer.",
  "upset.picker.one": "1 sélectionné — choisissez-en au moins un autre.",
  "upset.picker.ready": "{n} sélectionnés — prêt à tracer.",
  "upset.items.empty":
    "Cliquez sur une barre d’intersection ou une colonne de matrice pour voir les éléments.",
  "upset.items.count.one": "({n} élément)",
  "upset.items.count.other": "({n} éléments)",
  "upset.cutoff.title": "Seuil d’intersection",
  "upset.cutoff.intro":
    "Avec {sets} ensembles, jusqu’à {max} intersections sont possibles. Ne conserver que les intersections dont le degré tombe dans cette fenêtre :",
  "upset.cutoff.min": "Min",
  "upset.cutoff.max": "Max",
  "upset.cutoff.kept": "{kept} intersections non vides conservées sur {total}.",
  "upset.cutoff.note":
    "Le degré 1 conserve les singletons (éléments propres à un seul ensemble) ; le degré = {sets} conserve l’intersection de tous les ensembles. Vous pouvez modifier cela plus tard dans les contrôles du tracé.",
  "upset.cfg.colsRows": " — {cols} colonnes × {rows} lignes",
  "upset.cfg.preview": "Aperçu (8 premières lignes) :",
  "upset.sp.title": "Significativité d’intersection",
  "upset.sp.subtitle": "Test exact de type SuperExactTest contre l’hypothèse nulle à marges fixes",
  "upset.sp.setsTested": "Ensembles testés",
  "upset.sp.setSizes": "Tailles d’ensembles (nᵢ)",
  "upset.sp.exclusiveOverlap": "Chevauchement exclusif (barre)",
  "upset.sp.enriched": "↑ enrichi",
  "upset.sp.depleted": "↓ appauvri",
  "upset.sp.asExpected": "≈ comme attendu",
  "upset.sp.expectedNull": "Attendu sous l’hypothèse nulle",
  "upset.sp.expectedTitle":
    "E[exclusif] = N · Π(nᵢ/N) · Π(1 − nⱼ/N) sous l’approximation d’indépendance (chaque élément tombe dans chaque ensemble avec sa probabilité marginale). Intérieur : les ensembles couverts par la barre. Extérieur : les autres ensembles importés.",
  "upset.sp.inclusiveOverlap": "Chevauchement inclusif",
  "upset.sp.twoSided": "Bilatéral",
  "upset.sp.twoSidedHint":
    "min(2·pSup, 2·pInf, 1) — p de tête, pilote les marqueurs + la couleur des barres",
  "upset.sp.enrichment": "Enrichissement",
  "upset.sp.enrichmentHint": "P(X ≥ barre) — Binomiale(N, p_M), queue supérieure",
  "upset.sp.depletion": "Appauvrissement",
  "upset.sp.depletionHint": "P(X ≤ barre) — queue inférieure",
  "upset.sp.familyNote.one":
    "Chaque famille corrigée BH séparément sur {n} intersection en cache pour N={universe}. La p bilatérale est la valeur de tête honnête (un test par barre, sans cherry-picking) ; les lignes par queue sont là pour la ventilation directionnelle. L’hypothèse nulle binomiale suppose que chaque élément est placé indépendamment dans chaque ensemble à son taux marginal.",
  "upset.sp.familyNote.other":
    "Chaque famille corrigée BH séparément sur {n} intersections en cache pour N={universe}. La p bilatérale est la valeur de tête honnête (un test par barre, sans cherry-picking) ; les lignes par queue sont là pour la ventilation directionnelle. L’hypothèse nulle binomiale suppose que chaque élément est placé indépendamment dans chaque ensemble à son taux marginal.",
  "upset.sp.noPvalue":
    "Pas encore de p-value pour cette intersection — utilisez <strong>Calculer les stats</strong> dans la barre latérale pour lancer le test binomial bilatéral (plus la ventilation enrichissement / appauvrissement par queue) sur la hauteur de barre exclusive de chaque intersection de la sélection actuelle en une seule passe.",
  "upset.howto.title": "UpSet Plot — Comment l’utiliser",
  "upset.howto.subtitle":
    "Tailles d’intersection d’ensembles pour 2+ ensembles, là où Venn ne suffit plus",
  "upset.howto.purpose":
    "Montrez les intersections entre de nombreux ensembles à la fois — les diagrammes UpSet sont plus adaptés au-delà de trois ensembles, là où les diagrammes de Venn deviennent illisibles.",
  "upset.howto.dataLayout":
    "<strong>Large</strong> — une colonne par ensemble, éléments empilés dans chaque colonne. <strong>Long</strong> — deux colonnes : <em>élément</em> et <em>ensemble</em>. Même format que Venn.",
  "upset.howto.display":
    "Chaque intersection est une colonne : la barre du haut montre sa taille, la matrice de points du bas montre l’appartenance aux ensembles. Triez par <strong>taille</strong> (par défaut) ou par <strong>degré</strong> ; filtrez par taille minimale + fenêtre de degré. Test de significativité par intersection contre une hypothèse nulle uniforme avec p-values corrigées BH.",
};

export default fr;
