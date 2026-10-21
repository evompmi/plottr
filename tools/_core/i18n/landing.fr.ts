// French catalog for the static landing page (namespace "landing"). Typed
// Record<LandingKey, string> against landing.en.ts so a missing key fails
// the typecheck.

import type { LandingKey } from "./landing.en";

const landingFr: Record<LandingKey, string> = {
  "landing.nav.aria": "Principale",
  "landing.nav.tools": "Outils",
  "landing.nav.benchmark": "Validation",
  "landing.nav.privacy": "Confidentialité",
  "landing.nav.cite": "Citer",
  "landing.nav.home": "Accueil Plöttr",

  "landing.eyebrow": "Dans le navigateur · sans installation · vos données restent chez vous",
  "landing.hero.title":
    "Collez un tableur. Repartez avec la figure <em>et</em> les statistiques qui la justifient.",
  "landing.hero.lead":
    "Plöttr transforme vos données de paillasse en SVG prêt à publier, choisit le test que vos données permettent vraiment, et vous donne le script R pour qu’un relecteur puisse refaire chaque calcul.",
  "landing.hero.choose": "Choisir un graphique",
  "landing.hero.example": "Essayer sur des données d’exemple",

  "landing.spec.alt":
    "Boîtes à moustaches de la biomasse pour WT, abi4 et oxSOS1 avec crochets de significativité, tracées par Group Plot à partir de ses données d’exemple",
  "landing.spec.testChosen": "Test choisi",
  "landing.spec.testName": "ANOVA de Welch",
  "landing.spec.posthoc": "Post-hoc",
  "landing.spec.posthocName": "Games-Howell",
  "landing.spec.download": "Vous téléchargez",
  "landing.spec.caption":
    "Les données d’exemple de Group Plot, telles que l’outil les trace et les teste.",

  "landing.proof.aria": "Pourquoi s’y fier",
  "landing.proof.benchmark": "comparaisons avec R 4.5 et SciPy 1.17",
  "landing.proof.benchmarkLink": "Voir la validation →",
  "landing.proof.privacy": "Aucun serveur, aucun suivi",
  "landing.proof.privacyLink": "Vos données ne quittent jamais l’onglet →",
  "landing.proof.cite": "Licence MIT, citable sur Zenodo",
  "landing.proof.citeLink": "Obtenir la citation →",

  "landing.hiw.aria": "Comment fonctionne chaque outil",
  "landing.hiw.step1": "Collez ou déposez un CSV",
  "landing.hiw.step1Desc": "Séparateur et virgules décimales détectés pour vous.",
  "landing.hiw.step2": "Attribuez les colonnes",
  "landing.hiw.step2Desc": "Indiquez la colonne des groupes et celle des mesures.",
  "landing.hiw.step3": "Réglez le graphique",
  "landing.hiw.step3Desc":
    "Style, panneaux et marques de significativité, avec les statistiques mises à jour en direct.",
  "landing.hiw.step4": "Téléchargez SVG + R",
  "landing.hiw.step4Desc": "La figure, plus un script qui reproduit l’analyse.",

  "landing.tools.title": "Partez de votre question",
  "landing.tools.note":
    "Dix types de graphiques. Ils demandent un grand écran ; les calculatrices fonctionnent sur téléphone.",
  "landing.cat.compare": "Comparer des groupes",
  "landing.cat.compareQ": "Mes conditions diffèrent-elles ?",
  "landing.cat.trends": "Tendances et relations",
  "landing.cat.trendsQ": "Comment cela évolue-t-il ?",
  "landing.cat.sets": "Ensembles et omiques",
  "landing.cat.setsQ": "Qu’est-ce qui se recoupe, qu’est-ce qui ressort ?",
  "landing.cat.bench": "À la paillasse · fonctionne sur téléphone",
  "landing.cat.benchQ": "Les calculs avant l’expérience",
  "landing.mobileHint":
    "<strong>Les graphiques demandent un plus grand écran.</strong> Ouvrez Plöttr sur un ordinateur pour faire des figures ; les calculatrices ci-dessus fonctionnent ici.",

  "landing.tool.boxplot.desc":
    "Boîtes, violons, raincloud ou barres, en panneaux, avec le test choisi d’après la normalité et l’égalité des variances.",
  "landing.tool.boxplot.tag": "ANOVA · Welch · Kruskal-Wallis · Tukey · Dunn",
  "landing.tool.proportions.desc": "% de germination et comptages de phénotypes.",
  "landing.tool.proportions.tag": "Fisher · χ² · IC de Wilson",
  "landing.tool.qpcr.desc": "Des Ct bruts au fold change, avec les tests sur ΔCt.",
  "landing.tool.qpcr.tag": "ΔΔCt · Pfaffl",
  "landing.tool.scatter.desc": "XY avec couleur et taille liées à d’autres colonnes.",
  "landing.tool.scatter.tag": "Pearson · Spearman · Kendall",
  "landing.tool.lineplot.desc": "Profil : moyenne ± erreur par groupe.",
  "landing.tool.lineplot.tag": "Tests à chaque x · BH",
  "landing.tool.aequorin.desc": "Traces de luminescence, avec calibration Ca²⁺ en option.",
  "landing.tool.aequorin.tag": "aequorine",
  "landing.tool.venn.desc": "2–3 ensembles",
  "landing.tool.upset.desc": "4 ensembles et plus",
  "landing.tool.heatmap.desc": "matrice + classification",
  "landing.tool.volcano.desc": "log₂FC vs −log₁₀p",
  "landing.tool.power.desc": "Effectif et puissance pour t, ANOVA, χ², r",
  "landing.tool.molarity.desc": "Molarité, dilutions et fiches de préparation",

  "landing.theme.toLight": "Passer en mode clair",
  "landing.theme.toDark": "Passer en mode sombre",

  "landing.cite.title": "Plöttr dans un article ?",
  "landing.cite.text":
    "Citez la version archivée pour que vos lecteurs retrouvent exactement celle que vous avez utilisée.",
  "landing.cite.copy": "Copier la citation",
  "landing.cite.copied": "Copiée",
  "landing.footer.mit": "Licence MIT",
};

export default landingFr;
