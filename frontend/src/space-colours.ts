/**
 * MICRO-E-PORTA-VERSIONI-COLORI p.6 (E.D., 16 Nov 2026) · the visual manager
 * of the proxies: «Colori ▾» in the Space's bar, three modes as EM Tools.
 *
 *  - **EM**: by the unit's type (em_visual_rules), as it always was;
 *  - **Epoche**: the colour of the epoch node (`data.color`, the Matrix's),
 *    in two variants — «Epoca di nascita» (always the colour of the epoch it
 *    was born in, as EM Tools) and «Nuovo e sopravvissuto» (on the epoch shown,
 *    the units born there in full colour, the ones born before and still alive
 *    faded; the life is `epoch-presence.ts`, the families of the datamodel and
 *    «still existing», MICRO-C);
 *  - **Proprietà**: a property, its values with the number of units, a colour
 *    by hand per value or a SCALE (EM Tools' own, `em_color_ramps.json`;
 *    numbers on a continuous scale); units without it grey, «senza valore».
 *
 * The legend (colour, value, number): a click isolates, another hides, a third
 * gives back. The epochs' colours are the GRAPH's (a change is a delta and an
 * undo, made by the caller); a property scheme is a VIEW: it lives in a .emc
 * (EM Tools' format, `s3dgraphy.color_schemes`, parity in check-colours.mjs)
 * and the last used, per person and document, in this machine's preferences —
 * never in the em.json.
 *
 * Colours here are as SEEN (hex, sRGB). The .emc holds Blender's scene-linear
 * floats (gamma 2.2, as EM Tools' `hex_to_rgb`); the scene's materials take
 * linear too (`hexToLinear`).
 */
import RAMPS_JSON from "./assets/em_color_ramps.json";

export type ColourMode = "em" | "epochs" | "property";
export type EpochVariant = "birth" | "new";
export type RampType = "sequential" | "diverging" | "qualitative";
export interface Ramp { name: string; description: string; colors: string[] }
export const RAMPS = (RAMPS_JSON as unknown as { ramps: Record<RampType, Record<string, Ramp>> }).ramps;
export const GAMMA = 2.2;
/** the grey of a unit without the property (and of an epoch without a colour) */
export const NO_VALUE_GREY = "#9A9A9A";

// ── colour ──────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  let v = hex.trim().replace(/^#/, "");
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(v)) throw new Error(`not a colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
}
export const rgbToHex = (rgb: readonly number[]): string =>
  "#" + rgb.slice(0, 3).map((c) => Math.max(0, Math.min(255, Math.round(Number(c) * 255))).toString(16).padStart(2, "0")).join("").toUpperCase();
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const hexToLinear = (hex: string): [number, number, number] => hexToRgb(hex).map((c) => round6(c ** GAMMA)) as [number, number, number];
export const linearToHex = (rgb: readonly number[]): string => rgbToHex(rgb.slice(0, 3).map((c) => Math.max(0, Number(c)) ** (1 / GAMMA)));
export function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  return rgbToHex(ra.map((x, i) => x + (rb[i] - x) * t));
}

// ── values (EM Tools' create_property_value_mapping_direct) ─────────────────

export const noValueKey = (p: string) => `no property ${p} node`;
export const emptyValueKey = (p: string) => `empty property ${p} node`;
export const isSentinel = (p: string, v: string) => v === noValueKey(p) || v === emptyValueKey(p);
export const isNumeric = (v: string): boolean => v.trim() !== "" && Number.isFinite(Number(v.trim()));

type N = { id: string; node_type?: string; name?: unknown; description?: unknown; data?: unknown };
type E = { source: string; target: string; edge_type: string };

/** `{unit: value}`: the description of its property node named `prop`; the two sentinels */
export function propertyValues(g: { nodes: N[]; edges: E[] }, prop: string, units: string[]): Map<string, string> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const want = new Set(units);
  const out = new Map<string, string>();
  for (const e of g.edges) {
    if (e.edge_type !== "has_property" || !want.has(e.source)) continue;
    const p = byId.get(e.target);
    if (!p || String(p.name ?? "") !== prop) continue;
    const v = String(p.description ?? "").trim();
    out.set(e.source, v || emptyValueKey(prop));
  }
  for (const u of units) if (!out.has(u)) out.set(u, noValueKey(prop));
  return out;
}

/** the property names the units have, with how many units have each */
export function propertyNames(g: { nodes: N[]; edges: E[] }, units: string[]): Array<{ name: string; units: number }> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const want = new Set(units);
  const by = new Map<string, Set<string>>();
  for (const e of g.edges) {
    if (e.edge_type !== "has_property" || !want.has(e.source)) continue;
    const p = byId.get(e.target);
    if (p?.node_type !== "property") continue;
    const k = String(p.name ?? "");
    if (!k) continue;
    (by.get(k) ?? by.set(k, new Set()).get(k)!).add(e.source);
  }
  return [...by].map(([name, s]) => ({ name, units: s.size })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
}

// ── the scales (EM Tools' VISUAL_OT_apply_color_ramp) ──────────────────────

const numericKey = (v: string): number => (isNumeric(v) ? Number(v) : -Infinity);

export function assignRamp(values: string[], type: RampType, name: string): Map<string, string> {
  const colors = RAMPS[type][name].colors;
  const vals = [...new Set(values)];
  if (type === "sequential" || type === "diverging") vals.sort((a, b) => numericKey(a) - numericKey(b));
  const n = vals.length, k = colors.length;
  const out = new Map<string, string>();
  vals.forEach((v, i) => {
    let idx: number;
    if (type === "diverging") {
      const mid = (n - 1) / 2;
      const rel = mid > 0 ? (i - mid) / mid : 0;
      idx = Math.trunc((rel + 1) * (k - 1) / 2);
    } else idx = Math.min(Math.trunc(i * k / n), k - 1);
    out.set(v, colors[idx]);
  });
  return out;
}

export function continuousColour(x: number, lo: number, hi: number, type: RampType, name: string): string {
  const colors = RAMPS[type][name].colors;
  if (hi <= lo) return colors[Math.floor(colors.length / 2)];
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * (colors.length - 1);
  const i = Math.min(Math.trunc(t), colors.length - 2);
  return mix(colors[i], colors[i + 1], t - i);
}

/** a scale over a property's values: numbers (all but the sentinels) on the
 *  continuous scale when the scale is sequential or diverging, else EM Tools' spread */
export function rampScheme(prop: string, values: string[], type: RampType, name: string): Map<string, string> {
  const real = [...new Set(values)].filter((v) => !isSentinel(prop, v));
  const out = new Map<string, string>();
  if (type !== "qualitative" && real.length > 1 && real.every(isNumeric)) {
    const ns = real.map(Number);
    const lo = Math.min(...ns), hi = Math.max(...ns);
    for (const v of real) out.set(v, continuousColour(Number(v), lo, hi, type, name));
  } else for (const [v, c] of assignRamp(real, type, name)) out.set(v, c);
  for (const v of values) if (isSentinel(prop, v)) out.set(v, NO_VALUE_GREY);
  return out;
}

// ── the .emc file (EM Tools' save_color_scheme / load_color_scheme) ─────────

export interface Emc { metadata: { property_name: string; created?: string; description?: string; [k: string]: unknown };
  color_mapping: Record<string, number[]> }

export function emcDocument(prop: string, scheme: Map<string, string> | Record<string, string>, created = ""): Emc {
  const entries = scheme instanceof Map ? [...scheme] : Object.entries(scheme);
  return {
    metadata: { property_name: prop, created, description: `Color mapping for ${prop} values` },
    color_mapping: Object.fromEntries(entries.map(([v, h]) => [v, [...hexToLinear(h), 1.0]])),
  };
}

export function emcRead(doc: unknown): { property: string; scheme: Map<string, string> } {
  const d = doc as Partial<Emc> | null;
  const prop = d?.metadata?.property_name;
  const m = d?.color_mapping;
  if (typeof prop !== "string" || !m || typeof m !== "object") throw new Error("not a .emc: metadata.property_name and color_mapping are needed");
  const scheme = new Map<string, string>();
  for (const [v, c] of Object.entries(m)) {
    if (!Array.isArray(c) || c.length < 3) throw new Error(`not a colour for «${v}»`);
    scheme.set(String(v), linearToHex(c));
  }
  return { property: prop, scheme };
}

// ── the plan: a colour per unit, and the legend ─────────────────────────────

export interface ColourState {
  mode: ColourMode;
  variant: EpochVariant;
  property: string | null;
  /** value → hex seen (by hand or from a scale) */
  scheme: Record<string, string>;
  ramp: { type: RampType; name: string } | null;
  /** the legend: one key isolated, keys hidden (not saved: a gesture of the moment) */
  isolated?: string | null;
  hidden?: string[];
}
export const defaultColourState = (): ColourState => ({ mode: "em", variant: "birth", property: null, scheme: {}, ramp: null, isolated: null, hidden: [] });

export interface LegendEntry { key: string; colour: string; label: string; count: number; faded?: number; epochId?: string; none?: boolean }
export interface ColourPlan {
  /** unit → colour seen; absent = the type's own (mode EM) */
  colour: Map<string, string>;
  /** units drawn faded (survived, mode «Nuovo e sopravvissuto») */
  faded: Set<string>;
  /** unit → its legend key */
  keyOf: Map<string, string>;
  legend: LegendEntry[];
  /** «nuove: n · sopravvissute: m» */
  counts?: { born: number; survived: number };
}

export interface EpochInfo { id: string; name: string; color: string | null; start?: number | null }

export function colourPlan(state: ColourState, units: string[], ctx: {
  epochs: EpochInfo[];
  /** where a unit is born (null: nowhere) */
  firstOf: (id: string) => string | null;
  /** the epoch shown: who is born there (its sub-epochs too) */
  bornHere?: Set<string>;
  values?: Map<string, string>;
}): ColourPlan {
  const colour = new Map<string, string>(), faded = new Set<string>(), keyOf = new Map<string, string>();
  const legend: LegendEntry[] = [];
  if (state.mode === "epochs") {
    const byId = new Map(ctx.epochs.map((e) => [e.id, e]));
    const count = new Map<string, { n: number; f: number }>();
    let born = 0, survived = 0;
    for (const u of units) {
      const ep = ctx.firstOf(u);
      const key = ep && byId.has(ep) ? ep : "__none";
      const c = key === "__none" ? NO_VALUE_GREY : byId.get(key)!.color || NO_VALUE_GREY;
      colour.set(u, c);
      keyOf.set(u, key);
      const cc = count.get(key) ?? count.set(key, { n: 0, f: 0 }).get(key)!;
      cc.n++;
      if (state.variant === "new" && ctx.bornHere) {
        if (ctx.bornHere.has(u)) born++;
        else { survived++; faded.add(u); cc.f++; }
      }
    }
    // every epoch, with its colour (E.D.): the ones with no unit here too
    for (const e of ctx.epochs)
      legend.push({ key: e.id, epochId: e.id, colour: e.color || NO_VALUE_GREY, label: e.name, count: count.get(e.id)?.n ?? 0, faded: count.get(e.id)?.f ?? 0 });
    if (count.has("__none")) legend.push({ key: "__none", colour: NO_VALUE_GREY, label: "", count: count.get("__none")!.n, none: true });
    return { colour, faded, keyOf, legend, ...(state.variant === "new" && ctx.bornHere ? { counts: { born, survived } } : {}) };
  }
  if (state.mode === "property" && state.property && ctx.values) {
    const prop = state.property;
    const count = new Map<string, number>();
    for (const u of units) {
      const v = ctx.values.get(u) ?? noValueKey(prop);
      const key = v === emptyValueKey(prop) ? noValueKey(prop) : v;
      keyOf.set(u, key);
      count.set(key, (count.get(key) ?? 0) + 1);
      colour.set(u, state.scheme[key] ?? NO_VALUE_GREY);
    }
    const keys = [...count.keys()].filter((k) => !isSentinel(prop, k));
    keys.sort((a, b) => (keys.every(isNumeric) ? Number(a) - Number(b) : a.localeCompare(b, undefined, { numeric: true })));
    for (const k of keys) legend.push({ key: k, colour: state.scheme[k] ?? NO_VALUE_GREY, label: k, count: count.get(k)! });
    const none = count.get(noValueKey(prop));
    if (none) legend.push({ key: noValueKey(prop), colour: state.scheme[noValueKey(prop)] ?? NO_VALUE_GREY, label: "", count: none, none: true });
    return { colour, faded, keyOf, legend };
  }
  return { colour, faded, keyOf, legend };
}

/** the legend's gesture: normal → isolated → hidden → normal */
export function legendClick(state: ColourState, key: string): ColourState {
  const hidden = new Set(state.hidden ?? []);
  if (state.isolated === key) { hidden.add(key); return { ...state, isolated: null, hidden: [...hidden] }; }
  if (hidden.has(key)) { hidden.delete(key); return { ...state, hidden: [...hidden] }; }
  return { ...state, isolated: key, hidden: [...hidden].filter((k) => k !== key) };
}

/** is a unit drawn, after the legend? */
export function legendShows(state: ColourState, plan: ColourPlan, unit: string): boolean {
  if (state.mode === "em") return true;
  const k = plan.keyOf.get(unit);
  if (k == null) return true;
  if (state.isolated) return k === state.isolated;
  return !(state.hidden ?? []).includes(k);
}

// ── where it is kept: per person and document, this machine ─────────────────

const PREF = "emstudio.colours";
export function colourPrefKey(person: string | null, doc: string): string { return `${PREF}.${person || "anon"}.${doc}`; }
export function loadColourState(person: string | null, doc: string): ColourState {
  try {
    const raw = localStorage.getItem(colourPrefKey(person, doc));
    if (raw) return { ...defaultColourState(), ...(JSON.parse(raw) as Partial<ColourState>), isolated: null, hidden: [] };
  } catch { /* none */ }
  return defaultColourState();
}
export function saveColourState(person: string | null, doc: string, s: ColourState): void {
  try {
    const { isolated: _i, hidden: _h, ...keep } = s;
    void _i; void _h;
    localStorage.setItem(colourPrefKey(person, doc), JSON.stringify(keep));
  } catch { /* storage refused */ }
}
