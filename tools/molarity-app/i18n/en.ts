// English catalog for the Calculator (molarity) tool (namespace "molarity").

import type { Catalog } from "../../_core/i18n";

const en = {
  // App — section headers + mode tiles
  "molarity.section.solutions": "Solutions",
  "molarity.section.dna": "DNA",
  "molarity.mode.molarity": "Molarity",
  "molarity.mode.molarity.desc": "MW / mass / volume / concentration",
  "molarity.mode.dilution": "Dilution",
  "molarity.mode.dilution.desc": "C1×V1 = C2×V2",
  "molarity.mode.batch": "Batch",
  "molarity.mode.batch.desc": "Paste a table, get a prep sheet",
  "molarity.mode.ligation": "Ligation",
  "molarity.mode.ligation.desc": "Insert mass from vector:insert ratio",

  // Shared
  "molarity.solveFor": "Solve for:",
  "molarity.inputs": "Inputs:",
  "molarity.calculated": "calculated",

  // Molarity mode
  "molarity.mol.field.mw": "Mol. weight (g/mol)",
  "molarity.mol.field.mass": "Mass",
  "molarity.mol.field.volume": "Volume",
  "molarity.mol.field.conc": "Concentration",
  "molarity.mol.mwLabel": "MW (g/mol)",

  // Dilution mode
  "molarity.dil.equation": "C1 × V1 = C2 × V2 — Solve for:",
  "molarity.dil.field.c1": "C1 (stock conc.)",
  "molarity.dil.field.v1": "V1 (stock vol.)",
  "molarity.dil.field.c2": "C2 (final conc.)",
  "molarity.dil.field.v2": "V2 (final vol.)",
  "molarity.dil.stock": "Stock solution",
  "molarity.dil.final": "Final solution",
  "molarity.dil.c1": "C1 (concentration)",
  "molarity.dil.v1": "V1 (volume)",
  "molarity.dil.c2": "C2 (concentration)",
  "molarity.dil.v2": "V2 (volume)",

  // Batch mode
  "molarity.batch.errPaste": "Paste your data above.",
  "molarity.batch.errTooLarge":
    "Pasted data too large ({mb} MB). Maximum is 2 MB — paste fewer rows.",
  "molarity.batch.errNoRows": "No data rows found.",
  "molarity.batch.errCols": "Need at least 4 columns: Name, MW, Concentration, Volume.",
  "molarity.batch.errInvalidMw": "Invalid MW: {v}",
  "molarity.batch.errInvalidVol": "Invalid volume: {v}",
  "molarity.batch.errCannotParseConc": "Cannot parse concentration: {v}",
  "molarity.batch.rowFallback": "Row {n}",
  "molarity.batch.instruction":
    "Paste a table: Name, MW (g/mol), Concentration (with unit), Volume (with unit)",
  "molarity.batch.unitsNote":
    'Units can be inline (e.g. "150 mM", "500 mL", "50 mg/mL"). Supported: M, mM, µM, nM, g/L, mg/mL, µg/µL, L, mL, µL.',
  "molarity.batch.separator": "Separator:",
  "molarity.batch.autoDetect": "Auto-detect",
  "molarity.batch.comma": "Comma (,)",
  "molarity.batch.semicolon": "Semicolon (;)",
  "molarity.batch.tab": "Tab (\\t)",
  "molarity.batch.calculate": "Calculate",
  "molarity.batch.loadExample": "Load example",
  "molarity.batch.prepSheet": "Prep Sheet",
  "molarity.batch.col.name": "Name",
  "molarity.batch.col.mw": "MW",
  "molarity.batch.col.conc": "Concentration",
  "molarity.batch.col.vol": "Volume",
  "molarity.batch.col.mass": "Mass to weigh",

  // Ligation mode
  "molarity.lig.title": "Ligation insert calculator",
  "molarity.lig.formula":
    "insert (ng) = (insert bp / vector bp) × vector ng × (insert:vector ratio)",
  "molarity.lig.vector": "Vector",
  "molarity.lig.insert": "Insert",
  "molarity.lig.molarRatio": "Molar ratio",
  "molarity.lig.length": "Length",
  "molarity.lig.amount": "Amount",
  "molarity.lig.needed": "Insert amount needed:",
} as const satisfies Catalog;

export default en;
export type MolarityKey = keyof typeof en;
