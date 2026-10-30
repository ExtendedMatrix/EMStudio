/**
 * MICRO-BLEND-OFFICINA-1 · a .blend in the Archive opens as a FOLDER: its
 * collections, objects and linked libraries, with filters and «Go to the
 * linked file»; «Check against the graph» puts a state on each object (✔ ↑ ↓
 * ✗ ○) and a label on the .blend. What the .blend holds and the states are
 * computed by s3Dgraphy (`resources.blend_folder`, through the bridge: EM
 * Tools reads the .blend in a headless Blender) — the same function EM Tools
 * calls in Blender. This module only DRAWS that answer: flattening the tree,
 * the filters of the view, the label. No DOM here (`check-blend-folder.mjs`).
 */

export type BlendState = "aligned" | "changed_here" | "newer_outside" | "missing" | "only_here";
export const STATE_SIGN: Record<BlendState, string> = {
  aligned: "✔", changed_here: "↑", newer_outside: "↓", missing: "✗", only_here: "○",
};
/** the order a hand is needed in (s3Dgraphy's STATE_ORDER) */
export const STATE_ORDER: readonly BlendState[] = ["missing", "newer_outside", "changed_here", "only_here", "aligned"];

export interface BlendObject {
  name: string; type: string; kind: string; collections: string[];
  props: Record<string, unknown>; triangles: number; mesh: string;
  library: string | null; linked: boolean; source: string; source_rel: string; chain: string[];
  missing: boolean; epochs: string[]; units: string[]; content: boolean;
}
export interface BlendLibrary { name: string; path: string; rel: string; exists: boolean; parent: string | null; depth: number; objects: string[] }
export interface BlendImage { name: string; state: "packed" | "external" | "missing" | "linked"; path: string; rel: string }
export interface BlendInventory {
  blend: string; folder: string; objects: BlendObject[]; libraries: BlendLibrary[]; images: BlendImage[];
  counts: { objects: number; content: number; linked: number; graph: number; kinds: Record<string, number>;
            textures: Record<string, number>; libraries: number; libraries_missing: number };
}
export interface BlendTreeNode {
  kind: "collection" | "library" | "loose"; name: string; objects: string[]; children: BlendTreeNode[];
  path?: string; rel?: string; exists?: boolean; depth?: number;
}
export interface CheckRow {
  key: string; kind: "object" | "texture" | "library" | "resource"; name: string; state: BlendState; sign: string;
  why: string; notes: string[]; actions: string[]; action: string | null; tick: boolean; object?: string;
  file?: string; rm?: string | null; unit?: string | null; master?: string | null; versions?: number;
}
export interface BlendCheck {
  rows: CheckRow[]; counts: Record<BlendState, number>; sentence: string; source: string; offline: boolean;
  as_of: string; objects: Record<string, BlendState>; nodes?: Record<string, BlendState>;
}
export interface BlendSession { route: "session" | "background" | "refuse"; live: boolean; dirty: boolean; save: boolean; say: string }
export interface BlendFolder { inventory: BlendInventory; tree: BlendTreeNode[]; session?: BlendSession; check?: BlendCheck }

/** The label on a .blend row of the Archive: the objects, and the signs of
 *  the last check that are not zero (the aligned first, as EM Tools says). */
export function blendLabel(f: Pick<BlendFolder, "inventory" | "check"> | null | undefined): string {
  if (!f) return "";
  const parts = [`${f.inventory.counts.objects}`];
  if (f.check) {
    for (const k of ["aligned", "changed_here", "newer_outside", "missing", "only_here"] as BlendState[]) {
      const n = f.check.counts[k] ?? 0;
      if (n) parts.push(`${STATE_SIGN[k]}${n}`);
    }
  }
  return parts.join(" ");
}

/** The worst state of a set (what a collection or the .blend shows). */
export function worstState(states: Iterable<BlendState | undefined>): BlendState | null {
  const got = new Set(states);
  for (const s of STATE_ORDER) if (got.has(s)) return s;
  return null;
}

export interface BlendFilters {
  q?: string; kind?: string; collection?: string; epoch?: string; model?: string; unit?: string;
  document?: string; state?: BlendState | "";
}

const fold = (s: unknown): string => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The unit a proxy's name stands for (`GT16.SU001` → `SU001`), s3Dgraphy's `unit_name`. */
export function unitName(n: string): string {
  const i = n.indexOf(".");
  if (i <= 0) return n;
  const head = n.slice(0, i), tail = n.slice(i + 1);
  return /^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(head) && tail && !/^\d+$/.test(tail) ? tail : n;
}

/** Does an object pass the filters of the view (an empty filter passes)? */
export function passes(o: BlendObject, f: BlendFilters, states?: Record<string, BlendState>): boolean {
  const p = o.props ?? {};
  if (f.q && !fold(o.name).includes(fold(f.q))) return false;
  if (f.kind && o.kind !== f.kind) return false;
  if (f.collection && !o.collections.includes(f.collection)) return false;
  if (f.epoch && !o.epochs.some((e) => fold(e) === fold(f.epoch))) return false;
  if (f.model && !fold(p.em_rm_node_id ?? p.em_asset_id ?? "").includes(fold(f.model))) return false;
  if (f.unit && !(o.units.some((u) => fold(u) === fold(f.unit)) || fold(unitName(o.name)) === fold(f.unit))) return false;
  if (f.document && !fold(p.em_doc_node_id ?? "").includes(fold(f.document))) return false;
  if (f.state && states?.[o.name] !== f.state) return false;
  return true;
}

/** What the selects of the view offer: the kinds, the collections, the
 *  epochs present in this .blend (sorted, each once). */
export function filterChoices(inv: BlendInventory): { kinds: string[]; collections: string[]; epochs: string[] } {
  const kinds = new Set<string>(), cols = new Set<string>(), eps = new Set<string>();
  for (const o of inv.objects) {
    kinds.add(o.kind);
    for (const c of o.collections) cols.add(c);
    for (const e of o.epochs) eps.add(e);
  }
  const s = (x: Set<string>) => [...x].sort((a, b) => a.localeCompare(b));
  return { kinds: s(kinds), collections: s(cols), epochs: s(eps) };
}

export interface FlatRow {
  kind: "collection" | "library" | "loose" | "object";
  key: string; name: string; depth: number; open?: boolean; count?: number;
  object?: BlendObject; library?: BlendTreeNode; state?: BlendState | null;
}

/**
 * The rows the view draws: each collection (open or closed: `closed` holds
 * the keys turned shut), its objects that pass the filters, its children;
 * then the libraries with what comes from them. A collection with no object
 * passing (and no child with one) is left out while a filter is on.
 */
export function flatten(f: BlendFolder, filters: BlendFilters, closed: ReadonlySet<string>): FlatRow[] {
  const by = new Map(f.inventory.objects.map((o) => [o.name, o]));
  const states = f.check?.objects;
  const filtering = Object.values(filters).some(Boolean);
  const out: FlatRow[] = [];
  const objRows = (names: string[], depth: number, at: string): FlatRow[] =>
    names.map((n) => by.get(n)).filter((o): o is BlendObject => !!o && passes(o, filters, states))
      .map((o) => ({ kind: "object" as const, key: `${at}/${o.name}`, name: o.name, depth, object: o, state: states?.[o.name] ?? null }));
  const walk = (n: BlendTreeNode, depth: number, at: string): FlatRow[] => {
    const key = `${at}/${n.kind}:${n.name}`;
    const mine = objRows(n.objects, depth + 1, key);
    const kids = n.children.map((c) => walk(c, depth + 1, key));
    const inside = mine.filter((r) => r.kind === "object").length + kids.reduce((a, k) => a + (k[0]?.count ?? 0), 0);
    if (filtering && !inside) return [];
    const head: FlatRow = { kind: n.kind, key, name: n.name, depth, open: !closed.has(key), count: inside, library: n.kind === "library" ? n : undefined,
                            state: worstState([...mine.map((r) => r.state ?? undefined)]) };
    return head.open ? [head, ...mine, ...kids.flat()] : [head];
  };
  for (const n of f.tree) out.push(...walk(n, 0, ""));
  return out;
}
