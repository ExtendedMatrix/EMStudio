/**
 * STRUTTURA · FILTERS THAT SCALE — the engine (scrivania v5 `filterBar`,
 * `drawFpop`, `passRow`).
 *
 * A row is `{ text, fx }`: the words it can be found by, and for each FACET the
 * values it carries (a unit carries its type, its epoch AND the epoch's parents,
 * its states). A selection is `{ q, f }`: the text box, and for each facet the
 * values ticked. A row passes when every word of `q` matches and, for every
 * facet with something ticked, it carries at least one ticked value.
 *
 * `key:value` tokens in the text box are facets typed by hand (`epoca:med`,
 * `autore:demetrescu`, `tipo:RSF`), in Italian and English; they match the
 * value OR its label, as a substring.
 *
 * Nothing here knows what an EM unit is: the sheets declare their facets
 * (`table-views.ts`). Pure and small, so it is checked in node.
 */

export interface FacetValue {
  v: string;
  label: string;
  /** nesting depth in the list (epochs under their parent) */
  depth?: number;
  /** a mono hint on the right (an epoch's span) */
  hint?: string;
  /** the values that tick along with this one (a parent epoch's sub-epochs) */
  children?: string[];
}

export interface FacetDef {
  key: string;
  /** i18n key of the facet's name on its button */
  labelKey: string;
  values: () => FacetValue[];
}

export interface FacetRow {
  text: string;
  fx: Record<string, string[]>;
}

export interface FacetSelection {
  q: string;
  f: Record<string, string[]>;
}

/** `key:` words in the text box → facet keys, it + en (+ de). */
export const FACET_ALIAS: Record<string, string> = {
  tipo: "type", type: "type", typ: "type", // ALLOW-IT query tokens, not UI text
  epoca: "epoch", epoch: "epoch", epoche: "epoch", // ALLOW-IT query tokens, not UI text
  stato: "state", state: "state", zustand: "state", // ALLOW-IT query tokens, not UI text
  genere: "kind", kind: "kind", art: "kind", // ALLOW-IT query tokens, not UI text
  prop: "prop", proprieta: "prop", "proprietà": "prop", property: "prop", // ALLOW-IT query tokens, not UI text
  autore: "author", author: "author", autor: "author", // ALLOW-IT query tokens, not UI text
  doc: "doc", documento: "doc", document: "doc", dokument: "doc", // ALLOW-IT query tokens, not UI text
  sev: "sev", gravita: "sev", "gravità": "sev", severity: "sev", // ALLOW-IT query tokens, not UI text
  regola: "rule", rule: "rule", regel: "rule", // ALLOW-IT query tokens, not UI text
  akind: "akind",
};

/** Split the text box into free words and `key:value` tokens. */
export function parseQuery(q: string): { words: string[]; tokens: Array<[string, string]> } {
  const words: string[] = [];
  const tokens: Array<[string, string]> = [];
  for (const raw of q.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    const m = raw.match(/^([a-zàèéìòù]+):(.+)$/);
    const key = m ? FACET_ALIAS[m[1]] : undefined;
    if (m && key) tokens.push([key, m[2]]);
    else words.push(raw);
  }
  return { words, tokens };
}

/**
 * Does a row pass? `labelOf(key, v)` gives a value's label, so `epoca:med`
 * finds «Medioevo» although the value is an epoch id.
 */
export function passRow(row: FacetRow, sel: FacetSelection,
                        labelOf: (key: string, v: string) => string = (_k, v) => v): boolean {
  const { words, tokens } = parseQuery(sel.q ?? "");
  for (const w of words) if (!row.text.includes(w)) return false;
  for (const [key, needle] of tokens) {
    const vals = row.fx[key] ?? [];
    if (!vals.some((v) => v.toLowerCase().includes(needle) ||
                          labelOf(key, v).toLowerCase().includes(needle))) return false;
  }
  for (const key of Object.keys(sel.f ?? {})) {
    const want = sel.f[key];
    if (!want?.length) continue;
    if (!(row.fx[key] ?? []).some((v) => want.includes(v))) return false;
  }
  return true;
}

/**
 * How many rows carry each value of ONE facet, counting what the OTHER facets
 * and the text leave — the number beside a checkbox says what ticking it would
 * show, not what the facet already hides.
 */
export function facetCounts(rows: FacetRow[], sel: FacetSelection, key: string,
                            labelOf?: (key: string, v: string) => string): Map<string, number> {
  const probe: FacetSelection = { q: sel.q, f: { ...sel.f, [key]: [] } };
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!passRow(r, probe, labelOf)) continue;
    for (const v of new Set(r.fx[key] ?? [])) out.set(v, (out.get(v) ?? 0) + 1);
  }
  return out;
}

/** Tick or untick a value; ticking a parent ticks its children too. */
export function toggleValue(sel: FacetSelection, key: string, value: FacetValue,
                            on: boolean): FacetSelection {
  const cur = new Set(sel.f[key] ?? []);
  const all = [value.v, ...(value.children ?? [])];
  if (on) for (const v of all) cur.add(v);
  else cur.delete(value.v);
  return { ...sel, f: { ...sel.f, [key]: [...cur] } };
}

/**
 * The removable TOKENS a selection shows under the bar: one per ticked value,
 * except a child ticked with its parent (the parent says it), and more than
 * three in one facet collapse into «Epoca: 7 ×».
 */
export function selectionTokens(sel: FacetSelection, defs: FacetDef[]):
    Array<{ key: string; v: string | "*"; label: string; count?: number }> {
  const out: Array<{ key: string; v: string | "*"; label: string; count?: number }> = [];
  for (const d of defs) {
    const ticked = sel.f[d.key] ?? [];
    if (!ticked.length) continue;
    const vals = d.values();
    const byV = new Map(vals.map((x) => [x.v, x]));
    const covered = new Set<string>();
    for (const v of ticked) for (const c of byV.get(v)?.children ?? []) covered.add(c);
    const shown = ticked.filter((v) => !covered.has(v) ||
      !ticked.some((p) => (byV.get(p)?.children ?? []).includes(v) && p !== v));
    if (shown.length > 3) {
      out.push({ key: d.key, v: "*", label: d.labelKey, count: shown.length });
      continue;
    }
    for (const v of shown) out.push({ key: d.key, v, label: byV.get(v)?.label ?? v });
  }
  return out;
}
