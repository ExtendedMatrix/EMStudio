/**
 * THE VERSION FOR A USE — one rule in Python and in JS (s3Dgraphy
 * `resources.versions.choose_version`, E.D. 5 Oct 2026; Heriverse has the same
 * copy). Pure: `scripts/check-version-for.mjs` passes s3Dgraphy's table of cases
 * (`version_for_cases.json`) through it, and checks that the vendored copy is
 * the library's.
 *
 * The rule, in prose (the docstring of `choose_version`):
 *   · the uses are tried IN ORDER; for each, the candidates are the VERSIONS
 *     declaring it (never the master);
 *   · among them, the level asked for if there is one at that level; else the
 *     LIGHTEST — the highest `lod_level`, then the fewest bytes (`size_bytes`;
 *     unknown counts as heavier), then the id;
 *   · no version for any use → the master, said in `note`; nothing → null.
 *
 * And the versions of an asset as `versions_of` reads them from the graph: a
 * version is a resource a `lod_generation` DTC step outputs (`dtc_had_output`)
 * from the resource it takes in (`dtc_had_input`); a revision
 * (`was_revision_of`) stands for the one it revises; the level is COMPUTED from
 * the chain (master: none; lod0 the first version; one step more, one more).
 */

export interface VersionEntry {
  id: string;
  name?: string;
  master: boolean;
  level?: string | null;
  lod_level?: string | null;
  use?: string[];
  size_bytes?: number;
  checksum?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface VersionChoice {
  entry: VersionEntry | null;
  reason: "level" | "use" | "master" | "none";
  use: string | null;
  note: string;
}

/** The uses a viewer that shows a whole scene in a browser asks, in order:
 *  a web version, a realtime one, then one made for an ATON viewer. */
export const SCENE_USES = ["web", "realtime", "heriverse", "aton"];

/** The uses of the vocabulary (datamodel 1.6.26). */
export const USES = ["analysis", "realtime", "web", "mobile_ar", "print", "render", "preview", "heriverse", "aton"];

const LOD_LEVEL_RE = /^lod(0|[1-9][0-9]*)$/;
const lodOrdinal = (e: VersionEntry): number => {
  const m = LOD_LEVEL_RE.exec(String(e.lod_level || ""));
  return m ? parseInt(m[1], 10) : -1;
};
const sameLevel = (e: VersionEntry, level: string): boolean => {
  const want = String(level).trim().toLowerCase();
  return want === String(e.lod_level || "").toLowerCase() || want === String(e.level || "").trim().toLowerCase();
};
const byId = (a: { id: string }, b: { id: string }): number =>
  (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

export function chooseVersion(entries: VersionEntry[], use: string | string[],
                              preferLevel: string | null = null): VersionChoice | null {
  const all = (entries || []).filter(Boolean);
  if (!all.length) return null;
  const uses = typeof use === "string" ? [use] : Array.from(use || []);
  for (const u of uses) {
    const cands = all.filter((e) => !e.master && (e.use || []).includes(u));
    if (!cands.length) continue;
    if (preferLevel) {
      const at = cands.filter((e) => sameLevel(e, preferLevel)).sort(byId);
      if (at.length) return { entry: at[0], reason: "level", use: u, note: "" };
    }
    const weight = (e: VersionEntry): number[] => {
      const known = typeof e.size_bytes === "number";
      return [-lodOrdinal(e), known ? 0 : 1, known ? (e.size_bytes as number) : 0];
    };
    const best = cands.slice().sort((a, b) => {
      const wa = weight(a), wb = weight(b);
      for (let i = 0; i < wa.length; i++) if (wa[i] !== wb[i]) return wa[i] - wb[i];
      return byId(a, b);
    })[0];
    const note = preferLevel ? `no ${u} version at ${preferLevel}: the lightest ${u} version instead` : "";
    return { entry: best, reason: "use", use: u, note };
  }
  const master = all.find((e) => e.master);
  const asked = uses.join(", ") || "no use";
  if (!master) return { entry: null, reason: "none", use: null, note: `no version for ${asked} and no master` };
  return { entry: master, reason: "master", use: null, note: `no version for ${asked}: the master is loaded` };
}

// ── the versions read from the graph ────────────────────────────────────────

/** What the reader needs of a graph: a node by id, and the neighbours along
 *  an edge type, out of a node (it is the source) or into it (the target). */
export interface VersionGraph {
  node(id: string): { id: string; name?: unknown; node_type?: string; data?: unknown } | undefined;
  out(id: string, edgeType: string): string[];
  into(id: string, edgeType: string): string[];
}

const LOD_KIND = "lod_generation";
const dataOf = (n: { data?: unknown } | undefined): Record<string, unknown> =>
  (n && typeof n.data === "object" && n.data ? n.data as Record<string, unknown> : {});
const isResource = (g: VersionGraph, id: string) => g.node(id)?.node_type === "resource";
const sorted = (ids: string[]) => [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function oldestRevision(g: VersionGraph, id: string): string {
  const seen = new Set([id]);
  let cur = id;
  for (;;) {
    const older = sorted(g.out(cur, "was_revision_of"))[0];
    if (!older || seen.has(older)) return cur;
    seen.add(older); cur = older;
  }
}
function currentRevision(g: VersionGraph, id: string): string {
  const seen = new Set([id]);
  let cur = id;
  for (;;) {
    const newer = sorted(g.into(cur, "was_revision_of"))[0];
    if (!newer || seen.has(newer)) return cur;
    seen.add(newer); cur = newer;
  }
}
function revisionChain(g: VersionGraph, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = oldestRevision(g, id);
  while (cur && !seen.has(cur)) {
    out.push(cur); seen.add(cur);
    cur = sorted(g.into(cur, "was_revision_of"))[0];
  }
  return out;
}
/** the lod_generation step that made `id`, and its input */
function lodInputOf(g: VersionGraph, id: string): string | null {
  for (const proc of g.into(oldestRevision(g, id), "dtc_had_output")) {
    if (dataOf(g.node(proc)).dtc_kind !== LOD_KIND) continue;
    return sorted(g.out(proc, "dtc_had_input").filter((x) => isResource(g, x)))[0] ?? null;
  }
  return null;
}

/** The asset (the master) `id` is a version of; itself if it is none. */
export function assetOf(g: VersionGraph, id: string): string {
  const seen = new Set<string>();
  let cur = id;
  while (!seen.has(cur)) {
    seen.add(cur);
    const input = lodInputOf(g, cur);
    if (!input) return oldestRevision(g, cur);
    cur = input;
  }
  return oldestRevision(g, cur);
}

const usesOf = (data: Record<string, unknown>, params: Record<string, unknown>): string[] => {
  const use = data.use ?? params.use;
  if (Array.isArray(use)) return use.map(String);
  if (typeof use === "string" && use) return [use];
  const purpose = String(params.purpose || "");
  return USES.includes(purpose) ? [purpose] : [];
};
function entryOf(g: VersionGraph, id: string, extra: Partial<VersionEntry> & { master: boolean }): VersionEntry {
  const n = g.node(id);
  const d = dataOf(n);
  return { id, name: String(n?.name ?? ""), level: null, lod_level: null, use: [], ...extra,
           size_bytes: typeof d.size_bytes === "number" ? d.size_bytes : undefined,
           checksum: String(d.checksum || ""), url: String(d.url || ""), data: d };
}

/** The master and its versions, each at its current revision. */
export function versionsOf(g: VersionGraph, assetId: string): VersionEntry[] {
  const out: VersionEntry[] = [entryOf(g, currentRevision(g, assetId), { master: true })];
  const seen = new Set([assetId]);
  const walk = (from: string, depth: number): void => {
    for (const rev of revisionChain(g, from)) {
      for (const proc of g.into(rev, "dtc_had_input")) {
        const pd = dataOf(g.node(proc));
        if (pd.dtc_kind !== LOD_KIND) continue;
        const params = (pd.parameters && typeof pd.parameters === "object" ? pd.parameters : {}) as Record<string, unknown>;
        for (const child of g.out(proc, "dtc_had_output").filter((x) => isResource(g, x))) {
          if (seen.has(child)) continue;
          seen.add(child);
          const cur = currentRevision(g, child);
          out.push(entryOf(g, cur, { master: false, level: params.level == null ? null : String(params.level),
                                     lod_level: `lod${depth}`, use: usesOf(dataOf(g.node(cur)), params) }));
          walk(child, depth + 1);
        }
      }
    }
  };
  walk(assetId, 0);
  return out;
}
