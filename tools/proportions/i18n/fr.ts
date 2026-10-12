// French catalog for the Proportions tool. Typed Record<ProportionsKey, string>.

import type { ProportionsKey } from "./en";

const fr: Record<ProportionsKey, string> = {
  "proportions.example.title": "Colonisation mycorhizienne par plante",
  "proportions.example.subtitle": "4 génotypes · effectifs colonisées / non colonisées",
  "proportions.example.f2": "Ou charger un exemple de ségrégation (F2 dihybride, 9:3:3:1)",
  "proportions.upload.hint":
    "CSV · TSV · TXT · 1re colonne = noms des groupes · une colonne d’effectifs par modalité · 2 Mo max",
  "proportions.err.tooFewColumns":
    "Tableau d’effectifs attendu : une première colonne de noms de groupes et au moins deux colonnes d’effectifs.",
  "proportions.err.tooFewRows": "Au moins deux groupes (lignes) sont nécessaires.",
  "proportions.err.notCount":
    "« {value} » (groupe « {group} », colonne « {category} ») n’est pas un effectif : chaque cellule doit être un entier ≥ 0. Les pourcentages ne peuvent pas être analysés ici : saisissez les nombres d’individus.",
  "proportions.err.duplicateGroup":
    "Le groupe « {group} » apparaît deux fois. Additionnez ses lignes avant de coller les données.",
  "proportions.err.emptyLabel": "La ligne {row} n’a pas de nom de groupe en première colonne.",
  "proportions.rest": "Autres",

  "proportions.cfg.pasted": "Données collées",
  "proportions.cfg.shape": " — {groups} groupes × {cats} modalités",
  "proportions.cfg.help":
    "Décochez des groupes ou modalités pour les exclure ; utilisez les flèches pour régler leur ordre sur le graphique.",
  "proportions.cfg.blank.one": "{count} cellule vide a été lue comme 0.",
  "proportions.cfg.blank.other": "{count} cellules vides ont été lues comme 0.",
  "proportions.cfg.needTwo": "Conservez au moins deux groupes et deux modalités.",
  "proportions.cfg.dropped": "Exclus car sans observation dans les modalités conservées : {names}",
  "proportions.cfg.groups": "Groupes (lignes)",
  "proportions.cfg.categories": "Modalités (colonnes)",
  "proportions.cfg.include": "Inclure {name}",
  "proportions.cfg.up": "Monter {name}",
  "proportions.cfg.down": "Descendre {name}",

  "proportions.tile.chart": "Graphique",
  "proportions.tile.colors": "Couleurs",
  "proportions.tile.style": "Style",
  "proportions.chart.type": "Type de graphique",
  "proportions.chart.typeProp": "Proportion",
  "proportions.chart.typePropTitle": "% d’une modalité par groupe, avec IC de Wilson à 95 %",
  "proportions.chart.typeStacked": "Empilé",
  "proportions.chart.typeStackedTitle": "Barres empilées à 100 %, un segment par modalité",
  "proportions.chart.typeMosaic": "Mosaïque",
  "proportions.chart.typeMosaicTitle":
    "Colonnes empilées de largeur proportionnelle à l’effectif du groupe",
  "proportions.chart.focus": "Modalité affichée en %",
  "proportions.chart.focusNote":
    "Les autres modalités sont regroupées ; les tests comparent cette modalité au reste.",
  "proportions.chart.ci": "IC de Wilson à 95 %",
  "proportions.chart.segLabels": "Étiquettes des segments",
  "proportions.chart.segNone": "Aucune",
  "proportions.chart.segCount": "Effectif",
  "proportions.chart.showN": "Effectif sous les groupes",
  "proportions.colors.groups": "Couleur des barres par groupe",
  "proportions.colors.categories": "Couleur par modalité",
  "proportions.style.width": "Largeur du graphique",
  "proportions.style.height": "Hauteur du graphique",
  "proportions.style.barWidth": "Largeur des barres",
  "proportions.style.outline": "Contour des barres (noir)",
  "proportions.style.outlineWidth": "Épaisseur du contour",
  "proportions.style.labelAngle": "Angle des étiquettes de groupe",
  "proportions.style.font": "Taille de police",
  "proportions.style.title": "Titre",
  "proportions.style.yLabel": "Titre de l’axe Y",
  "proportions.style.optional": "facultatif",
  "proportions.style.auto": "automatique",

  "proportions.chart.fallbackTitle": "Graphique de proportions",
  "proportions.chart.desc": "{groups} groupes, {categories} modalités, {n} observations",
  "proportions.chart.yProp": "% {cat}",
  "proportions.chart.yStack": "% des observations",

  "proportions.dl.csv": "CSV",
  "proportions.dl.csvTitle": "Effectifs, proportions et IC de Wilson (format long)",
  "proportions.dl.reportTitle": "Rapport statistique en texte brut",
  "proportions.dl.rTitle": "Script R reproduisant tous les tests et le graphique",

  "proportions.stats.focusNote":
    "Analyse de « {cat} » contre toutes les autres modalités regroupées (comme sur le graphique). Passez en Empilé ou Mosaïque pour tester toutes les modalités.",
  "proportions.stats.title": "Statistiques",
  "proportions.stats.desc":
    "Effectifs avec IC de Wilson et tests sur le tableau affiché dans le graphique.",
  "proportions.stats.displayOnPlot": "Afficher sur le tracé",
  "proportions.stats.off": "Désact.",
  "proportions.stats.letters": "Lettres",
  "proportions.stats.lettersTitle":
    "Lettres : les groupes partageant une lettre ne diffèrent pas (p ajustée ≥ 0,05)",
  "proportions.stats.brackets": "Crochets",
  "proportions.stats.showNs": "Afficher ns",
  "proportions.stats.summary": "Effectifs · % [IC de Wilson à 95 %]",
  "proportions.stats.group": "Groupe",
  "proportions.stats.catCol": "{cat}",
  "proportions.stats.wilsonNote":
    "Intervalles de score de Wilson (Brown, Cai & DasGupta 2001) : contrairement au classique p ± 1,96·ET, ils gardent une couverture proche de 95 % pour les petits effectifs et les proportions proches de 0 ou 100 %.",
  "proportions.stats.test": "Les groupes diffèrent-ils ?",
  "proportions.stats.testChoice": "Test",
  "proportions.stats.auto": "Auto",
  "proportions.stats.reasonTwoByTwo":
    "2 groupes × 2 modalités → test exact de Fisher (p exacte, sans approximation asymptotique).",
  "proportions.stats.reasonCochranOk":
    "Tous les effectifs attendus ≥ 1 et au plus 20 % inférieurs à 5 (règle de Cochran) → test du χ² de Pearson.",
  "proportions.stats.reasonCochranFail":
    "{below} effectifs attendus sur {cells} sont inférieurs à 5 (minimum {min}) → test exact de Fisher, l’approximation du χ² n’étant pas fiable ici.",
  "proportions.stats.overridden": "Vous avez remplacé le test recommandé.",
  "proportions.stats.tooSmall":
    "Il faut au moins deux groupes et deux modalités observées pour réaliser un test.",
  "proportions.stats.fisherLine": "Test exact de Fisher ({dims}) : p = {p}",
  "proportions.stats.orLine": "Rapport de cotes (EMV conditionnel) = {or}, IC à 95 % [{lo}, {hi}]",
  "proportions.stats.chi2Line": "χ² de Pearson ({df}) = {x2}, p = {p}",
  "proportions.stats.cramerLine": "V de Cramér = {v} · N = {n}",
  "proportions.stats.mcNote":
    "Ce tableau est trop grand pour une énumération complète : p a été estimée à partir de {B} tableaux aléatoires de mêmes marges (ET Monte-Carlo ±{se}).",
  "proportions.stats.residuals": "Résidus standardisés",
  "proportions.stats.residualsNote":
    "Observé moins attendu, en unités d’erreur standard. Les cellules en gras (|r| ≥ 1,96) sont celles qui portent la différence.",
  "proportions.stats.pairwise": "Comparaisons deux à deux (test exact de Fisher)",
  "proportions.stats.adjust": "Correction pour tests multiples",
  "proportions.stats.holmTitle":
    "Holm : contrôle le risque d’au moins un faux positif (familywise)",
  "proportions.stats.bhTitle": "Benjamini–Hochberg : contrôle le taux de fausses découvertes",
  "proportions.stats.pair": "Paire",
  "proportions.stats.pAdj": "p ({method})",
  "proportions.stats.pairwiseNote":
    "Chaque paire est testée sur son propre tableau à 2 lignes ; les p ajustées tiennent compte du nombre de paires.",

  "proportions.gof.title": "Ajustement à une proportion théorique",
  "proportions.gof.intro":
    "Teste si les effectifs de chaque groupe suivent une proportion attendue, p. ex. une ségrégation mendélienne. Ordre : {cats}.",
  "proportions.gof.ratio": "Proportion attendue",
  "proportions.gof.invalid": "Saisissez {k} nombres positifs séparés par « : ».",
  "proportions.gof.observed": "Observé",
  "proportions.gof.expected": "Attendu",
  "proportions.gof.method": "Test",
  "proportions.gof.exact": "exact",
  "proportions.gof.pHolm": "p (Holm)",
  "proportions.gof.note":
    "Test exact binomial / multinomial quand c’est possible (somme des probabilités de tous les résultats au plus aussi probables que l’observé), sinon χ². Une petite p indique un écart à la proportion attendue.",
  "proportions.gof.fallback":
    "Certains groupes étaient trop grands pour le test exact ; leur p provient de l’approximation du χ² (fiable à ces effectifs).",

  "proportions.table.summary": "Afficher les valeurs sous forme de tableau",
  "proportions.table.caption":
    "Effectifs, proportions et IC de Wilson à 95 % par groupe et modalité",

  "proportions.howto.title": "Proportions et effectifs — Mode d’emploi",
  "proportions.howto.subtitle": "Effectifs par groupe · IC de Wilson · Fisher / χ² · ajustement",
  "proportions.howto.purpose":
    "Pour les résultats que l’on <strong>compte</strong> : % de germination, % de plantes colonisées, survie, classes phénotypiques. N’appliquez pas de test t ni d’ANOVA à des pourcentages : leur variance dépend du pourcentage lui-même, ils sont bornés entre 0 et 100 et masquent le nombre d’individus sur lequel chacun repose. Les tests sur les effectifs eux-mêmes (exact de Fisher ou χ²) n’ont pas ces défauts, et les intervalles de Wilson restent fiables pour les petits effectifs (Brown, Cai &amp; DasGupta 2001, <em>Statistical Science</em> 16(2), doi:10.1214/ss/1009213286).",
  "proportions.howto.dataLayout":
    "Un <strong>tableau d’effectifs</strong> : la première colonne contient les noms des groupes, chaque autre colonne une modalité, et chaque cellule le <strong>nombre d’individus</strong> (pas un pourcentage). Exemple : <code>Génotype,Germées,Non germées</code> / <code>WT,46,4</code>. Regroupez les boîtes répliques en une ligne par groupe ; ce regroupement suppose que les boîtes concordent, vérifiez-les séparément en cas de doute.",
  "proportions.howto.display":
    "<strong>Proportion</strong> affiche le % d’une modalité avec IC de Wilson à 95 %. <strong>Empilé</strong> et <strong>Mosaïque</strong> montrent toutes les modalités ; en mosaïque, la largeur suit l’effectif du groupe. Le test est choisi automatiquement : exact de Fisher pour les tableaux 2×2 ou quand les effectifs attendus sont faibles, χ² sinon. Les comparaisons deux à deux utilisent la correction de Holm par défaut. Le panneau d’ajustement compare les effectifs à des proportions comme 3:1 ou 9:3:3:1.",
};

export default fr;
