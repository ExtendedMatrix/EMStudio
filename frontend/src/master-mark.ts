// MICRO-TIMBRA-MASTER (6 Nov 2026) · the sign «master not stamped», seen in
// the Archive, in the Asset table and in Optimise, with the gesture that
// stamps it there; the two kinds of master told apart — very high resolution
// (dense, often untextured) and complete (textured) — by the DATAMODEL's
// words (`ResourceNode.properties.master_kind`, translations `master_kinds`).
//
// Which file is a master, whether it is stamped and which kind it is: s3Dgraphy
// answers (`resources.master_stamp.mark`, `GET /master/mark`). What is here is
// only what a row needs BEFORE that answer arrives — the same rule for the
// candidates (a `master/` folder, a name that says it, `tier: master` in the
// graph), so a row can ask, and the words the row draws.

export type MasterState = "unstamped" | "stamped" | "changed_after_stamp" | "unverified";

export const MODEL_EXTENSIONS = [".obj", ".ply", ".glb", ".gltf", ".fbx", ".stl", ".dae", ".abc",
  ".usd", ".usdz", ".usdc", ".x3d", ".wrl", ".e57", ".las", ".laz", ".pts", ".xyz"];
const MASTER_FOLDERS = ["master", "_master", "masters"];
const NAME_RE = /(^|[^a-z])(master|vhr|highres|hi-?res|very[_ -]?high)([^a-z]|$)/i;

export function isModel(path: string): boolean {
  const m = /\.[^./\\]+$/.exec(path ?? "");
  return !!m && MODEL_EXTENSIONS.includes(m[0].toLowerCase());
}

/** A 3D file a row should ask about: `tier: master` in the graph, a
 *  `master/` folder on its path, or a name that says it; never a version. */
export function looksLikeMaster(path: string, tier?: string | null): boolean {
  if (tier === "distribution" || !isModel(path)) return false;
  if (tier === "master") return true;
  const parts = String(path).split(/[\\/]+/).map((p) => p.toLowerCase());
  if (parts.slice(0, -1).some((p) => MASTER_FOLDERS.includes(p))) return true;
  const stem = (parts[parts.length - 1] ?? "").replace(/\.[^.]+$/, "");
  return NAME_RE.test(stem) && !stem.includes("@");
}

/** Whether a mark asks for a hand (and the row draws its warning). */
export function needsStamp(state: MasterState | null | undefined): boolean {
  return state === "unstamped" || state === "changed_after_stamp";
}

/** The words of a row: the state («master non timbrato»), then the kind in
 *  the datamodel's name. `t` is the interface's i18n, `kindName` the
 *  datamodel's (rules.masterKindName). */
export function markText(state: MasterState, kind: string | null | undefined,
                         t: (k: string) => string, kindName: (k: string) => string): string {
  const head = t(`master.state.${state}`);
  return kind ? `${head} · ${kindName(kind).toLowerCase()}` : head;
}

/** The gesture a state proposes: stamp it, stamp it again as a revision, or
 *  hash it to know. */
export function gestureOf(state: MasterState): "stamp" | "restamp" | "verify" | null {
  return state === "unstamped" ? "stamp" : state === "changed_after_stamp" ? "restamp"
    : state === "unverified" ? "verify" : null;
}
