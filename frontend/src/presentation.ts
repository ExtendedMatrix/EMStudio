/**
 * MICRO-T-COLORI-NEL-FILE (E.D., 18 Nov 2026) · the PRESENTATION section of an
 * em.json: ways of looking at the graphs, apart from them.
 *
 * The colour schemes of «Colori · Proprietà» may live INSIDE the file: several
 * schemes, each with a name, and for each graph the one in use. They touch no
 * node and no edge, and the digest of the work does not see them
 * (`contentDigest` hashes the graphs only). The twin of `s3dgraphy.presentation`
 * (em.json 1.2 ED §2.8), field for field:
 *
 *   "presentation": {
 *     "colour_schemes": { "<name>": <a .emc document> },
 *     "active_colour_scheme": { "<graph id>": "<name>" } }
 *
 * A scheme IS a .emc (`space-colours.ts › Emc`): taking it out into a file and
 * back is copying a document — «Espelli in una cartella…», «Importa nel file…».
 * `metadata.value_codes` maps the label a colour is written under to the code
 * of its term (URI): a unit whose value carries a code takes the colour of the
 * entry with that code, else of the same text (`coloursForValues`).
 *
 * Deterministic: the section and every .emc written from here have their keys
 * sorted (`canonical`). Pure module: no DOM, no store.
 */
import { emcRead, defaultColourState, type ColourState, type Emc } from "./space-colours";

export const PRESENTATION_KEY = "presentation";
export const SCHEMES_KEY = "colour_schemes";
export const ACTIVE_KEY = "active_colour_scheme";
export const VALUE_CODES_KEY = "value_codes";

export interface Presentation {
  colour_schemes: Record<string, Emc>;
  active_colour_scheme: Record<string, string>;
}

/** a copy with every object's keys sorted (lists keep their order) */
export function canonical<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => canonical(v)) as unknown as T;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) if (o[k] !== undefined) out[k] = canonical(o[k]);
    return out as T;
  }
  return value;
}

export const emptyPresentation = (): Presentation => ({ colour_schemes: {}, active_colour_scheme: {} });

/** why `doc` is not a scheme (null: it is one) */
export function schemeProblem(doc: unknown): string | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return "not an object";
  try { emcRead(doc); } catch (err) { return (err as Error).message; }
  for (const [v, c] of Object.entries((doc as Emc).color_mapping))
    if (!c.every((x) => typeof x === "number" && Number.isFinite(x))) return `not a colour for «${v}»`;
  const codes = (doc as Emc).metadata[VALUE_CODES_KEY];
  if (codes != null && (typeof codes !== "object" || Array.isArray(codes)
      || !Object.values(codes as object).every((x) => typeof x === "string")))
    return `metadata.${VALUE_CODES_KEY} is not a map of texts`;
  return null;
}

/** the section of a container document, normalised; what cannot be read is
 *  left out and said */
export function readPresentation(doc: unknown): { presentation: Presentation; warnings: string[] } {
  const out = emptyPresentation();
  const warnings: string[] = [];
  const raw = doc && typeof doc === "object" ? (doc as Record<string, unknown>)[PRESENTATION_KEY] : undefined;
  if (raw == null) return { presentation: out, warnings };
  if (typeof raw !== "object" || Array.isArray(raw)) return { presentation: out, warnings: [`${PRESENTATION_KEY}: not an object; ignored`] };
  const r = raw as Record<string, unknown>;
  let schemes = r[SCHEMES_KEY] ?? {};
  if (typeof schemes !== "object" || Array.isArray(schemes)) { warnings.push(`${PRESENTATION_KEY}.${SCHEMES_KEY}: not an object; ignored`); schemes = {}; }
  for (const [name, sch] of Object.entries(schemes as Record<string, unknown>)) {
    const why = schemeProblem(sch);
    if (why || !name.trim()) { warnings.push(`colour scheme «${name}» not readable (${why ?? "no name"}); left out`); continue; }
    out.colour_schemes[name] = canonical(JSON.parse(JSON.stringify(sch)) as Emc);
  }
  let active = r[ACTIVE_KEY] ?? {};
  if (typeof active !== "object" || Array.isArray(active)) { warnings.push(`${PRESENTATION_KEY}.${ACTIVE_KEY}: not an object; ignored`); active = {}; }
  for (const [gid, name] of Object.entries(active as Record<string, unknown>)) {
    if (typeof name !== "string" || !(name in out.colour_schemes)) { warnings.push(`graph «${gid}»: active colour scheme «${String(name)}» is not in the file; ignored`); continue; }
    out.active_colour_scheme[gid] = name;
  }
  return { presentation: out, warnings };
}

/** what the container writes under `presentation` (null: nothing — a file
 *  without schemes stays exactly what it was) */
export function presentationSection(p: Presentation | null | undefined): Record<string, unknown> | null {
  if (!p || !Object.keys(p.colour_schemes).length) return null;
  const active = Object.fromEntries(Object.entries(p.active_colour_scheme).filter(([, n]) => n in p.colour_schemes));
  return canonical({ [SCHEMES_KEY]: p.colour_schemes, ...(Object.keys(active).length ? { [ACTIVE_KEY]: active } : {}) });
}

export const schemeNames = (p: Presentation): string[] => Object.keys(p.colour_schemes).sort();

export function uniqueName(p: Presentation, wanted: string): string {
  const base = wanted.trim() || "scheme";
  if (!(base in p.colour_schemes)) return base;
  let n = 2;
  while (`${base} (${n})` in p.colour_schemes) n++;
  return `${base} (${n})`;
}

/** a .emc kept as a scheme of the file; the name it got (a new one when taken,
 *  unless `replace`) */
export function addScheme(p: Presentation, name: string, emc: unknown, replace = false): string {
  const why = schemeProblem(emc);
  if (why) throw new Error(`not a colour scheme: ${why}`);
  const got = replace ? name.trim() : uniqueName(p, name);
  if (!got) throw new Error("a colour scheme needs a name");
  p.colour_schemes[got] = canonical(JSON.parse(JSON.stringify(emc)) as Emc);
  return got;
}

/** a scheme out of the file, and out of every graph that used it */
export function removeScheme(p: Presentation, name: string): boolean {
  if (!(name in p.colour_schemes)) return false;
  delete p.colour_schemes[name];
  for (const [g, n] of Object.entries(p.active_colour_scheme)) if (n === name) delete p.active_colour_scheme[g];
  return true;
}

export function setActive(p: Presentation, graphId: string, name: string | null): void {
  if (name == null) { delete p.active_colour_scheme[graphId]; return; }
  if (!(name in p.colour_schemes)) throw new Error(`no colour scheme «${name}» in the file`);
  p.active_colour_scheme[graphId] = name;
}

export function activeScheme(p: Presentation | null | undefined, graphId: string | null): { name: string; scheme: Emc } | null {
  if (!p || !graphId) return null;
  const name = p.active_colour_scheme[graphId];
  const scheme = name ? p.colour_schemes[name] : undefined;
  return name && scheme ? { name, scheme } : null;
}

/** what «Pulisci il file» takes away */
export function presentationSummary(p: Presentation | null | undefined): { schemes: number; active: number } {
  if (!p) return { schemes: 0, active: 0 };
  const used = new Set(Object.values(p.active_colour_scheme).filter((n) => n in p.colour_schemes));
  return { schemes: Object.keys(p.colour_schemes).length, active: used.size };
}

export const clonePresentation = (p: Presentation): Presentation => JSON.parse(JSON.stringify(p)) as Presentation;

/** another file's schemes taken in (integrating a project): the same name with
 *  the same scheme is one; a different one gets a new name; their graphs'
 *  choices come along unless this file chose already */
export function mergePresentation(into: Presentation, other: Presentation): Record<string, string> {
  const renamed: Record<string, string> = {};
  for (const name of schemeNames(other)) {
    const sch = other.colour_schemes[name];
    const mine = into.colour_schemes[name];
    if (mine && JSON.stringify(canonical(mine)) === JSON.stringify(canonical(sch))) { renamed[name] = name; continue; }
    renamed[name] = addScheme(into, name, sch);
  }
  for (const [gid, name] of Object.entries(other.active_colour_scheme))
    if (renamed[name] && !(gid in into.active_colour_scheme)) into.active_colour_scheme[gid] = renamed[name];
  return renamed;
}

// ── the .emc beside the file ────────────────────────────────────────────────

/** a scheme as a .emc file: keys sorted, two spaces. «Salva .emc» writes the
 *  same, so expelling, importing and expelling again gives the same bytes */
export const emcText = (emc: Emc): string => JSON.stringify(canonical(emc), null, 2);

/** `<name>.emc`, without what a file name cannot hold */
export function emcFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const stem = name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").replace(/^[ .]+|[ .]+$/g, "") || "scheme";
  return `${stem}.emc`;
}

/** the name a .emc file gives its scheme: `material.emc` → `material` */
export const schemeNameOfFile = (file: string): string => {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.emc$/i, "").replace(/\.json$/i, "") || "scheme";
};

// ── colouring ───────────────────────────────────────────────────────────────

/** `{label found: hex seen}`: by the CODE of the value when the scheme knows
 *  it, else by the text; `values` maps a label to its code (null: none) */
export function coloursForValues(scheme: Emc, values: Map<string, string | null>): Map<string, string> {
  const colours = emcRead(scheme).scheme;
  const codes = (scheme.metadata[VALUE_CODES_KEY] ?? {}) as Record<string, string>;
  const byCode = new Map<string, string>();
  for (const label of Object.keys(codes).sort()) if (colours.has(label)) byCode.set(codes[label], colours.get(label)!);
  const out = new Map<string, string>();
  for (const [label, code] of values) {
    if (code && byCode.has(code)) out.set(label, byCode.get(code)!);
    else if (colours.has(label)) out.set(label, colours.get(label)!);
  }
  return out;
}

/** the Space's state from a scheme of the file: its property, every colour it
 *  holds, and the labels found on the units coloured by code or text */
export function stateFromScheme(base: ColourState | null, scheme: Emc, values: Map<string, string | null>): ColourState {
  const r = emcRead(scheme);
  const all: Record<string, string> = Object.fromEntries(r.scheme);
  for (const [label, hex] of coloursForValues(scheme, values)) all[label] = hex;
  return { ...(base ?? defaultColourState()), mode: "property", property: r.property, scheme: all, leaveNone: r.leaveNone,
    ramp: null, range: null, isolated: null, hidden: [] };
}

/** the scheme of a state, with the codes of the values that have one */
export function schemeOfState(emc: Emc, codes: Map<string, string | null>): Emc {
  const vc: Record<string, string> = {};
  for (const [label, code] of codes) if (code && label in emc.color_mapping) vc[label] = code;
  const meta = { ...emc.metadata };
  if (Object.keys(vc).length) meta[VALUE_CODES_KEY] = vc;
  return canonical({ ...emc, metadata: meta });
}
