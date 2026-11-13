/**
 * MICRO-FOTO-DOCUMENTI-BBOX B · THE IMAGES OF A UNIT, by the roads the datamodel
 * already has (E.D., 13 Nov 2026: not every asset becomes a document; a photo
 * can hang from the unit itself).
 *
 *   1. direct       unit ─has_linked_resource→ resource [─has_file→ file]
 *   2. document     unit ─has_documentation→ document ─has_linked_resource→ …
 *   3. reading      unit ─has_property→ property ─has_data_provenance→ extractor
 *                   (or a combiner of extractors) ─extracted_from→ document
 *                   (or a region ─is_on_resource→ …) ─has_linked_resource→ …
 *   4. illustrates  property ─has_visual_reference→ resource | region
 *                   ─is_on_resource→ resource | document | file
 *
 * Each image is said ONCE (by its checksum, else by its file name), on the
 * first road that reaches it, in that order. Only pictures and PDFs: a 3D
 * model is the Space's.
 *
 * And the gestures that LINK (B, B2.3): the matching of file names to units
 * (EM Tools' `unit_images.core`: `US012_*.jpg` → US12) and the plan of a
 * unit's own resource «<unit> · foto» whose `has_file` are the SAME file nodes
 * of the campaign (s3Dgraphy `resources.files.unit_photo_resource`).
 *
 * Pure: a graph in, a description out — `check-unit-images.mjs` runs it in node.
 */

export type UnitImageRoute = "direct" | "document" | "reading" | "illustrates";

export interface UnitImage {
  /** the node that holds the locator: a resource or a file of a set */
  id: string;
  name: string;
  locator: string;
  medium: "image" | "pdf";
  checksum: string | null;
}

export interface UnitImageGroup {
  route: UnitImageRoute;
  /** what it comes through: the document (2, 3), the property (4); null for 1 */
  via: { id: string; name: string } | null;
  items: UnitImage[];
}

interface N { id: string; node_type?: string; name?: unknown; data?: unknown }
interface E { id?: string; source: string; target: string; edge_type?: string; attributes?: unknown }
interface G { nodes: N[]; edges: E[] }

const dataOf = (n: N | undefined): Record<string, unknown> =>
  (n?.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
const removed = (n: N | undefined): boolean => !!dataOf(n).removed;
const edgeRemoved = (e: E): boolean =>
  !!((e.attributes && typeof e.attributes === "object" ? e.attributes : {}) as Record<string, unknown>).removed;

const IMAGE_RE = /\.(jpe?g|png|tiff?|webp|bmp|gif|heic)$/i;

/** A node's locator (the Viewer's rule: url, filename, path). */
export function locatorOfNode(n: N | undefined): string {
  const d = dataOf(n);
  for (const k of ["url", "filename", "path"]) {
    const v = d[k];
    if (typeof v === "string" && v.trim() && !/^sha256:/i.test(v)) return v.trim();
  }
  return "";
}

export function mediumOfLocator(loc: string): "image" | "pdf" | null {
  const clean = loc.split(/[?#]/)[0];
  if (/\.pdf$/i.test(clean)) return "pdf";
  if (IMAGE_RE.test(clean)) return "image";
  return null;
}

const leaf = (s: string): string => {
  const seg = s.split(/[?#]/)[0].split(/[\\/]/).pop() ?? s;
  try { return decodeURIComponent(seg).toLowerCase(); } catch { return seg.toLowerCase(); }
};

/** Index of a graph for the questions below (live nodes and edges only). */
export function graphIndex(g: G) {
  const byId = new Map<string, N>();
  for (const n of g.nodes) if (!removed(n)) byId.set(n.id, n);
  const outE = new Map<string, E[]>(), inE = new Map<string, E[]>();
  for (const e of g.edges) {
    if (edgeRemoved(e) || !byId.has(e.source) || !byId.has(e.target)) continue;
    (outE.get(e.source) ?? outE.set(e.source, []).get(e.source)!).push(e);
    (inE.get(e.target) ?? inE.set(e.target, []).get(e.target)!).push(e);
  }
  const out = (id: string, type: string) => (outE.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.target);
  const inn = (id: string, type: string) => (inE.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.source);
  return { byId, out, inn };
}
type Ix = ReturnType<typeof graphIndex>;

/** The pictures a holder stands for: itself when it has a locator of a picture
 *  or a PDF, and its files (`has_file`) — a document, a resource, a file. */
function picturesOf(ix: Ix, holder: string, onlyFiles?: Set<string>): UnitImage[] {
  const out: UnitImage[] = [];
  const one = (id: string) => {
    const n = ix.byId.get(id);
    const loc = locatorOfNode(n);
    const medium = loc ? mediumOfLocator(loc) : null;
    if (!n || !medium) return;
    const ck = dataOf(n).checksum;
    out.push({ id, name: String(n.name || leaf(loc) || id), locator: loc, medium,
               checksum: typeof ck === "string" && ck ? ck : null });
  };
  const n = ix.byId.get(holder);
  if (!n) return out;
  if (n.node_type === "document") {
    // its resources first: they carry the checksum and the state the resolver
    // reads; the document's own locator is the same file, most of the time
    for (const r of ix.out(holder, "has_linked_resource")) {
      const members = ix.out(r, "has_file");
      if (!members.length) one(r);
      // a SET (a campaign of forty photographs): only the files asked for —
      // the ones a reading of the unit looked at — never the whole set
      for (const f of members) if (!onlyFiles || onlyFiles.has(f)) one(f);
    }
    one(holder);
  } else {
    const members = ix.out(holder, "has_file");
    if (!members.length) one(holder);
    for (const f of members) one(f);
  }
  return out;
}

const nameOf = (ix: Ix, id: string): string => String(ix.byId.get(id)?.name || id);

/** The documents (and bare resources) an extractor reads: `extracted_from` a
 *  document, or a region on something (the region's holder). */
function sourcesOfExtractor(ix: Ix, x: string): string[] {
  const out: string[] = [];
  // a file of a set says its DOCUMENT (the campaign that cites it), when there is one
  const docOfFile = (f: string): string => ix.inn(f, "has_file")
    .flatMap((r) => ix.inn(r, "has_linked_resource")).find((d) => ix.byId.get(d)?.node_type === "document") ?? f;
  for (const s of ix.out(x, "extracted_from")) {
    const t = ix.byId.get(s)?.node_type;
    if (t === "document") out.push(s);
    else if (t === "annotation_region")
      for (const on of ix.out(s, "is_on_resource")) out.push(ix.byId.get(on)?.node_type === "resource_file" ? docOfFile(on) : on);
  }
  return [...new Set(out)];
}

/** «Immagini dell'unità», grouped by road and by what they come through. */
export function unitImages(g: G, unitId: string): UnitImageGroup[] {
  const ix = graphIndex(g);
  if (!ix.byId.has(unitId)) return [];
  const groups: UnitImageGroup[] = [];
  const seen = new Set<string>();
  // one picture once: by its checksum, or by its file's name (a document's own
  // locator and its resource are the same file, one without a checksum)
  // (two photographs of two sensors may share a name: with a checksum, only
  // the checksum decides)
  const add = (route: UnitImageRoute, via: UnitImageGroup["via"], items: UnitImage[]) => {
    const fresh = items.filter((i) => {
      const lk = `leaf:${leaf(i.locator)}`;
      if (i.checksum ? seen.has(i.checksum) : seen.has(lk)) return false;
      if (i.checksum) seen.add(i.checksum);
      seen.add(lk);
      return true;
    });
    if (!fresh.length) return;
    const g0 = groups.find((x) => x.route === route && (x.via?.id ?? null) === (via?.id ?? null));
    if (g0) g0.items.push(...fresh); else groups.push({ route, via, items: fresh });
  };
  // 1 · direct
  for (const r of ix.out(unitId, "has_linked_resource")) add("direct", null, picturesOf(ix, r));
  // 2 · through a document
  for (const d of ix.out(unitId, "has_documentation"))
    add("document", { id: d, name: nameOf(ix, d) }, picturesOf(ix, d));
  // 3 · through the readings: property → extractor (or combiner → extractors) → source
  const props = ix.out(unitId, "has_property");
  const bySource = new Map<string, string[]>();
  for (const p of props) {
    const prov = ix.out(p, "has_data_provenance");
    const xs = prov.flatMap((x) => ix.byId.get(x)?.node_type === "combiner" ? ix.out(x, "combines") : [x]);
    for (const x of xs) {
      for (const s of sourcesOfExtractor(ix, x)) (bySource.get(s) ?? bySource.set(s, []).get(s)!).push(x);
      // the crop an extractor took: a picture of its document
      for (const r of ix.out(x, "has_linked_resource")) {
        const d = sourcesOfExtractor(ix, x)[0];
        if (d) add("reading", { id: d, name: nameOf(ix, d) }, picturesOf(ix, r));
      }
    }
  }
  const looked = filesReadForUnit(g, unitId);
  for (const s of bySource.keys()) add("reading", { id: s, name: nameOf(ix, s) }, picturesOf(ix, s, looked));
  // 4 · the property illustrated
  for (const p of props) {
    for (const v of ix.out(p, "has_visual_reference")) {
      const t = ix.byId.get(v)?.node_type;
      const holders = t === "annotation_region" ? ix.out(v, "is_on_resource") : [v];
      for (const h of holders) add("illustrates", { id: p, name: nameOf(ix, p) }, picturesOf(ix, h));
    }
  }
  return groups;
}

/** The images in one flat list, the order of the groups (the Viewer's). */
export const flatImages = (groups: UnitImageGroup[]): UnitImage[] => groups.flatMap((x) => x.items);

// ── linking: names, and the unit's own resource ──────────────────────────────

const CODE_RE = /^([A-Za-z]+)0*(\d+)([A-Za-z]*)$/;

/** `US012` → `us12` (EM Tools `normal_code`): letters and number, case and
 *  leading zeros apart; a code without that shape only lower-cased. */
export function normalCode(text: string): string {
  const t = String(text ?? "").trim();
  const m = CODE_RE.exec(t);
  return m ? `${m[1].toLowerCase()}${Number(m[2])}${m[3].toLowerCase()}` : t.toLowerCase();
}

/** The forms a unit's name takes in a file name (EM Tools `unit_keys`): the
 *  whole name and its last part (`1.US10` → `US10`), normalised. */
export function unitKeys(name: string): string[] {
  const n = String(name ?? "").trim();
  const keys = [normalCode(n)];
  const last = n.split(".").pop() ?? n;
  if (last !== n) keys.push(normalCode(last));
  return keys.filter((k, i) => k && keys.indexOf(k) === i);
}

/** The code a file name opens with (`T15_fronte.jpg` → `t15`, `US012-a.jpg` →
 *  `us12`): what precedes the first `_`, `-`, space or dot. */
export function fileCode(fileName: string): string {
  const base = leaf(fileName).replace(/\.[^.]+$/, "");
  const head = base.split(/[_\-\s.]/)[0] ?? base;
  return normalCode(head);
}

export interface NameMatch { file: string; units: string[] }

/**
 * «Collega per nome…»: the files whose name OPENS with a unit's code
 * (`T15_*.jpg` → SF T15, the pattern `{unit}_*` of EM Tools). One unit → a
 * pair proposed; two or more → ambiguous, listed and never chosen; none → left.
 */
export function matchByName(files: Array<{ id: string; name: string }>, units: Array<{ id: string; name: string }>): {
  pairs: Array<{ file: string; unit: string }>; ambiguous: NameMatch[]; unmatched: string[];
} {
  const byKey = new Map<string, string[]>();
  for (const u of units) for (const k of unitKeys(u.name)) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(u.id);
  const pairs: Array<{ file: string; unit: string }> = [];
  const ambiguous: NameMatch[] = [];
  const unmatched: string[] = [];
  for (const f of files) {
    const hit = [...new Set(byKey.get(fileCode(f.name)) ?? [])];
    if (hit.length === 1) pairs.push({ file: f.id, unit: hit[0] });
    else if (hit.length > 1) ambiguous.push({ file: f.id, units: hit });
    else unmatched.push(f.id);
  }
  return { pairs, ambiguous, unmatched };
}

/** The unit's own photo resource («T11 · foto», `data.unit_photos` = the
 *  unit), or null (s3Dgraphy `unit_photo_resource`). */
export function unitPhotoResourceOf(g: G, unitId: string): string | null {
  const ix = graphIndex(g);
  return ix.out(unitId, "has_linked_resource").find((r) => dataOf(ix.byId.get(r)).unit_photos === unitId) ?? null;
}

/** The FILE nodes a unit's photo resource holds (`has_file`). */
export function unitPhotoFiles(g: G, unitId: string): Set<string> {
  const r = unitPhotoResourceOf(g, unitId);
  if (!r) return new Set();
  return new Set(graphIndex(g).out(r, "has_file"));
}

/** The id s3Dgraphy gives that resource is a uuid5; here the id is stable by
 *  the unit too, readable: `<unit>__photos`. */
export const unitPhotoResourceId = (unitId: string): string => `${unitId}__photos`;

/** The files of a campaign (a document's resource-folder) a region read by an
 *  extractor that feeds the unit is on — the photos «read for» the unit. */
export function filesReadForUnit(g: G, unitId: string): Set<string> {
  const ix = graphIndex(g);
  const out = new Set<string>();
  for (const p of ix.out(unitId, "has_property")) {
    const prov = ix.out(p, "has_data_provenance");
    const xs = prov.flatMap((x) => ix.byId.get(x)?.node_type === "combiner" ? ix.out(x, "combines") : [x]);
    for (const x of xs) for (const r of ix.out(x, "extracted_from"))
      if (ix.byId.get(r)?.node_type === "annotation_region")
        for (const on of ix.out(r, "is_on_resource")) if (ix.byId.get(on)?.node_type === "resource_file") out.add(on);
    for (const v of ix.out(p, "has_visual_reference"))
      for (const on of ix.out(v, "is_on_resource")) if (ix.byId.get(on)?.node_type === "resource_file") out.add(on);
  }
  return out;
}

/** The files of a document with more than one (its resources' `has_file`),
 *  with what the gallery groups them by: the folder, the camera, the date. */
export function documentFiles(g: G, docId: string): Array<{ id: string; name: string; locator: string;
  folder: string; camera: string; date: string }> {
  const ix = graphIndex(g);
  const out: Array<{ id: string; name: string; locator: string; folder: string; camera: string; date: string }> = [];
  const seen = new Set<string>();
  for (const r of ix.out(docId, "has_linked_resource")) {
    for (const f of ix.out(r, "has_file")) {
      if (seen.has(f)) continue;
      seen.add(f);
      const n = ix.byId.get(f);
      const d = dataOf(n);
      const loc = locatorOfNode(n);
      if (!loc || mediumOfLocator(loc) !== "image") continue;
      const parts = loc.split(/[\\/]/);
      const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
      const cam = d.camera && typeof d.camera === "object" ? (d.camera as Record<string, unknown>) : null;
      out.push({ id: f, name: String(n?.name || leaf(loc)), locator: loc,
                 folder: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
                 // Metashape's importer (`_photo_member`): the sensor's lot is the
                 // folder; `taken_at` is the date the project read
                 camera: str(d.sensor_label ?? d.sensor ?? cam?.model ?? d.camera_model),
                 date: str(d.taken_at ?? d.date ?? d.datetime).slice(0, 10) });
    }
  }
  return out;
}
