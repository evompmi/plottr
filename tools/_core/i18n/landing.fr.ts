// French catalog for the static landing page (namespace "landing"). Typed
// Record<LandingKey, string> against landing.en.ts so a missing key fails
// the typecheck.

import type { LandingKey } from "./landing.en";

const landingFr: Record<LandingKey, string> = {
  "landing.eyebrow":
    "Tout est dans le navigateur · pas d’installation · vos données restent privées",
  "landing.tagline":
    "Collez un tableur. Obtenez une <b>figure prête à publier</b> — et le <b>code R</b> des statistiques qui la sous-tendent.",
  "landing.trust.validated": "Validé avec R + SciPy",
  "landing.trust.validatedTitle": "Vérifié avec R 4.5 + SciPy 1.17 — voir le benchmark public",
  "landing.trust.privacy": "Vos données restent dans votre navigateur",
  "landing.trust.privacyTitle": "Aucun envoi, aucun suivi — voir le schéma de fonctionnement",
  "landing.hiw.label": "Comment ça marche",
  "landing.hiw.step1": "Importez un CSV",
  "landing.hiw.step2": "Attribuez les rôles",
  "landing.hiw.step3": "Ajustez le tracé",
  "landing.hiw.step4": "Téléchargez SVG + R",
  "landing.group.plotsKicker": "Graphes",
  "landing.group.plotsText": "Huit types de graphiques, à un click près",
  "landing.group.statsKicker": "Statistiques & calculatrices",
  "landing.group.statsText": "Calculs rapides à la paillasse",
  "landing.desc.boxplot": "Boîte / violon / barre<br/>avec stats &amp; facettes",
  "landing.desc.scatter": "XY avec couleur<br/>&amp; taille",
  "landing.desc.lineplot": "Ligne brisée<br/>moyenne ± erreur par groupe",
  "landing.desc.aequorin": "Calibration Ca²⁺<br/>optionnelle",
  "landing.desc.venn": "Intersections d’ensembles<br/>2–3 ensembles",
  "landing.desc.upset": "Intersections d’ensembles<br/>4+ ensembles",
  "landing.desc.heatmap": "Vue en matrice<br/>avec clusters",
  "landing.desc.volcano": "log₂FC vs −log₁₀p<br/>pour données —omiques",
  "landing.desc.power": "Taille d’échantillon &amp; puissance<br/>pour t, ANOVA, χ², r",
  "landing.desc.molarity": "Molarité, dilution<br/>&amp; feuilles de préparation",
  "landing.footer.cite": "Citer — DOI Zenodo",
  "landing.footer.citeTitle":
    "Archivé sur Zenodo — citez Plöttr via le DOI 10.5281/zenodo.20245057",
  "landing.footer.mit": "Sous licence MIT",
  "landing.footer.crosschecked": "Vérifié avec R 4.5 + SciPy 1.17",
};

export default landingFr;
