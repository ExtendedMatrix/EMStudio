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
 *    numbers on a continuous scale between a min and a max); and EM Tools' two
 *    special values, each with its own colour: «ha la proprietà, valore vuoto»
 *    (`empty property <p> node`) and «non ha la proprietà» (`no property <p>
 *    node`) — the second may also leave the unit as it is (its type's colour).
 *    MICRO-S (E.D., 18 Nov 2026): the two were one grey «senza valore» before.
 *
 * The legend (colour, value, number): a click isolates, another hides, a third
 * gives back. The epochs' colours are the GRAPH's (a change is a delta and an
 * undo, made by the caller); a property scheme is a VIEW: it lives in a .emc
 * (EM Tools' format, `s3dgraphy.color_schemes`, parity in check-colours.mjs),
 * the last used, per person and document, in this machine's preferences, and —
 * MICRO-T, 18 Nov 2026 — when the person keeps it there, in the em.json's
 * `presentation` section, apart from the graphs (presentation.ts).
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
/** the grey of an epoch without a colour, and of a value with no colour yet */
export const NO_VALUE_GREY = "#9A9A9A";
/** the two special values' colour when none was chosen: EM Tools'
 *  `DEFAULT_COLOR` (0.5, 0.5, 0.5) — linear, so seen as #BABABA (MICRO-S) */
export const SPECIAL_GREY = "#BABABA";
/** .emc metadata key: the units without the property are left as they are.
 *  EM Tools reads only `metadata.property_name`: an old one ignores it (and
 *  colours them with the `no property` entry, which is always written). */
export const EMC_LEAVE_NONE = "no_property_untouched";

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
/** MICRO-PL09 p.0 (E.D., 18 Nov 2026: «Applica la scala» on `height` in XX sec
 *  looked as if it did nothing) · a quantity written with its unit — «16.8 cm»,
 *  «32 cm», «1,5 m» — is a number too: its number and its unit. TempluMare
 *  v11's height/width/depth are all so; read as text, a numeric scale put them
 *  in no order at all (every value compared as −∞), neighbours one colour. */
export function quantity(v: string): { n: number; unit: string } | null {
  const m = /^\s*([-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[-+]?\d+)?)\s*([^\d\s.,+-].*?)?\s*$/i.exec(v);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? { n, unit: (m[2] ?? "").trim() } : null;
}
/** the values' numbers when every one is a number in ONE unit (none, or «cm»
 *  for all): null otherwise — «30» and «30 cm» together, or «cm» and «m», stay text */
export function quantities(values: Iterable<string>): Map<string, number> | null {
  const out = new Map<string, number>();
  let unit: string | null = null;
  for (const v of values) {
    const q = quantity(v);
    if (!q) return null;
    if (unit === null) unit = q.unit;
    else if (q.unit !== unit) return null;
    out.set(v, q.n);
  }
  return out.size ? out : null;
}

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

/** MICRO-S · what the values are: numbers (all of them, the specials aside) or text */
export type ValueKind = "numeric" | "text" | "none";
export function valueKind(prop: string, values: Iterable<string>): ValueKind {
  const real = [...new Set(values)].filter((v) => !isSentinel(prop, v));
  return !real.length ? "none" : quantities(real) ? "numeric" : "text";
}
/** is this scale for numbers? (a numeric scale on text follows the alphabet: said, MICRO-S) */
export const isNumericScale = (type: RampType): boolean => type !== "qualitative";
/** the scale a property starts with: text → the first qualitative, numbers → the first sequential */
export function defaultRamp(kind: ValueKind): { type: RampType; name: string } {
  const type: RampType = kind === "numeric" ? "sequential" : "qualitative";
  return { type, name: Object.keys(RAMPS[type])[0] };
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

/** the min and max of a property's numbers (null: they are not numbers) */
export function valueRange(prop: string, values: Iterable<string>): { lo: number; hi: number } | null {
  const real = [...new Set(values)].filter((v) => !isSentinel(prop, v));
  const q = real.length ? quantities(real) : null;
  if (!q) return null;
  const ns = [...q.values()];
  return { lo: Math.min(...ns), hi: Math.max(...ns) };
}

/** a scale over a property's values: numbers (all but the sentinels) on the
 *  continuous scale when the scale is sequential or diverging — between `range`
 *  (the window's min/max) or the values' own —, else EM Tools' spread. The two
 *  special values are NOT the scale's (MICRO-S): they keep their own colours,
 *  so they are never in the result. A qualitative scale with more values than
 *  colours goes round (EM Tools' spread would give neighbours one colour). */
export function rampScheme(prop: string, values: string[], type: RampType, name: string,
                           range?: { lo: number; hi: number } | null): Map<string, string> {
  const real = [...new Set(values)].filter((v) => !isSentinel(prop, v));
  const out = new Map<string, string>();
  const q = real.length ? quantities(real) : null;
  if (type !== "qualitative" && q) {
    const own = valueRange(prop, real)!;
    const { lo, hi } = range && Number.isFinite(range.lo) && Number.isFinite(range.hi) ? range : own;
    for (const v of real) out.set(v, continuousColour(q.get(v)!, lo, hi, type, name));
  } else if (type === "qualitative" && real.length > RAMPS[type][name].colors.length) {
    const colors = RAMPS[type][name].colors;
    const sorted = [...real].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sorted.forEach((v, i) => out.set(v, colors[i % colors.length]));
  } else for (const [v, c] of assignRamp(real, type, name)) out.set(v, c);
  return out;
}

// ── the .emc file (EM Tools' save_color_scheme / load_color_scheme) ─────────

export interface Emc { metadata: { property_name: string; created?: string; description?: string; [k: string]: unknown };
  color_mapping: Record<string, number[]> }

/** the .emc of a scheme. `extra` goes into `metadata` (s3dgraphy's
 *  `emc_document(extra=…)`): EM Tools reads only `property_name` there. */
export function emcDocument(prop: string, scheme: Map<string, string> | Record<string, string>, created = "",
                            extra?: Record<string, unknown>): Emc {
  const entries = scheme instanceof Map ? [...scheme] : Object.entries(scheme);
  return {
    metadata: { property_name: prop, created, description: `Color mapping for ${prop} values`, ...(extra ?? {}) },
    color_mapping: Object.fromEntries(entries.map(([v, h]) => [v, [...hexToLinear(h), 1.0]])),
  };
}

export function emcRead(doc: unknown): { property: string; scheme: Map<string, string>; leaveNone: boolean } {
  const d = doc as Partial<Emc> | null;
  const prop = d?.metadata?.property_name;
  const m = d?.color_mapping;
  if (typeof prop !== "string" || !m || typeof m !== "object") throw new Error("not a .emc: metadata.property_name and color_mapping are needed");
  const scheme = new Map<string, string>();
  for (const [v, c] of Object.entries(m)) {
    if (!Array.isArray(c) || c.length < 3) throw new Error(`not a colour for «${v}»`);
    scheme.set(String(v), linearToHex(c));
  }
  return { property: prop, scheme, leaveNone: d?.metadata?.[EMC_LEAVE_NONE] === true };
}

/** MICRO-S · the .emc of a property state: the values' colours AND the two
 *  special values, always (the ones never chosen with EM Tools' grey), so an
 *  EM Tools that reads it colours them as here; «leave as it is» in metadata. */
export function emcOfState(cs: ColourState, created = ""): Emc {
  const prop = cs.property ?? "";
  const scheme: Record<string, string> = { ...cs.scheme };
  scheme[emptyValueKey(prop)] ??= SPECIAL_GREY;
  scheme[noValueKey(prop)] ??= SPECIAL_GREY;
  return emcDocument(prop, scheme, created, cs.leaveNone ? { [EMC_LEAVE_NONE]: true } : undefined);
}

// ── the plan: a colour per unit, and the legend ─────────────────────────────

export interface ColourState {
  mode: ColourMode;
  variant: EpochVariant;
  property: string | null;
  /** value → hex seen (by hand or from a scale) */
  scheme: Record<string, string>;
  ramp: { type: RampType; name: string } | null;
  /** MICRO-S · the min and max of a numeric scale (null: the values' own) */
  range?: { lo: number; hi: number } | null;
  /** MICRO-S · the units without the property keep their type's colour */
  leaveNone?: boolean;
  /** the legend: one key isolated, keys hidden (not saved: a gesture of the moment) */
  isolated?: string | null;
  hidden?: string[];
}
export const defaultColourState = (): ColourState => ({ mode: "em", variant: "birth", property: null, scheme: {}, ramp: null, range: null, leaveNone: false, isolated: null, hidden: [] });

export interface LegendEntry { key: string; colour: string; label: string; count: number; faded?: number; epochId?: string; none?: boolean;
  /** MICRO-S · a property's special value: «valore vuoto» or «non ha la proprietà» */
  special?: "empty" | "none";
  /** «non ha la proprietà» left as it is: no colour of the scheme */
  untouched?: boolean }
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
    const rows = propertyRows(state, units, ctx.values);
    for (const u of units) {
      const key = ctx.values.get(u) ?? noValueKey(state.property);
      keyOf.set(u, key);
      const c = colourOfKey(state, key);
      if (c) colour.set(u, c);
    }
    for (const r of rows) if (r.count) legend.push(r);
    return { colour, faded, keyOf, legend };
  }
  return { colour, faded, keyOf, legend };
}

/** MICRO-S · the colour of a property's value or special value (null: left as it is) */
export function colourOfKey(state: ColourState, key: string): string | null {
  const prop = state.property ?? "";
  if (key === noValueKey(prop)) return state.leaveNone ? null : state.scheme[key] ?? SPECIAL_GREY;
  if (key === emptyValueKey(prop)) return state.scheme[key] ?? SPECIAL_GREY;
  return state.scheme[key] ?? NO_VALUE_GREY;
}

/** MICRO-S · the window's list: every value found on the units with its number
 *  of units and its colour (numbers in order, text alphabetical), then the two
 *  special values ALWAYS, with their number (0 too) — the legend keeps the
 *  rows with units. */
export function propertyRows(state: ColourState, units: string[], values: Map<string, string>): LegendEntry[] {
  const prop = state.property ?? "";
  const count = new Map<string, number>();
  for (const u of units) {
    const k = values.get(u) ?? noValueKey(prop);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const keys = [...count.keys()].filter((k) => !isSentinel(prop, k));
  const q = keys.length ? quantities(keys) : null;
  keys.sort((a, b) => (q ? q.get(a)! - q.get(b)! : a.localeCompare(b, undefined, { numeric: true })));
  const out: LegendEntry[] = keys.map((k) => ({ key: k, colour: colourOfKey(state, k)!, label: k, count: count.get(k)! }));
  const ek = emptyValueKey(prop), nk = noValueKey(prop);
  out.push({ key: ek, colour: colourOfKey(state, ek)!, label: "", count: count.get(ek) ?? 0, special: "empty" });
  out.push({ key: nk, colour: state.scheme[nk] ?? SPECIAL_GREY, label: "", count: count.get(nk) ?? 0, none: true, special: "none",
    ...(state.leaveNone ? { untouched: true } : {}) });
  return out;
}

/** MICRO-S · a property chosen: its starting scheme — the scale of its kind
 *  (text: qualitative, numbers: sequential between min and max), the special
 *  values with EM Tools' grey. */
export function startProperty(state: ColourState, prop: string, values: Iterable<string>): ColourState {
  const vals = [...values];
  const kind = valueKind(prop, vals);
  const ramp = defaultRamp(kind);
  const range = kind === "numeric" ? valueRange(prop, vals) : null;
  const scheme = Object.fromEntries(rampScheme(prop, vals, ramp.type, ramp.name, range));
  scheme[emptyValueKey(prop)] = SPECIAL_GREY;
  scheme[noValueKey(prop)] = SPECIAL_GREY;
  return { ...state, mode: "property", property: prop, scheme, ramp, range, leaveNone: false, isolated: null, hidden: [] };
}

/** MICRO-S · a scale applied: the values' colours from it, the specials' kept */
export function applyRamp(state: ColourState, values: Iterable<string>, type: RampType, name: string,
                          range?: { lo: number; hi: number } | null): ColourState {
  const prop = state.property ?? "";
  const specials = Object.fromEntries(Object.entries(state.scheme).filter(([k]) => isSentinel(prop, k)));
  return { ...state, ramp: { type, name }, range: range ?? null,
    scheme: { ...Object.fromEntries(rampScheme(prop, [...values], type, name, range)), ...specials } };
}

/** the legend's gesture: normal → isolated → hidden → normal */
export function legendClick(state: ColourState, key: string): ColourState {
  const hidden = new Set(state.hidden ?? []);
  if (state.isolated === key) { hidden.add(key); return { ...state, isolated: null, hidden: [...hidden] }; }
  if (hidden.has(key)) { hidden.delete(key); return { ...state, hidden: [...hidden] }; }
  return { ...state, isolated: key, hidden: [...hidden].filter((k) => k !== key) };
}

/** MICRO-COR06 · a swatch of the legend is a switch: its class shown or hidden.
 *  Out of an isolation, what is shown stays shown (`keys`: the legend's) */
export function legendToggle(state: ColourState, key: string, keys: string[]): ColourState {
  const hidden = new Set(state.isolated ? keys.filter((k) => k !== state.isolated) : state.hidden ?? []);
  if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
  return { ...state, isolated: null, hidden: keys.filter((k) => hidden.has(k)) };
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
