// Per-tool plot-render-settings persistence — pure data layer (no JSX).
// `PrefsPanel.tsx` wraps these in the gear-menu UI; `usePlotToolState.ts`
// calls `loadAutoPrefs` on init and `saveAutoPrefs` on every vis update so
// per-slider drags persist across reloads.
//
// Storage layout (one localStorage key per tool, prefix `dataviz-prefs-`):
//   { tool, version, savedAt, settings: { ...visStyleKeys } }
// Label keys (`*Title` / `*Subtitle` / `*AxisLabel`) are NOT auto-persisted
// — auto-filling them with stale text across sessions is annoying. They
// ARE written to and read from the exported JSON file (explicit user opt-in
// via Save / Load to file in PrefsPanel).
//
// `downloadText` is read off the ambient browser globals (populated by the
// `_core/download.ts` shim at runtime). Stays as an ambient reference (not
// a direct import) so the test loader (`tests/helpers/prefs-loader.js`)
// can stub it on the vm context for the exportPrefsFile capture asserts.
// Browser globals (`setTimeout` / `clearTimeout` / `localStorage` /
// `document` / `FileReader`) are stubbed by the same loader.

declare const downloadText: (text: string, filename: string) => void;

const PREFS_LABEL_KEY_RE = /(?:Title|Subtitle|AxisLabel)$/;
export function isLabelKey(key: string): boolean {
  return PREFS_LABEL_KEY_RE.test(key);
}

const PREFS_STORAGE_PREFIX = "dataviz-prefs-";
export const PREFS_SCHEMA_VERSION = 1;

function prefsStorageKey(toolName: string): string {
  return PREFS_STORAGE_PREFIX + toolName;
}

// Internal-only working type for the data layer. Public functions accept
// any `T extends object` (so typed `VolcanoVis` / `BoxplotVis` shapes pass
// without index-signature gymnastics) and cast to PrefsRecord at the
// `Object.keys(...)` / `vis[key]` boundary inside.
type PrefsRecord = Record<string, unknown>;

// Schema migration. Today every persisted blob is v1, so the function is a
// pass-through. When a future bump renames or restructures keys, add a
// `case 1: settings = migrate1To2(settings); fromVersion = 2;` step and
// fall through. Returns null to signal "unrecognised future version, drop"
// — better than mixing old + new under a whitelist merge.
//
// Why: 22-04-2026 audit (M2) flagged that the version field was written at
// save time but never validated at load time. Without this scaffolding the
// next schema bump would silently mix old keys that happen to overlap with
// new ones.
export function migratePrefs(settings: PrefsRecord, fromVersion: unknown): PrefsRecord | null {
  let v: number;
  if (typeof fromVersion !== "number" || !Number.isFinite(fromVersion)) {
    // No version field at all — treat as v1 for back-compat with blobs
    // written before the schema was numbered (none should exist today,
    // but cheap defensive default).
    v = 1;
  } else {
    v = fromVersion;
  }
  if (v > PREFS_SCHEMA_VERSION) return null; // future version we can't read
  const s = settings;
  // Migration steps land here. Example for the next bump:
  //   if (v === 1) { s = migrate1To2(s); v = 2; }
  while (v < PREFS_SCHEMA_VERSION) {
    // No migration steps yet — every supported version IS the current one.
    // Reaching this with v < current means a step is missing; bail safely.
    return null;
  }
  return s;
}

// Type-check a candidate value against the default in visInit. Accepts exact
// type matches; for null defaults (e.g. lineplot.xMin = null meaning "auto"),
// also accepts null or any finite number.
export function isPrefValueCompatible(candidate: unknown, defaultVal: unknown): boolean {
  if (defaultVal === null) {
    if (candidate === null) return true;
    return typeof candidate === "number" && Number.isFinite(candidate);
  }
  if (candidate === null || candidate === undefined) return false;
  const tDefault = typeof defaultVal;
  const tCand = typeof candidate;
  if (tDefault !== tCand) return false;
  if (tDefault === "number" && !Number.isFinite(candidate as number)) return false;
  return true;
}

// Merge a candidate settings object into a clone of visInit, keeping only
// whitelisted keys with compatible types. `opts.onlyStyle` drops label keys.
export function mergePrefsSettings<T extends object>(
  visInit: T,
  candidate: unknown,
  opts?: { onlyStyle?: boolean }
): T {
  const onlyStyle = !!(opts && opts.onlyStyle);
  const visRec = visInit as unknown as PrefsRecord;
  const out: PrefsRecord = { ...visRec };
  if (!candidate || typeof candidate !== "object") return out as unknown as T;
  const cand = candidate as PrefsRecord;
  for (const key of Object.keys(visRec)) {
    if (!(key in cand)) continue;
    if (onlyStyle && isLabelKey(key)) continue;
    const val = cand[key];
    if (isPrefValueCompatible(val, visRec[key])) {
      out[key] = val;
    }
  }
  return out as unknown as T;
}

// Build the style-only subset of a full `vis` state (strips label keys).
export function extractStylePrefs<T extends object>(vis: T): PrefsRecord {
  const out: PrefsRecord = {};
  const visRec = vis as unknown as PrefsRecord;
  for (const key of Object.keys(visRec)) {
    if (isLabelKey(key)) continue;
    out[key] = visRec[key];
  }
  return out;
}

export function loadAutoPrefs<T extends object>(toolName: string, visInit: T): T {
  try {
    const raw = localStorage.getItem(prefsStorageKey(toolName));
    if (!raw) return { ...visInit };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...visInit };
    if (parsed.tool && parsed.tool !== toolName) return { ...visInit };
    const rawSettings: PrefsRecord = parsed.settings || parsed;
    // Run through the migration scaffold so the next schema bump has a
    // single seam to thread through. Today this is a pass-through for
    // version === 1; a stranger or unsupported future version returns
    // null, falling back to defaults.
    const settings = migratePrefs(rawSettings, parsed.version);
    if (!settings) return { ...visInit };
    return mergePrefsSettings(visInit, settings, { onlyStyle: true });
  } catch (_e) {
    return { ...visInit };
  }
}

// Per-tool debounce so rapid slider drags don't thrash localStorage.
const prefsSaveTimers: Record<string, ReturnType<typeof setTimeout> | null> = {};
export function saveAutoPrefs<T extends object>(toolName: string, vis: T): void {
  const existing = prefsSaveTimers[toolName];
  if (existing) {
    clearTimeout(existing);
  }
  prefsSaveTimers[toolName] = setTimeout(() => {
    try {
      const payload = {
        tool: toolName,
        version: PREFS_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        settings: extractStylePrefs(vis),
      };
      localStorage.setItem(prefsStorageKey(toolName), JSON.stringify(payload));
    } catch (_e) {
      /* quota or private-mode — silent fallback */
    }
    prefsSaveTimers[toolName] = null;
  }, 300);
}

// Synchronous flush (used by tests and by clearAutoPrefs so storage state is
// deterministic). Not called from production code paths directly.
export function flushAutoPrefs<T extends object>(toolName: string, vis: T): void {
  const existing = prefsSaveTimers[toolName];
  if (existing) {
    clearTimeout(existing);
    prefsSaveTimers[toolName] = null;
  }
  try {
    const payload = {
      tool: toolName,
      version: PREFS_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      settings: extractStylePrefs(vis),
    };
    localStorage.setItem(prefsStorageKey(toolName), JSON.stringify(payload));
  } catch (_e) {
    /* silent */
  }
}

export function clearAutoPrefs(toolName: string): void {
  const existing = prefsSaveTimers[toolName];
  if (existing) {
    clearTimeout(existing);
    prefsSaveTimers[toolName] = null;
  }
  try {
    localStorage.removeItem(prefsStorageKey(toolName));
  } catch (_e) {
    /* silent */
  }
}

// Build the JSON payload and trigger a browser download. Includes label keys
// because this is an explicit user action and the resulting file is portable.
export function exportPrefsFile<T extends object>(toolName: string, vis: T): void {
  const payload = {
    tool: toolName,
    version: PREFS_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    settings: { ...vis },
  };
  const text = JSON.stringify(payload, null, 2);
  // `downloadText` is a global from tools/shared.js (still in the plain-JS bundle).
  downloadText(text, toolName + "-settings.json");
}

export type ImportPrefsCallback<T extends object> = (
  merged: T | null,
  errorMessage: string | null
) => void;

// Open a file picker, read the selected file, validate, call cb with the
// merged settings or an error message.
export function importPrefsFile<T extends object>(
  toolName: string,
  visInit: T,
  cb: ImportPrefsCallback<T>
): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  const cleanup = () => {
    if (input.parentNode) input.parentNode.removeChild(input);
  };
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) {
      cleanup();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      cleanup();
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(ev.target?.result ?? ""));
      } catch (_e) {
        cb(null, "Not a valid JSON file.");
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        cb(null, "Not a valid settings file.");
        return;
      }
      const obj = parsed as { tool?: string; settings?: PrefsRecord };
      if (obj.tool && obj.tool !== toolName) {
        cb(null, `This file is for the ${obj.tool} tool, not ${toolName}.`);
        return;
      }
      const settings: PrefsRecord = obj.settings || (obj as PrefsRecord);
      const merged = mergePrefsSettings(visInit, settings, { onlyStyle: false });
      cb(merged, null);
    };
    reader.onerror = () => {
      cleanup();
      cb(null, "Could not read the selected file.");
    };
    reader.readAsText(file);
  });
  // Some browsers need the input in the DOM for programmatic click to work.
  document.body.appendChild(input);
  input.click();
}
