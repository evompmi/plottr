// French catalog for the Calculator (molarity) tool. Typed Record<MolarityKey, string>.

import type { MolarityKey } from "./en";

const fr: Record<MolarityKey, string> = {
  "molarity.section.solutions": "Solutions",
  "molarity.section.dna": "ADN",
  "molarity.mode.molarity": "Molarité",
  "molarity.mode.molarity.desc": "MM / masse / volume / concentration",
  "molarity.mode.dilution": "Dilution",
  "molarity.mode.dilution.desc": "C1×V1 = C2×V2",
  "molarity.mode.batch": "Lot",
  "molarity.mode.batch.desc": "Collez un tableau, obtenez une feuille de préparation",
  "molarity.mode.ligation": "Ligature",
  "molarity.mode.ligation.desc": "Masse d’insert à partir du ratio vecteur:insert",

  "molarity.solveFor": "Résoudre pour :",
  "molarity.inputs": "Entrées :",
  "molarity.calculated": "calculé",

  "molarity.mol.field.mw": "Masse molaire (g/mol)",
  "molarity.mol.field.mass": "Masse",
  "molarity.mol.field.volume": "Volume",
  "molarity.mol.field.conc": "Concentration",
  "molarity.mol.mwLabel": "MM (g/mol)",

  "molarity.dil.equation": "C1 × V1 = C2 × V2 — Résoudre pour :",
  "molarity.dil.field.c1": "C1 (conc. stock)",
  "molarity.dil.field.v1": "V1 (vol. stock)",
  "molarity.dil.field.c2": "C2 (conc. finale)",
  "molarity.dil.field.v2": "V2 (vol. final)",
  "molarity.dil.stock": "Solution stock",
  "molarity.dil.final": "Solution finale",
  "molarity.dil.c1": "C1 (concentration)",
  "molarity.dil.v1": "V1 (volume)",
  "molarity.dil.c2": "C2 (concentration)",
  "molarity.dil.v2": "V2 (volume)",

  "molarity.batch.errPaste": "Collez vos données ci-dessus.",
  "molarity.batch.errTooLarge":
    "Données collées trop volumineuses ({mb} Mo). Maximum 2 Mo — collez moins de lignes.",
  "molarity.batch.errNoRows": "Aucune ligne de données trouvée.",
  "molarity.batch.errCols": "Au moins 4 colonnes requises : Nom, MM, Concentration, Volume.",
  "molarity.batch.errInvalidMw": "MM invalide : {v}",
  "molarity.batch.errInvalidVol": "Volume invalide : {v}",
  "molarity.batch.errCannotParseConc": "Impossible d’analyser la concentration : {v}",
  "molarity.batch.rowFallback": "Ligne {n}",
  "molarity.batch.instruction":
    "Collez un tableau : Nom, MM (g/mol), Concentration (avec unité), Volume (avec unité)",
  "molarity.batch.unitsNote":
    "Les unités peuvent être en ligne (p. ex. « 150 mM », « 500 mL », « 50 mg/mL »). Prises en charge : M, mM, µM, nM, g/L, mg/mL, µg/µL, L, mL, µL.",
  "molarity.batch.separator": "Séparateur :",
  "molarity.batch.autoDetect": "Détection auto",
  "molarity.batch.comma": "Virgule (,)",
  "molarity.batch.semicolon": "Point-virgule (;)",
  "molarity.batch.tab": "Tabulation (\\t)",
  "molarity.batch.calculate": "Calculer",
  "molarity.batch.loadExample": "Charger l’exemple",
  "molarity.batch.prepSheet": "Feuille de préparation",
  "molarity.batch.col.name": "Nom",
  "molarity.batch.col.mw": "MM",
  "molarity.batch.col.conc": "Concentration",
  "molarity.batch.col.vol": "Volume",
  "molarity.batch.col.mass": "Masse à peser",

  "molarity.lig.title": "Calculateur d’insert de ligature",
  "molarity.lig.formula":
    "insert (ng) = (insert pb / vecteur pb) × vecteur ng × (ratio insert:vecteur)",
  "molarity.lig.vector": "Vecteur",
  "molarity.lig.insert": "Insert",
  "molarity.lig.molarRatio": "Ratio molaire",
  "molarity.lig.length": "Longueur",
  "molarity.lig.amount": "Quantité",
  "molarity.lig.needed": "Quantité d’insert nécessaire :",
};

export default fr;
