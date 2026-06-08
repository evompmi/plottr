// French catalog for the Venn tool. Typed Record<VennKey, string> against
// en.ts so a missing key fails the typecheck.

import type { VennKey } from "./en";

const fr: Record<VennKey, string> = {
  "venn.dl.csv": "CSV",
  "venn.dl.csvTitle":
    "Télécharger la matrice d’appartenance — une ligne par élément, une colonne 0/1 pour chaque ensemble actif (format long/tidy)",
  "venn.dl.regions": "Régions",
  "venn.dl.regionsTitle":
    "Télécharger un CSV par région non vide (déclenche plusieurs enregistrements — votre navigateur peut demander une autorisation)",
  "venn.tile.sets": "Ensembles",
  "venn.tile.display": "Affichage",
  "venn.ctrl.proportionalAreas": "Aires proportionnelles",
  "venn.ctrl.propReadable": "Proportionnel ↔ Lisible",
  "venn.ctrl.title": "Titre",
  "venn.ctrl.fillOpacity": "Opacité du remplissage",
  "venn.ctrl.circleOutline": "Contour des cercles",
  "venn.ctrl.fontSize": "Taille de police",
  "venn.ctrl.background": "Arrière-plan",
  "venn.example.title": "DEG de réponse au stress chez Arabidopsis",
  "venn.example.subtitle": "3 ensembles — Sécheresse · Chaleur · Sel",
  "venn.upload.hint":
    "CSV · TSV · TXT — large (une colonne par ensemble, 2–3) ou long (élément, ensemble) · 2 Mo max",
  "venn.picker.choose": "Choisir les ensembles à superposer",
  "venn.picker.pick": "Choisissez 2 ou 3 ensembles à superposer.",
  "venn.picker.one": "1 sélectionné — choisissez-en au moins un autre.",
  "venn.picker.ready": "{n} sélectionnés — prêt à tracer.",
  "venn.nudge.count": "{n} ensembles détectés",
  "venn.nudge.rest":
    " — les diagrammes de Venn n’affichent que 2 ou 3 ensembles. Pour 4 ensembles ou plus, utilisez l’outil UpSet.",
  "venn.nudge.openUpset": "Ouvrir dans UpSet →",
  "venn.area.proportionalNote":
    "Les aires sont proportionnelles à la taille des ensembles (erreur de région max < 0,5 %)",
  "venn.area.maxErrorLabel": "Erreur de région max : ",
  "venn.area.meanSuffix": " · moyenne {mean} %",
  "venn.chart.fallbackTitle": "Diagramme de Venn",
  "venn.chart.desc.one": "Diagramme de Venn avec {n} ensemble : {names}",
  "venn.chart.desc.other": "Diagramme de Venn avec {n} ensembles : {names}",
  "venn.step.configure": "Configurer",
  "venn.step.importCheck": "Vérification d’import",
  "venn.err.empty": "Le fichier semble vide ou sans lignes de données.",
  "venn.err.needSets":
    "Il faut au moins 2 ensembles — chaque en-tête de colonne devient un ensemble.",
  "venn.howto.title": "Venn Diagram — Comment l’utiliser",
  "venn.howto.subtitle": "Intersection d’éléments entre 2–3 ensembles, proportionnel ou classique",
  "venn.howto.purpose":
    "Montrez quels éléments sont partagés entre 2 ou 3 ensembles (gènes surexprimés dans deux conditions ; taxons communs à plusieurs échantillons). Pour ≥ 4 ensembles, utilisez plutôt l’outil UpSet.",
  "venn.howto.dataLayout":
    "<strong>Large</strong> — une colonne par ensemble, éléments empilés dans chaque colonne. <strong>Long</strong> — deux colonnes : <em>élément</em> et <em>ensemble</em>. Les deux formats sont détectés automatiquement.",
  "venn.howto.display":
    "Basculez entre <strong>proportionnel aux aires</strong> (la taille des cercles suit celle des ensembles ; les relations de sous-ensemble sont exactes) et <strong>classique</strong> (rayon uniforme, style Euler). Cliquez sur une région pour explorer sa liste d’éléments. Export CSV par région.",
};

export default fr;
