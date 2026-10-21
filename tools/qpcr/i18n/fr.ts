// French catalog for the qPCR tool. Typed Record<QpcrKey, string>.

import type { QpcrKey } from "./en";

const fr: Record<QpcrKey, string> = {
  "qpcr.example.title": "qPCR Arabidopsis sécheresse / sel",
  "qpcr.example.subtitle":
    "2 gènes de référence + 2 cibles · 3 groupes × 4 réplicats biologiques × 3 techniques",
  "qpcr.upload.hint":
    "CSV · TSV · TXT · long (Échantillon, Groupe, Gène, Ct — une ligne par puits) ou large (Échantillon, Groupe, une colonne de Ct par gène) · 2 Mo max",
  "qpcr.err.tooFew": "Au moins trois colonnes attendues : échantillon, groupe et valeurs de Ct.",
  "qpcr.err.empty": "Aucune ligne exploitable : vérifiez les colonnes échantillon et groupe.",
  "qpcr.err.noGenes": "Il faut au moins deux gènes (une référence et une cible).",
  "qpcr.err.missingRole": "Choisissez la colonne « {role} ».",

  "qpcr.cfg.pasted": "Données collées",
  "qpcr.cfg.shape": " — {wells} puits · {genes} gènes · {groups} groupes",
  "qpcr.cfg.layout": "Format",
  "qpcr.cfg.long": "Long",
  "qpcr.cfg.longTitle":
    "Une ligne par puits — colonnes : échantillon, groupe, gène, Ct. Les réplicats techniques sont des lignes répétées.",
  "qpcr.cfg.wide": "Large",
  "qpcr.cfg.wideTitle":
    "Une ligne par échantillon biologique — colonnes : échantillon, groupe, puis une colonne de Ct par gène.",
  "qpcr.cfg.colSample": "Échantillon biologique",
  "qpcr.cfg.colGroup": "Groupe / condition",
  "qpcr.cfg.colGene": "Gène",
  "qpcr.cfg.colCt": "Ct / Cq",
  "qpcr.cfg.wideGenes": "Colonnes de gènes détectées : {genes}",
  "qpcr.cfg.genes": "Gènes",
  "qpcr.cfg.gene": "Gène",
  "qpcr.cfg.role": "Rôle",
  "qpcr.cfg.roleRef": "Référence",
  "qpcr.cfg.roleTarget": "Cible",
  "qpcr.cfg.roleIgnore": "Ignorer",
  "qpcr.cfg.roleFor": "Rôle de {gene}",
  "qpcr.cfg.eff": "Efficacité",
  "qpcr.cfg.effFor": "Efficacité d’amplification de {gene}",
  "qpcr.cfg.effHelp":
    "Efficacité en pourcentage (95 %) ou en facteur d’amplification (1,95). À 100 % pour tous les gènes, le résultat est le 2^−ΔΔCt classique ; d’autres valeurs donnent le ratio corrigé par l’efficacité (Pfaffl).",
  "qpcr.cfg.wells": "Puits",
  "qpcr.cfg.missing": "({n} sans Ct)",
  "qpcr.cfg.needRoles": "Indiquez au moins un gène de référence et un gène cible.",
  "qpcr.cfg.groups": "Groupes",
  "qpcr.cfg.normalize": "Normaliser par",
  "qpcr.cfg.normControl": "Groupe contrôle",
  "qpcr.cfg.normControlTitle": "2^−ΔΔCt : ratio par rapport à un groupe calibrateur (fixé à 1)",
  "qpcr.cfg.normRefs": "Gènes de référence seuls",
  "qpcr.cfg.normRefsTitle":
    "2^−ΔCt : expression de chaque échantillon par rapport à ses gènes de référence, sans groupe calibrateur",
  "qpcr.cfg.normRefsNote":
    "Affiche 2^−ΔCt : l’expression de la cible par rapport aux gènes de référence, sans groupe fixé à 1. Les statistiques sur les ΔCt sont les mêmes qu’avec un calibrateur.",
  "qpcr.cfg.control": "Groupe contrôle (calibrateur, ratio = 1)",
  "qpcr.cfg.include": "Inclure {name}",
  "qpcr.cfg.up": "Monter {name}",
  "qpcr.cfg.down": "Descendre {name}",
  "qpcr.cfg.preview":
    "Premiers puits lus (les réplicats techniques sont moyennés par échantillon biologique et par gène).",

  "qpcr.std.title": "Efficacité à partir d’une gamme étalon (facultatif)",
  "qpcr.std.help":
    "Collez une gamme de dilution sous la forme Gène, Quantité, Ct (une ligne par puits ; la quantité peut être relative, p. ex. 1, 0,1, 0,01). Efficacité = 10^(−1/pente) − 1, d’après la régression du Ct sur log₁₀(quantité).",
  "qpcr.std.slope": "Pente",
  "qpcr.std.eff": "Efficacité",
  "qpcr.std.qc":
    "Les valeurs surlignées sortent de la plage habituelle de 90–110 % d’efficacité ou sont sous R² = 0,98 : vérifiez la gamme de dilution.",
  "qpcr.std.apply": "Appliquer ces efficacités",

  "qpcr.qc.title": "Contrôles qualité",
  "qpcr.qc.missing.one":
    "{count} puits n’a pas de Ct (indéterminé) ; il est exclu de la moyenne de son échantillon.",
  "qpcr.qc.missing.other":
    "{count} puits n’ont pas de Ct (indéterminé) ; ils sont exclus de la moyenne de leur échantillon.",
  "qpcr.qc.noisy.one": "{count} série de réplicats techniques varie de plus de 0,5 cycle (ET) :",
  "qpcr.qc.noisy.other":
    "{count} séries de réplicats techniques varient de plus de 0,5 cycle (ET) :",
  "qpcr.qc.genorm": "Stabilité des gènes de référence, M de geNorm :",
  "qpcr.qc.genormHelp":
    "M est la variation moyenne du rapport de chaque gène de référence aux autres d’un échantillon à l’autre (Vandesompele et al. 2002) ; un M plus faible indique une expression plus stable.",
  "qpcr.qc.genormTwo":
    "Avec deux gènes de référence, les deux ont le même M (leur rapport ne permet pas de dire lequel varie). Plus faible = plus stable.",

  "qpcr.plot.dropped.one":
    "{count} échantillon a été exclu car un gène cible ou de référence n’avait pas de Ct.",
  "qpcr.plot.dropped.other":
    "{count} échantillons ont été exclus car un gène cible ou de référence n’avait pas de Ct.",
  "qpcr.tile.chart": "Graphique",
  "qpcr.tile.colors": "Couleurs",
  "qpcr.tile.shapeFill": "Forme & remplissage",
  "qpcr.tile.dataPoints": "Points de données",
  "qpcr.tile.axesLabels": "Axes & étiquettes",
  "qpcr.tile.layout": "Mise en page & fond",
  "qpcr.chart.yScale": "Axe Y",
  "qpcr.chart.scaleLog2": "Ratio (log)",
  "qpcr.chart.scaleLog2Title":
    "Ratio d’expression sur un axe log₂ (graduation à chaque doublement) : 2× en hausse et 2× en baisse sont à la même distance de 1",
  "qpcr.chart.scaleLinear": "Ratio (lin.)",
  "qpcr.chart.scaleLinearTitle":
    "Ratio d’expression sur un axe linéaire partant de 0 (amplifie les hausses, écrase les baisses)",
  "qpcr.chart.scaleDdctTitle": "−ΔΔCt : les valeurs log₂ sur lesquelles portent les statistiques",
  "qpcr.chart.scaleLog2Rel": "Log",
  "qpcr.chart.scaleLog2RelTitle":
    "2^−ΔCt sur un axe log₂ : 2× en hausse et 2× en baisse sont à la même distance",
  "qpcr.chart.scaleLinearRel": "Linéaire",
  "qpcr.chart.scaleLinearRelTitle":
    "2^−ΔCt sur un axe linéaire (amplifie les valeurs hautes, écrase les basses)",
  "qpcr.chart.scaleDctTitle": "−ΔCt : les valeurs log₂ sur lesquelles portent les statistiques",
  "qpcr.chart.style": "Style",
  "qpcr.chart.bar": "Barres",
  "qpcr.chart.box": "Boîtes",
  "qpcr.chart.boxTitle":
    "Médiane, quartiles et moustaches (1,5 × EIQ) des réplicats biologiques sur l’axe affiché",
  "qpcr.chart.orientation": "Orientation",
  "qpcr.chart.vertical": "Verticale",
  "qpcr.chart.horizontal": "Horizontale",
  "qpcr.chart.range": "Plage de l’axe ({units})",
  "qpcr.chart.rangeUnitsFc": "ratio",
  "qpcr.chart.rangeUnitsRel": "2^−ΔCt",
  "qpcr.chart.rangeMin": "min (auto)",
  "qpcr.chart.rangeMax": "max (auto)",
  "qpcr.chart.rangeNote": "Même plage pour chaque gène ; vide = automatique.",
  "qpcr.chart.rangeBad": "Ignoré : ce n’est pas un nombre.",
  "qpcr.chart.rangeBadLog": "Ignoré : un axe log₂ demande des nombres supérieurs à 0.",
  "qpcr.chart.rangeInverted": "Ignoré : le min doit être inférieur au max.",
  "qpcr.chart.yTitle": "Titre de l’axe",
  "qpcr.chart.yTitleAuto": "automatique",
  "qpcr.chart.dot": "Points",
  "qpcr.chart.points": "Afficher les réplicats biologiques",
  "qpcr.chart.showCalibrator": "Colonne du calibrateur",
  "qpcr.chart.calibratorHiddenNote":
    "Affichage seulement : la ligne pointillée marque le calibrateur (ratio 1), ses comparaisons apparaissent en étoiles au-dessus de chaque barre, et les statistiques sont inchangées.",
  "qpcr.chart.vsControlNote": "Étoiles sur les barres : vs {control} (non affiché)",
  "qpcr.chart.vsControlNoteH": "Étoiles à côté des barres : vs {control} (non affiché)",
  "qpcr.chart.errorBars": "Barres d’erreur",
  "qpcr.chart.errNone": "Aucune",
  "qpcr.chart.errCi": "IC 95 %",
  "qpcr.chart.errorBarsNote":
    "Calculées sur les ΔCt (échelle log₂) puis retransformées : elles paraissent asymétriques sur un axe linéaire.",
  "qpcr.chart.yLog2": "Ratio d’expression (échelle log₂)",
  "qpcr.chart.yLinear": "Ratio d’expression",
  "qpcr.chart.yDdct": "−ΔΔCt",
  "qpcr.chart.yLog2Rel": "Expression relative (échelle log₂)",
  "qpcr.chart.yLinearRel": "Expression relative (2^−ΔCt)",
  "qpcr.chart.yDct": "−ΔCt",
  "qpcr.chart.fallbackTitle": "Expression relative qPCR",
  "qpcr.chart.desc": "Expression relative de {genes}, normalisée au groupe contrôle {control}",
  "qpcr.chart.descRefs":
    "Expression relative (2^−ΔCt) de {genes}, normalisée aux seuls gènes de référence",
  "qpcr.colors.groups": "Couleur par groupe",
  "qpcr.style.facetWidth": "Largeur des panneaux",
  "qpcr.style.facetHeight": "Hauteur des panneaux",
  "qpcr.style.facetCols": "Panneaux par ligne",
  "qpcr.style.barWidth": "Largeur des barres / boîtes",
  "qpcr.style.fillOpacity": "Opacité du remplissage",
  "qpcr.style.pointSize": "Taille des points",
  "qpcr.style.jitter": "Dispersion des points",
  "qpcr.style.outline": "Contour (noir)",
  "qpcr.style.off": "aucun",
  "qpcr.style.labelAngle": "Angle des étiquettes de groupe",
  "qpcr.style.font": "Taille de police",
  "qpcr.style.title": "Titre",
  "qpcr.style.optional": "facultatif",
  "qpcr.dl.csvTitle": "Ct, ΔCt, −ΔΔCt et ratio d’expression par échantillon",
  "qpcr.dl.reportTitle": "Rapport texte : méthode, contrôles qualité et statistiques par gène",
  "qpcr.dl.rTitle":
    "Script R recalculant les ΔCt à partir des Ct bruts et réalisant les mêmes tests",

  "qpcr.stats.analysisExports": "Exports de l’analyse",
  "qpcr.stats.rScript": "Script R",
  "qpcr.stats.reportTxt": "Rapport .txt",
  "qpcr.tab.chart": "Graphique",
  "qpcr.tab.style": "Style",
  "qpcr.tab.axes": "Axes",
  "qpcr.plot.controlsLabel": "Réglages du graphique",
  "qpcr.stats.title": "Statistiques",
  "qpcr.stats.desc":
    "Tests sur les ΔCt pour chaque gène cible ; les ratios d’expression sont des estimations retransformées.",
  "qpcr.stats.displayOnPlot": "Afficher sur le tracé",
  "qpcr.stats.off": "Désact.",
  "qpcr.stats.letters": "Lettres",
  "qpcr.stats.lettersTitle":
    "Les groupes partageant une lettre ne diffèrent pas (p ajustée ≥ 0,05)",
  "qpcr.stats.brackets": "Crochets",
  "qpcr.stats.showNs": "Afficher ns",
  "qpcr.stats.whyDctTitle": "Pourquoi les tests portent sur les ΔCt",
  "qpcr.stats.whyDct":
    "Les Ct sont sur une échelle log₂, où la variation biologique est à peu près normale et symétrique. Les ratios d’expression (2^−ΔΔCt) en sont les exponentielles : ils sont asymétriques (une hausse de 4× s’éloigne de 1, une baisse de 4× est comprimée entre 0 et 1), et la division par la moyenne du contrôle force ce groupe à valoir 1 en moyenne, ce qui masque sa propre variabilité. Tous les tests ci-dessous portent donc sur les ΔCt ; les ratios et leurs IC sont retransformés à partir des mêmes valeurs log.",
  "qpcr.stats.dontTestFc": "N’appliquez pas de test t ni d’ANOVA aux valeurs 2^−ΔΔCt.",
  "qpcr.stats.group": "Groupe",
  "qpcr.stats.meanDct": "ΔCt moyen ± ET",
  "qpcr.stats.fcVsControl": "Ratio vs contrôle [IC à 95 %]",
  "qpcr.stats.calibrator": "1 (calibrateur)",
  "qpcr.stats.relExpr": "2^−ΔCt [IC à 95 %]",
  "qpcr.stats.tableNote":
    "Ratio = 2^(ΔCt moyen du contrôle − ΔCt moyen du groupe), soit un rapport de moyennes géométriques ; son IC est l’IC de Welch à 95 % de la différence de ΔCt, retransformé (donc asymétrique).",
  "qpcr.stats.tableNoteRel":
    "2^−ΔCt = 2^(−ΔCt moyen), soit la moyenne géométrique de l’expression du groupe par rapport aux gènes de référence ; son IC est l’IC t à 95 % du ΔCt moyen, retransformé (donc asymétrique).",
  "qpcr.stats.noControl":
    "Aucun échantillon du groupe contrôle {control} n’a de Ct pour ce gène : les ratios ne peuvent pas être calculés.",
  "qpcr.stats.needTwo":
    "Il faut au moins deux groupes avec deux réplicats biologiques ou plus pour réaliser un test.",
  "qpcr.stats.test": "Test",
  "qpcr.stats.auto": "Auto — {test}",
  "qpcr.stats.onDct": "sur les ΔCt",
  "qpcr.stats.posthoc": "Post-hoc : {name}",
  "qpcr.stats.pair": "Paire",
  "qpcr.stats.signif": "Significativité",
  "qpcr.stats.fc": "Ratio",
  "qpcr.stats.pAdj": "p (ajustée)",
  "qpcr.test.studentT": "Test t de Student",
  "qpcr.test.welchT": "Test t de Welch",
  "qpcr.test.mannWhitney": "Mann-Whitney U",
  "qpcr.test.oneWayANOVA": "ANOVA à un facteur",
  "qpcr.test.welchANOVA": "ANOVA de Welch",
  "qpcr.test.kruskalWallis": "Kruskal-Wallis",
  "qpcr.posthoc.tukeyHSD": "Tukey HSD",
  "qpcr.posthoc.gamesHowell": "Games-Howell",
  "qpcr.posthoc.dunn": "Dunn (ajusté BH)",

  "qpcr.howto.title": "Expression relative qPCR — Mode d’emploi",
  "qpcr.howto.subtitle": "Ct bruts → ΔCt → ratio d’expression · statistiques sur les ΔCt",
  "qpcr.howto.purpose":
    "Quantification relative à partir des Ct bruts : <strong>2^−ΔΔCt</strong> (Livak &amp; Schmittgen 2001, <em>Methods</em> 25(4):402–408, doi:10.1006/meth.2001.1262), <strong>ratios corrigés par l’efficacité</strong> (Pfaffl 2001, <em>Nucleic Acids Res</em> 29(9):e45, doi:10.1093/nar/29.9.e45) et <strong>moyenne géométrique de plusieurs gènes de référence</strong> (Vandesompele et al. 2002, <em>Genome Biol</em> 3(7):research0034, doi:10.1186/gb-2002-3-7-research0034). Les statistiques portent sur les <strong>ΔCt</strong>, jamais sur les ratios.",
  "qpcr.howto.dataLayout":
    "<strong>Long</strong> : une ligne par puits avec <code>Échantillon, Groupe, Gène, Ct</code> (les réplicats techniques sont des lignes répétées, moyennées). <strong>Large</strong> : une ligne par échantillon biologique avec <code>Échantillon, Groupe</code> puis une colonne de Ct par gène. Les Ct « Undetermined », NA ou vides sont traités comme manquants.",
  "qpcr.howto.exLongCaption":
    "Format long (la plupart des exports d’instruments) : une ligne par puits. Les lignes répétées pour un même échantillon et un même gène sont des réplicats techniques, moyennés ; « Undetermined » compte comme manquant. Les identifiants d’échantillon peuvent se répéter d’un groupe à l’autre.",
  "qpcr.howto.exWideCaption":
    "Format large : une ligne par échantillon biologique, une colonne de Ct par gène (réplicats techniques déjà moyennés). Les en-têtes anglais (Sample, Group, Gene, Ct) sont détectés automatiquement ; sinon, attribuez les colonnes à l’étape Configurer.",
  "qpcr.howto.display":
    "Choisissez les gènes de référence et cibles, les efficacités (saisies ou issues d’une gamme étalon) et le groupe contrôle — ou normalisez par les seuls gènes de référence (2^−ΔCt, sans calibrateur). Le graphique montre le ratio d’expression sur un axe log₂ (ou linéaire, ou −ΔΔCt) avec les réplicats biologiques et des barres d’erreur SEM, ET ou IC à 95 % ; crochets ou lettres viennent du test t de Welch / de l’ANOVA de Welch + Games-Howell sur les ΔCt. Options d’affichage : barres, points ou boîtes, vertical ou horizontal, plage d’axe fixe commune à tous les gènes et titre d’axe modifiable.",
  "qpcr.methods.scope": "chaque gène cible",
  "qpcr.methods.value": "les valeurs de ΔCt (échelle log2), et non les fold changes",
  "qpcr.methods.livakControl":
    "L’expression relative a été calculée par la méthode 2^−ΔΔCt (efficacité d’amplification supposée de 100 %), avec {control} comme groupe calibrateur.",
  "qpcr.methods.livakRefs":
    "L’expression relative aux gènes de référence a été calculée comme 2^−ΔCt (efficacité d’amplification supposée de 100 %).",
  "qpcr.methods.pfafflControl":
    "L’expression relative a été calculée par des rapports corrigés de l’efficacité (méthode de Pfaffl ; facteurs d’amplification : {eff}), avec {control} comme groupe calibrateur.",
  "qpcr.methods.pfafflRefs":
    "L’expression relative aux gènes de référence a été calculée par des rapports corrigés de l’efficacité (méthode de Pfaffl ; facteurs d’amplification : {eff}).",
  "qpcr.methods.refOne":
    "Les Ct des gènes cibles ont été normalisés sur le gène de référence {refs}.",
  "qpcr.methods.refMany":
    "Les Ct des gènes cibles ont été normalisés sur la moyenne géométrique des gènes de référence {refs}.",
  "qpcr.methods.techReps":
    "Les réplicats techniques ont été moyennés par échantillon biologique, et les échantillons sans Ct pour la cible ou une référence ont été exclus.",
  "qpcr.methods.dispMean":
    "Les barres et points représentent les moyennes log2 retransformées (moyennes géométriques){err}.",
  "qpcr.methods.dispErr": ", avec {err} calculés sur l’échelle log2",
  "qpcr.methods.dispBox":
    "Les boîtes à moustaches résument les valeurs d’expression relative par échantillon.",
  "qpcr.methods.err.sem": "les SEM",
  "qpcr.methods.err.sd": "les écarts-types",
  "qpcr.methods.err.ci95": "les intervalles de confiance à 95 %",
};

export default fr;
