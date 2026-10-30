/**
 * MICRO-INGRESSO-ASSET-1 · «Fai entrare un asset»: the one moment a 3D asset
 * (or a lot of them) enters the study — what the guided procedure decides,
 * without the DOM.
 *
 * E.D.'s decisions on the desk v4 (30 Oct 2026): the DOOR is the context menu
 * of a file, a folder or the objects of a `.blend` in the Archive (and a drop
 * on the Archive); the ROOM is a large dialog over the Archive with five steps
 * in a row — Choose → Frame → Document → Stamp → After (V2: the frame BEFORE
 * the document); the frame is «already georeferenced», «EPSG + shift» or «by
 * points» (V3: clicked on the model in the 3D view and from a total station's
 * file, 3–5 points, a rototranslation, the scale only when asked and never for
 * a tablet's LiDAR); one asset at a time AND a lot (V4: a document each, or
 * all in one container that is the document); the Lab's Door stays in the Lab
 * (V5 = no: nothing of it is here).
 *
 * The rules this module keeps, said once:
 *
 * · the frame is applied to the MASTER and inherited by what is made from it
 *   (a version, a LOD, a tileset): `data.frame` on the master's resource for
 *   EPSG + shift (s3Dgraphy `geometry.frame.frame_of` follows the asset), and
 *   for points the registration the graph already knows — `resource
 *   -has_registration_transform-> transform -has_gcp_set-> points`
 *   (s3Dgraphy `geometry.registration.registration_of` follows the asset too);
 * · the document is a decision (doc-form.ts): a name in the study's numbering,
 *   proposed and editable, a description, the year;
 * · the stamp is the Timbro's (stamp-compose.ts): this module only says WHICH
 *   act the provenance is — and an origin still costs a declaration: only the
 *   tablet's LiDAR is a capture, every other provenance names what it came
 *   from (declared parents), so the easy road does not invent origins;
 * · «After» does not redo Ottimizza: it points at it, the levels and the
 *   tileset are variants of the document made there.
 *
 * `check-ingress.mjs` reads this module.
 */

export type IngressStep = "choose" | "frame" | "document" | "stamp" | "after";
/** V2 · the frame first, then the document */
export const STEPS: readonly IngressStep[] = ["choose", "frame", "document", "stamp", "after"];

export type FrameMode = "already" | "epsg" | "points";
export const FRAME_MODES: readonly FrameMode[] = ["already", "epsg", "points"];
export type Provenance = "metashape" | "realityscan" | "lidar" | "existing" | "other";
export const PROVENANCES: readonly Provenance[] = ["metashape", "realityscan", "lidar", "existing", "other"];
/** very high resolution (dense geometry, often untextured) · complete master
 *  (textured: the texturing is a step with TWO inputs) */
export type MasterKind = "vhr" | "complete";
export const MASTER_KINDS: readonly MasterKind[] = ["vhr", "complete"];
export type Grouping = "each" | "container";
export type After = "nothing" | "levels" | "tileset";
export const AFTERS: readonly After[] = ["nothing", "levels", "tileset"];
export type PointsFrom = "view" | "file";

export type V3 = [number, number, number];

/** one asset of the ingress: a file, a folder (a tileset), an object of a .blend */
export interface IngressAsset {
  path: string;
  name: string;
  size: number;
  mtime: number;
  type: "file" | "dir" | "datablock";
  /** an object of a .blend: the .blend and the object's name */
  blend?: { file: string; object: string };
}

export interface ControlPoint {
  id: string;
  /** where the point is ON THE MODEL (its own frame): clicked, or a marker */
  local: V3 | null;
  /** where it is in the world (the CRS): typed, or read from a file */
  world: V3 | null;
  /** a pair switched off stays in the table, out of the fit */
  use: boolean;
}

/** what s3Dgraphy's `fit_points` answers (through `/geo/fit-points`) */
export interface PointsFit {
  ok: boolean;
  error?: string;
  rotation?: number[][];
  translation?: number[];
  scale?: number;
  scaled?: boolean;
  residuals?: Record<string, number>;
  mean?: number;
  rms?: number;
  max?: number;
  n?: number;
  used?: string[];
  warnings?: string[];
  /** the two nodes and their edge, when ids were asked */
  graph?: { nodes: Array<Record<string, unknown>>; edges: Array<{ source: string; target: string; edge_type: string }> };
}

export interface FrameChoice {
  mode: FrameMode;
  epsg: number | null;
  shift: V3;
  /** where the shift was read: the graph's georeference, a SHIFT.txt, typed */
  shiftSource: "graph" | "file" | "manual";
  shiftNote: string;
  points: ControlPoint[];
  pointsFrom: PointsFrom;
  /** the scale is solved only when asked (and never for a LiDAR) */
  scale: boolean;
  fit: PointsFit | null;
}

export interface DocChoice {
  mode: "new" | "existing";
  existingId: string;
  name: string;
  description: string;
  /** the date of the survey, ISO (yyyy-mm-dd); its YEAR becomes the document's
   *  `absolute_time_start` */
  date: string;
  author: string;
  provenance: Provenance;
  /** the words for «existing» and «other» (the program, the old survey…) */
  provenanceText: string;
}

export interface StampChoice {
  master: MasterKind;
  /** the stamp's operator (ORCID id and the name a person reads) */
  operator: { id: string; label: string };
  license: string;
  /** ISO date, empty = no embargo */
  embargoUntil: string;
  /** the two inputs of a complete master's texturing */
  reducedMesh: string;
  alignedImages: string;
}

/** what one asset may change of the lot's choices (V4 «cambiarne una per file») */
export interface AssetOverride {
  docName?: string;
  provenance?: Provenance;
  master?: MasterKind;
  frameMode?: FrameMode;
  /** left out of the lot */
  skip?: boolean;
}

export interface IngressState {
  assets: IngressAsset[];
  step: IngressStep;
  /** V4 · more than one asset: a document each, or one container-document */
  grouping: Grouping;
  frame: FrameChoice;
  doc: DocChoice;
  stamp: StampChoice;
  after: After;
  overrides: Record<string, AssetOverride>;
}

export interface IngressContext {
  /** the next free D.xx of the study (naming.ts) */
  nextDocName: string;
  /** every name already given to a node: a proposal never repeats one */
  takenNames: Iterable<string>;
  today: string;
  operator: { id: string; label: string };
  /** the study's georeference, when it has one */
  graphFrame: { epsg: number; shift: V3 } | null;
  /** a SHIFT.txt read beside the assets */
  shiftFile?: { epsg: number; shift: V3; name: string } | null;
}

// ── the start ────────────────────────────────────────────────────────────────

const stemOf = (name: string): string => name.replace(/\.[^.]+$/, "");

/** the provenance a file's name and folder suggest (a proposal, said as one) */
export function guessProvenance(assets: readonly IngressAsset[]): Provenance {
  const all = assets.map((a) => a.path.toLowerCase()).join(" ");
  if (/lidar|ipad|iphone|polycam|scaniverse|3d ?scanner ?app|sitescape/.test(all)) return "lidar";
  if (/realityscan|reality ?capture|rcap/.test(all)) return "realityscan";
  if (/metashape|photoscan|agisoft/.test(all)) return "metashape";
  return "metashape";
}

export function newIngress(assets: IngressAsset[], ctx: IngressContext): IngressState {
  const frame: FrameChoice = {
    mode: ctx.shiftFile ? "epsg" : ctx.graphFrame ? "already" : "points",
    epsg: ctx.shiftFile?.epsg ?? ctx.graphFrame?.epsg ?? null,
    shift: ctx.shiftFile?.shift ?? ctx.graphFrame?.shift ?? [0, 0, 0],
    shiftSource: ctx.shiftFile ? "file" : ctx.graphFrame ? "graph" : "manual",
    shiftNote: ctx.shiftFile ? ctx.shiftFile.name : "",
    points: [1, 2, 3].map((i) => ({ id: `P${i}`, local: null, world: null, use: true })),
    pointsFrom: "view",
    scale: false,
    fit: null,
  };
  const provenance = guessProvenance(assets);
  const first = assets[0];
  return {
    assets,
    step: "choose",
    grouping: assets.length > 1 ? "container" : "each",
    frame,
    doc: {
      mode: "new", existingId: "", name: ctx.nextDocName,
      description: assets.length > 1 ? commonFolderWords(assets) : first ? descriptionOf(first.name) : "",
      date: ctx.today, author: ctx.operator.label, provenance, provenanceText: "",
    },
    stamp: {
      master: "vhr", operator: { ...ctx.operator }, license: "", embargoUntil: "",
      reducedMesh: "", alignedImages: "",
    },
    after: "nothing",
    overrides: {},
  };
}

/** «muro_nord-2026.obj» → «muro nord 2026» (doc-form's `descriptionFromFile`) */
export function descriptionOf(filename: string): string {
  return stemOf(filename).replace(/[_-]+/g, " ").trim();
}

/** the words of the folder a lot shares: «RB/LOD0» → «RB LOD0» */
export function commonFolderWords(assets: readonly IngressAsset[]): string {
  const dirs = assets.map((a) => a.path.split("/").slice(0, -1));
  if (!dirs.length) return "";
  const common: string[] = [];
  for (let i = 0; i < dirs[0].length; i++) {
    if (dirs.every((d) => d[i] === dirs[0][i])) common.push(dirs[0][i]);
    else break;
  }
  return common.slice(-2).join(" ").replace(/[_-]+/g, " ").trim();
}

// ── the names of a lot ───────────────────────────────────────────────────────

/** `n` names from `first` on, skipping the taken ones: D.41 → D.41, D.42… */
export function nextNames(first: string, n: number, taken: Iterable<string>): string[] {
  const used = new Set(taken);
  const m = /^(.*?)(\d+)$/.exec(first);
  if (!m) return Array.from({ length: n }, (_, i) => (i ? `${first}-${i + 1}` : first));
  const [, prefix, digits] = m;
  const out: string[] = [];
  let k = Number(digits);
  while (out.length < n) {
    const name = `${prefix}${String(k).padStart(digits.length, "0")}`;
    if (!used.has(name)) out.push(name);
    used.add(name);
    k++;
  }
  return out;
}

/** the assets that enter (the skipped ones stay out) */
export const entering = (s: IngressState): IngressAsset[] => s.assets.filter((a) => !s.overrides[a.path]?.skip);

/** the documents the ingress makes or uses: one per asset, or one for all */
export interface DocPlan {
  name: string;
  existingId: string | null;
  assets: IngressAsset[];
}

export function documentsOf(s: IngressState, taken: Iterable<string>): DocPlan[] {
  const list = entering(s);
  if (s.doc.mode === "existing" && s.doc.existingId)
    return [{ name: s.doc.name, existingId: s.doc.existingId, assets: list }];
  if (s.grouping === "container" || list.length <= 1)
    return list.length ? [{ name: s.doc.name, existingId: null, assets: list }] : [];
  const fixed = new Set(list.map((a) => s.overrides[a.path]?.docName).filter((x): x is string => !!x));
  const auto = nextNames(s.doc.name, list.length, [...taken, ...fixed]);
  let i = 0;
  return list.map((a) => ({ name: s.overrides[a.path]?.docName || auto[i++], existingId: null, assets: [a] }));
}

/** an asset's choices: the lot's, with what it changed */
export function effective(s: IngressState, a: IngressAsset): { provenance: Provenance; master: MasterKind; frameMode: FrameMode } {
  const o = s.overrides[a.path] ?? {};
  return { provenance: o.provenance ?? s.doc.provenance, master: o.master ?? s.stamp.master,
           frameMode: o.frameMode ?? s.frame.mode };
}

// ── the frame ────────────────────────────────────────────────────────────────

/** V3 · the scale is offered except for a LiDAR (its points are already in scale) */
export const scaleAllowed = (p: Provenance): boolean => p !== "lidar";

/** the pairs the fit reads: a point with both places */
export function pairs(points: readonly ControlPoint[]): Array<{ id: string; local: V3; world: V3; use: boolean }> {
  return points.filter((p) => p.local && p.world)
    .map((p) => ({ id: p.id, local: p.local!, world: p.world!, use: p.use }));
}

/** why the frame cannot be applied yet (an i18n key), or null */
export function frameMissing(f: FrameChoice): string | null {
  if (f.mode === "already") return null;
  if (f.mode === "epsg") return f.epsg && f.epsg > 0 ? null : "ingress.why.epsg";
  const used = pairs(f.points).filter((p) => p.use);
  if (used.length < 3) return "ingress.why.points";
  if (!f.fit) return "ingress.why.fit";
  if (!f.fit.ok) return "ingress.why.fitFailed";
  return null;
}

/** a new point's name: the next P<n> not in the table */
export function nextPointId(points: readonly ControlPoint[]): string {
  const ids = new Set(points.map((p) => p.id));
  let i = points.length + 1;
  while (ids.has(`P${i}`)) i++;
  return `P${i}`;
}

/** the frame as `data.frame` (s3Dgraphy `geometry.frame.make_frame`) */
export function frameData(f: FrameChoice): Record<string, unknown> | null {
  if (f.mode !== "epsg" || !f.epsg) return null;
  return { crs: `EPSG:${f.epsg}`, shift: f.shift.map((v) => Number(v) || 0),
           ...(f.shiftNote ? { note: f.shiftNote } : {}), source: f.shiftSource };
}

/** «a punti»: the residuals said in the table — millimetres under a metre */
export function residualText(m: number | undefined | null): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return m < 1 ? `${(m * 1000).toFixed(m < 0.01 ? 2 : 1)} mm` : `${m.toFixed(3)} m`;
}

// ── the stamp: which act the provenance is ───────────────────────────────────

export interface DeclaredParentSpec { kind: "sources" | "file"; labelKey: string; label: string; path?: string }
export interface ActPlan {
  /** a capture (only the LiDAR) — every other provenance names a parent */
  origin: boolean;
  kind: string;
  technique: string;
  /** the parents declared, not stamped (stamp-compose's `declared` level 0) */
  parents: DeclaredParentSpec[];
}

const PROGRAM: Record<Provenance, string> = {
  metashape: "Agisoft Metashape", realityscan: "RealityScan", lidar: "", existing: "", other: "",
};

/**
 * The act of a master, read off its provenance and its kind:
 *
 * · a tablet's LiDAR — the scan IS the capture: an origin, `laserscanner`;
 * · Metashape / RealityScan — `photogrammetry` from the aligned photographs
 *   (declared: the images of the survey);
 * · a complete master — `texturing`, TWO inputs: the reduced mesh and the
 *   aligned images (the decision of 30 Oct, «un passo a due ingressi»);
 * · a pre-existing model — `format_conversion` of the model it was (declared
 *   by the words given), never an origin invented;
 * · other — `transformation` from what the words say.
 */
export function actFor(provenance: Provenance, master: MasterKind, words: { text: string; reducedMesh?: string; alignedImages?: string }): ActPlan {
  const text = words.text.trim();
  if (master === "complete") {
    return {
      origin: false, kind: "texturing", technique: PROGRAM[provenance] || text,
      parents: [
        { kind: words.reducedMesh?.includes("/") ? "file" : "sources", labelKey: "ingress.parent.reducedMesh",
          label: words.reducedMesh?.trim() || "", ...(words.reducedMesh?.includes("/") ? { path: words.reducedMesh.trim() } : {}) },
        { kind: "sources", labelKey: "ingress.parent.alignedImages", label: words.alignedImages?.trim() || "" },
      ],
    };
  }
  if (provenance === "lidar") return { origin: true, kind: "laserscanner", technique: text || "LiDAR", parents: [] };
  if (provenance === "metashape" || provenance === "realityscan")
    return { origin: false, kind: "photogrammetry", technique: PROGRAM[provenance],
             parents: [{ kind: "sources", labelKey: "ingress.parent.images", label: "" }] };
  if (provenance === "existing")
    return { origin: false, kind: "format_conversion", technique: text,
             parents: [{ kind: "sources", labelKey: "ingress.parent.existing", label: text }] };
  return { origin: false, kind: "transformation", technique: text,
           parents: [{ kind: "sources", labelKey: "ingress.parent.other", label: text }] };
}

/** the act's parameters: what the frame says, written once on the master's
 *  stamp (the «timbro del passo»: the georeference travels with the act) */
export function stampParameters(f: FrameChoice, mode: FrameMode): Record<string, unknown> {
  if (mode === "epsg") {
    const d = frameData({ ...f, mode });
    return d ? { frame: d } : {};
  }
  if (mode === "points" && f.fit?.ok)
    return { registration: { method: "points", crs: f.epsg ? `EPSG:${f.epsg}` : null, n: f.fit.n,
             rms: f.fit.rms, mean: f.fit.mean, scale: f.fit.scale, scaled: !!f.fit.scaled } };
  return {};
}

// ── the summary: what will enter, and the piece of Chain that is born ────────

export interface ChainPiece { key: string; label?: string; kind?: string; sign: "parent" | "act" | "file" | "doc" | "frame" }
export interface SummaryRow {
  doc: string;
  existing: boolean;
  files: string[];
  frame: FrameMode;
  provenance: Provenance;
  master: MasterKind;
  act: ActPlan;
  chain: ChainPiece[];
}

export function summary(s: IngressState, taken: Iterable<string>): SummaryRow[] {
  return documentsOf(s, taken).map((d) => {
    const first = d.assets[0];
    const e = first ? effective(s, first) : { provenance: s.doc.provenance, master: s.stamp.master, frameMode: s.frame.mode };
    const act = actFor(e.provenance, e.master, { text: s.doc.provenanceText, reducedMesh: s.stamp.reducedMesh,
                                                  alignedImages: s.stamp.alignedImages });
    const chain: ChainPiece[] = [
      ...act.parents.map((p): ChainPiece => ({ key: p.labelKey, label: p.label, sign: "parent" })),
      { key: act.origin ? "ingress.chain.capture" : "ingress.chain.act", kind: act.kind, label: act.technique, sign: "act" },
      { key: "ingress.chain.files", label: String(d.assets.length), sign: "file" },
      ...(e.frameMode !== "already" ? [{ key: `ingress.frame.${e.frameMode}`, sign: "frame" } as ChainPiece] : []),
      { key: "ingress.chain.doc", label: d.name, sign: "doc" },
    ];
    return { doc: d.name, existing: !!d.existingId, files: d.assets.map((a) => a.name), frame: e.frameMode,
             provenance: e.provenance, master: e.master, act, chain };
  });
}

/** why «Fai entrare» is not possible yet (an i18n key), or null */
export function readyToEnter(s: IngressState): string | null {
  if (!entering(s).length) return "ingress.why.noAssets";
  const fm = frameMissing(s.frame);
  const usesFrame = entering(s).some((a) => effective(s, a).frameMode === s.frame.mode);
  if (fm && usesFrame) return fm;
  if (s.doc.mode === "existing" ? !s.doc.existingId : !s.doc.name.trim()) return "ingress.why.doc";
  if ((s.doc.provenance === "existing" || s.doc.provenance === "other") && !s.doc.provenanceText.trim())
    return "ingress.why.provenance";
  if (!s.stamp.operator.id && !s.stamp.operator.label) return "ingress.why.operator";
  if (s.stamp.master === "complete" && !s.stamp.alignedImages.trim() && !s.stamp.reducedMesh.trim())
    return "ingress.why.texturing";
  return null;
}

// ── the graph: what «Fai entrare» writes ─────────────────────────────────────

/** the year of an ISO date, for `absolute_time_start` */
export function yearOfDate(iso: string): number | null {
  const m = /^(-?\d{1,4})/.exec(iso.trim());
  return m ? Number(m[1]) : null;
}

/** a document node as the form makes it (doc-form.ts: name, description,
 *  `data.filename`) with the year of the survey — a STRING, as the importers
 *  write it (EM Tools' list of sources refuses a number: measured, the
 *  background Blender stopped on it) */
export function documentNode(id: string, d: DocPlan, s: IngressState, relPath: (p: string) => string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (d.assets.length === 1) data.filename = relPath(d.assets[0].path);
  const y = yearOfDate(s.doc.date);
  if (y !== null) data.absolute_time_start = String(y);
  return { id, name: d.name, node_type: "document", description: s.doc.description.trim(), data };
}
