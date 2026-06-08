// French catalog for the Power Analysis calculator. Typed Record<PowerKey, string>.

import type { PowerKey } from "./en";

const fr: Record<PowerKey, string> = {
  "power.test.tInd.label": "Test t à deux échantillons",
  "power.test.tInd.question":
    "Combien de sujets par groupe pour détecter une différence entre deux groupes indépendants ?",
  "power.test.tInd.nLabel": "n par groupe",
  "power.test.tPaired.label": "Test t apparié",
  "power.test.tPaired.question":
    "Combien de paires pour détecter une différence entre mesures appariées ?",
  "power.test.tPaired.nLabel": "n (paires)",
  "power.test.tOne.label": "Test t à un échantillon",
  "power.test.tOne.question":
    "Combien d’observations pour détecter un écart par rapport à une valeur de référence connue ?",
  "power.test.tOne.nLabel": "n",
  "power.test.anova.label": "ANOVA à un facteur",
  "power.test.anova.question":
    "Combien de sujets par groupe pour détecter des différences entre k moyennes de groupes ?",
  "power.test.anova.nLabel": "n par groupe",
  "power.test.correlation.label": "Corrélation",
  "power.test.correlation.question":
    "Combien d’observations pour détecter une corrélation de Pearson non nulle ?",
  "power.test.correlation.nLabel": "n (total)",
  "power.test.chi2.label": "Test du khi-deux",
  "power.test.chi2.question":
    "Combien d’observations pour un test d’ajustement ou d’indépendance ?",
  "power.test.chi2.nLabel": "n (total)",
  "power.totalN.twoSample": "N total = {total} ({n} par groupe × 2)",
  "power.totalN.anova": "N total = {total} ({n} par groupe × {k} groupes)",
  "power.size.small": "petit",
  "power.size.medium": "moyen",
  "power.size.large": "grand",
  "power.size.effectSuffix": "effet",
  "power.es.helperTab": "À partir de mes données",
  "power.es.directTab": "Valeur directe",
  "power.es.expectedR": "Corrélation attendue |r|",
  "power.es.rNote": "Quelle force de relation linéaire attendez-vous ?",
  "power.es.mean1": "Moyenne attendue — groupe 1",
  "power.es.mean2": "Moyenne attendue — groupe 2",
  "power.es.commonSd": "Écart-type commun",
  "power.es.compute": "Calculer la taille d’effet",
  "power.es.tIndNote":
    "Utilisez des données pilotes ou de la littérature. Le SD doit être le SD intra-groupe groupé.",
  "power.es.meanDiff": "Différence de moyennes attendue",
  "power.es.deviationRef": "Écart attendu par rapport à la référence",
  "power.es.sdPairedDiff": "SD des différences appariées",
  "power.es.sd": "Écart-type",
  "power.es.groupMeans": "Moyennes de groupes attendues (séparées par des virgules)",
  "power.es.withinSd": "Écart-type intra-groupe",
  "power.es.anovaNote":
    "Saisissez les moyennes attendues pour chaque groupe de traitement, et le SD intra-groupe commun (à partir de données pilotes ou de la littérature).",
  "power.es.baselineProps": "Proportions de référence (ce que la théorie prédit)",
  "power.es.actualProps": "Proportions réelles (ce qui se passe vraiment selon vous)",
  "power.es.chi2Note":
    "Utilisez des ratios (3:1) ou des proportions (0.75, 0.25). Courant pour les tests de ségrégation mendélienne.",
  "power.es.directF": "Taille d’effet (f)",
  "power.es.directW": "Taille d’effet (w)",
  "power.es.directD": "Taille d’effet (d)",
  "power.es.formulaF": "f = SD des moyennes de groupes / SD intra-groupe",
  "power.es.formulaW": "w = √(Σ (p_obs − p_att)² / p_att)",
  "power.es.formulaD": "d = |différence de moyennes| / SD groupé",
  "power.es.computed": "Taille d’effet = ",
  "power.curve.title": "Courbe de puissance",
  "power.curve.desc": "Puissance statistique en fonction de la taille d’échantillon",
  "power.curve.yAxis": "Puissance (1 − β)",
  "power.ctrl.statisticalTest": "Test statistique",
  "power.ctrl.whatToFind": "Que devez-vous trouver ?",
  "power.ctrl.sampleSize": "Taille d’échantillon",
  "power.ctrl.power": "Puissance",
  "power.ctrl.expectedEffect": "Taille d’effet attendue",
  "power.ctrl.significance": "Niveau de signification (α)",
  "power.ctrl.desiredPower": "Puissance souhaitée (1 − β)",
  "power.ctrl.standardTitle": "0.80 (standard)",
  "power.ctrl.direction": "Direction du test",
  "power.ctrl.twoSided": "Bilatéral",
  "power.ctrl.oneSided": "Unilatéral",
  "power.ctrl.directionNote":
    "Bilatéral : la différence peut aller dans les deux sens. Unilatéral : vous attendez une direction précise.",
  "power.ctrl.numGroups": "Nombre de groupes",
  "power.ctrl.df": "Degrés de liberté",
  "power.ctrl.dfNote": "Ajustement : catégories − 1.<br/>Indépendance : (lignes−1)(colonnes−1).",
  "power.result.requiredN": "{nLabel} requis",
  "power.result.statisticalPower": "Puissance statistique",
  "power.result.rTitle":
    "Télécharger un script R exécutable reproduisant ce calcul de puissance avec le package pwr",
  "power.explain.heading": "Que signifient ces nombres ?",
  "power.explain.body":
    "La <b>puissance</b> est la probabilité de rejeter correctement l’hypothèse nulle (c.-à-d. de déclarer un résultat significatif). Une puissance de 0,80 (la ligne pointillée) signifie 80 % de chances de réussite — c’est le minimum standard. Plus élevée est préférable mais demande plus d’observations.<br/><br/>Le <b>niveau de signification (α)</b> est le risque de faux positif — conclure à un effet alors qu’il n’y en a pas. Le standard α&nbsp;=&nbsp;0,05 signifie que vous acceptez 5 % de risque de fausse alerte. Abaisser α (p. ex. à 0,01) vous rend plus conservateur mais nécessite plus d’observations pour garder une puissance élevée.<br/><br/>La <b>taille d’échantillon ({nLabel})</b> est le nombre d’observations à collecter. Plus de sujets donnent plus de puissance pour détecter un effet donné.<br/><br/>La <b>taille de l’effet</b> mesure l’ampleur de la différence ou de la relation réelle, mise à l’échelle par la variabilité. Utilisez l’onglet « À partir de mes données » pour la calculer à partir des valeurs attendues (p. ex. moyennes de groupes et écart-type de données pilotes ou d’études publiées).",
  "power.explain.tInd":
    "Pour un <b>test t à deux échantillons</b>, la taille d’effet (d de Cohen) est la différence entre les deux moyennes de groupes divisée par leur écart-type commun. Un d de 0,2 est petit, 0,5 moyen et 0,8 grand.",
  "power.explain.tPaired":
    "Pour un <b>test t apparié</b>, la taille d’effet (d de Cohen) est la moyenne attendue des différences appariées divisée par l’écart-type de ces différences.",
  "power.explain.tOne":
    "Pour un <b>test t à un échantillon</b>, la taille d’effet (d de Cohen) est l’écart de la vraie moyenne par rapport à la valeur de référence, divisé par l’écart-type.",
  "power.explain.anova":
    "Pour l’<b>ANOVA</b>, la taille d’effet (f de Cohen) capture la dispersion des moyennes de groupes par rapport à la variabilité intra-groupe. Un f de 0,10 est petit, 0,25 moyen et 0,40 grand.",
  "power.explain.correlation":
    "Pour la <b>corrélation</b>, la taille d’effet est simplement le r de Pearson attendu. Un r de 0,1 est petit, 0,3 moyen et 0,5 grand.",
  "power.explain.chi2":
    "Pour un <b>test du Chi2</b>, la taille d’effet (w de Cohen) mesure l’écart des proportions de catégories observées par rapport aux attendues. Un w de 0,1 est petit, 0,3 moyen et 0,5 grand.<br/><br/>Degrés de liberté :<br/>&bull; Ajustement : <b>df = catégories − 1</b><br/>&bull; Indépendance : <b>df = (lignes − 1) × (colonnes − 1)</b>",
};

export default fr;
