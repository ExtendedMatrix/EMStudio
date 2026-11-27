/**
 * MICRO-PX7 (PX5 B–C) · Gaussian splats as representation models: what a file
 * IS and how a point is TAKEN on one. Pure: no three, no DOM, no fetch — read
 * by the Space (`scene3d.ts`), the RM's resource (`space.ts`), the proxy tools
 * (`main.ts`) and `scripts/check-splats.mjs`.
 *
 * **What a file is.** Gaussian Splat Lite (GSL 1.11.0) reads PLY (3DGS), SPZ,
 * SOG and RAD as single models (`SplatMesh`), and streams three LOD forms with a
 * scheduler of its own (`RadStreamScheduler`, `SogStreamScheduler` for a SOG
 * `lod-meta.json`, `Lcc2StreamScheduler` for an `.lcc2` index); a 3D Tiles
 * tileset whose glTF tiles carry `KHR_gaussian_splatting` is read by the tiles
 * renderer with `3d-tiles-rendererjs-3dgs-plugin` (0.3.1). The kind is read from
 * the locator, else from the resource's name: a store URL (`…/asset/sha256:…`)
 * says nothing by itself. A `.ply` is a splat only if its header says so
 * (`plyHeaderKind`): EMStudio reads no mesh PLY, and a mesh PLY handed to the
 * splat reader is refused with its reason, never drawn as noise.
 *
 * **How a point is taken** (PX5 C). A splat has no surface. The rule chosen is
 * GSL's own raycast: along the ray, the first place where a Gaussian's kernel
 * alpha reaches `minRaycastOpacity` (the isosurface of the alpha of the nearest
 * splat crossed) — alternative (1) of PX5 C. The threshold is EMStudio's,
 * fixed here (`SPLAT_PICK_OPACITY`) and set on every splat before a pick, so a
 * new GSL default does not move the points; the extractor written from such a
 * point says it (`splatPickAttributes`: `pick_rule`, `pick_opacity` — plain
 * attributes of the ExtractorNode, no new type in s3Dgraphy). The value and
 * the measure against the mesh of the same object are in the MICRO's report.
 */

/** The forms a Gaussian splat comes in (`""`: not a splat). */
export type SplatKind = "ply" | "spz" | "sog" | "rad" | "sog-lod" | "lcc2";

/** The streamed forms (a scheduler of GSL, not one `SplatMesh`). */
export const SPLAT_STREAMED: ReadonlySet<SplatKind> = new Set<SplatKind>(["rad", "sog-lod", "lcc2"]);

const BY_NAME: Array<[RegExp, SplatKind]> = [
  [/(^|[\/\\])lod-meta\.json$/i, "sog-lod"],
  [/\.lcc2$/i, "lcc2"],
  [/\.spz$/i, "spz"],
  [/\.sog$/i, "sog"],
  [/\.rad$/i, "rad"],
  [/\.ply$/i, "ply"],
];

/** the path part of a locator: no query, no fragment, `%2F` read */
function pathOf(s: string): string {
  let p = String(s ?? "").split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch { /* as it is */ }
  return p;
}

/** The splat kind a locator (or a file name) names, `""` when none. */
export function splatKindOfName(name: string | null | undefined): SplatKind | "" {
  const p = pathOf(String(name ?? ""));
  for (const [re, k] of BY_NAME) if (re.test(p)) return k;
  return "";
}

/** What a RESOURCE is for the splat reader: its locator, else its name, else
 *  the original name a store keeps (`original_name`, `filename`). */
export function splatKindOf(d: Record<string, unknown>, name?: string | null): SplatKind | "" {
  const tries = [d.url, name, d.original_name, d.filename, d.name];
  for (const t of tries) {
    if (typeof t !== "string" || !t) continue;
    const k = splatKindOfName(t);
    if (k) return k;
  }
  return "";
}

/** What a PLY header says (the text up to `end_header`): a 3D Gaussian
 *  splatting file (the INRIA layout: `f_dc_0…2`, `opacity`, `scale_0…2`,
 *  `rot_0…3`; or SuperSplat's compressed PLY: an element `chunk` and
 *  `packed_position`), or a mesh / a cloud, which EMStudio does not read. */
export function plyHeaderKind(header: string): { gaussian: boolean; compressed: boolean; splats: number | null; why: string } {
  const h = String(header ?? "");
  if (!/^ply\s/.test(h)) return { gaussian: false, compressed: false, splats: null, why: "not a PLY (no «ply» magic)" };
  const end = h.indexOf("end_header");
  const head = end >= 0 ? h.slice(0, end) : h;
  const props = new Set([...head.matchAll(/^property\s+\S+(?:\s+\S+\s+\S+)?\s+(\S+)\s*$/gm)].map((m) => m[1]));
  const vertex = /^element\s+vertex\s+(\d+)/m.exec(head);
  const splats = vertex ? Number(vertex[1]) : null;
  if (/^element\s+chunk\s+\d+/m.test(head) && props.has("packed_position"))
    return { gaussian: true, compressed: true, splats, why: "compressed PLY (SuperSplat)" };
  const need = ["opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
  const colour = props.has("f_dc_0") || (props.has("red") && props.has("green") && props.has("blue"));
  const missing = need.filter((p) => !props.has(p));
  if (!missing.length && colour) return { gaussian: true, compressed: false, splats, why: "3DGS PLY" };
  if (/^element\s+face\s+[1-9]/m.test(head)) return { gaussian: false, compressed: false, splats, why: "a mesh PLY (faces)" };
  return { gaussian: false, compressed: false, splats, why: `no Gaussian properties (${missing.slice(0, 4).join(", ") || "colour"} missing)` };
}

/** A tileset that declares Gaussian splat tiles: `KHR_gaussian_splatting`
 *  (or the draft `KHR_spz_gaussian_splats_compression`) among the glTF
 *  extensions its `3DTILES_content_gltf` says the tiles use or require. */
export function tilesetDeclaresSplats(json: unknown): boolean {
  const j = (json ?? {}) as Record<string, any>;
  const lists: unknown[] = [j.extensionsUsed, j.extensionsRequired,
    j.extensions?.["3DTILES_content_gltf"]?.extensionsUsed, j.extensions?.["3DTILES_content_gltf"]?.extensionsRequired];
  return lists.some((l) => Array.isArray(l) && l.some((x) => /^KHR_(gaussian_splatting|spz_gaussian_splats)/.test(String(x))));
}

/** The threshold of the alpha isosurface a pick stops at (GSL's
 *  `minRaycastOpacity`): chosen by the measure of MICRO-PX7 against the mesh
 *  of the same object (the report) — fixed here, set on every splat. */
export const SPLAT_PICK_OPACITY = 0.5;

/** The name of the rule, as written in the extractor's attributes. */
export const SPLAT_PICK_RULE = "splat_alpha_isosurface";

/** What an extractor read on a splat carries: how its point was taken. */
export function splatPickAttributes(opacity = SPLAT_PICK_OPACITY): { pick_rule: string; pick_opacity: number } {
  return { pick_rule: SPLAT_PICK_RULE, pick_opacity: Math.round(opacity * 1000) / 1000 };
}

/** The tools that need a SURFACE (a mesh's own triangles): on a splat they
 *  say no, and propose the mesh of the same object or a fitted plane. */
export const SURFACE_TOOLS: ReadonlySet<string> = new Set(["surface"]);
