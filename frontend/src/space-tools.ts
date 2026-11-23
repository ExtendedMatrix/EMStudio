/**
 * MICRO-PL10-POSA-NELLO-SPAZIO (W7, E.D. 18 Nov 2026) · THE REGISTER OF THE 3D
 * TOOLS, over the scene's one click hook (`onTool`, scene3d.ts).
 *
 * Until today the tools were a constant (`VIEWER_3D_TOOLS`, `as const`) and
 * the bar was written by hand: nothing could add one. Now a tool is an entry
 * — its primitive, how many clicks it takes, where a click lands — and the
 * bar draws the register in order: the six tools of the Viewer first (they
 * keep their ids and their glyphs), then the tools a community package's
 * extractor types and landmark sets bring (SPEC-pacchetto §5.2–§5.4), then,
 * in phase 2, a plugin's (`space.tool@1`, SPEC-plugin §13).
 *
 * What a tool DOES with its vertices is its own `complete`: the register only
 * knows when it has them. Pure (no DOM, no store): `check-space-tools`.
 */

export type V3 = [number, number, number];

/** what a tool lays on the model (SPEC-pacchetto §5.2, + the Viewer's plane) */
export type ToolPrimitive = "point" | "line" | "polyline" | "surface" | "plane";
/** where a click lands: on the surface hit, on the mesh's nearest vertex, or
 *  anywhere the ray meets the model (the hit point too: there is no empty-space
 *  point in a scene of meshes) */
export type ToolSnap = "surface" | "vertex" | "free";

export interface SpaceToolSpec {
  /** unique; the Viewer's six keep theirs (`elevation`…), a package's are
   *  `pkg:<type>` and `lms:<set>` */
  id: string;
  primitive: ToolPrimitive;
  /** how many clicks: `max` reached = done; `max: null` = until Enter or a
   *  double click, once `min` are there */
  clicks: { min: number; max: number | null };
  snap: ToolSnap;
  /** one character for the narrow bar */
  glyph: string;
  /** who brings it: the core («core») or a package (its name) or a plugin */
  origin: string;
  /** its name and what it reads, in the page's language (the tooltip) */
  label: () => string;
  hint?: () => string;
  /** a tool that cannot work here (no bridge, a package without geometry):
   *  the bar shows it disabled with these words */
  disabled?: () => string | null;
  /** a landmark set's tool: the clicks are one point each, guided */
  guided?: boolean;
  /** MICRO-PX1 · the editors whose bar shows it: the Viewer's (one document's
   *  model) and/or the Space's toolbar (after «Select» and «3D cursor»).
   *  Absent: the Viewer only, as every tool before (the Space reads its
   *  extensions' tools from their layers) */
  editors?: ReadonlyArray<"viewer" | "space">;
}

/** Does the bar of `editor` show the tool? */
export function inEditor(spec: Pick<SpaceToolSpec, "editors">, editor: "viewer" | "space"): boolean {
  return (spec.editors ?? ["viewer"]).includes(editor);
}

const register: SpaceToolSpec[] = [];
const listeners = new Set<() => void>();

/** Add a tool (or replace the one with its id, in its place). The answer
 *  takes it away again. */
export function registerSpaceTool(spec: SpaceToolSpec): () => void {
  const i = register.findIndex((t) => t.id === spec.id);
  if (i >= 0) register[i] = spec; else register.push(spec);
  listeners.forEach((f) => f());
  return () => unregisterSpaceTool(spec.id);
}
export function unregisterSpaceTool(id: string): void {
  const i = register.findIndex((t) => t.id === id);
  if (i < 0) return;
  register.splice(i, 1);
  listeners.forEach((f) => f());
}
/** Every tool from `origin` away (a package's, when the overlay changes). */
export function unregisterOrigin(pred: (origin: string) => boolean): void {
  let any = false;
  for (let i = register.length - 1; i >= 0; i--) if (pred(register[i].origin)) { register.splice(i, 1); any = true; }
  if (any) listeners.forEach((f) => f());
}
/** MICRO-PX1 · the core's tools of the Space's toolbar, after «Select» and
 *  «3D cursor», in the order they were registered. */
export function spaceCoreTools(): SpaceToolSpec[] {
  return register.filter((t) => t.origin === "core" && inEditor(t, "space"));
}
/** The tools, in the bar's order (the order they were registered). */
export function spaceTools(): readonly SpaceToolSpec[] { return register; }
export function spaceTool(id: string | null | undefined): SpaceToolSpec | null {
  return id ? register.find((t) => t.id === id) ?? null : null;
}
export function onSpaceToolsChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** What a click of a tool did: one more vertex wanted, or the trace is done. */
export function clickVerdict(spec: Pick<SpaceToolSpec, "clicks">, vertices: number): "more" | "done" {
  return spec.clicks.max != null && vertices >= spec.clicks.max ? "done" : "more";
}
/** Enter or a double click: the trace closes when it has its least. */
export function canClose(spec: Pick<SpaceToolSpec, "clicks">, vertices: number): boolean {
  return spec.clicks.max == null && vertices >= Math.max(1, spec.clicks.min);
}
/** «2/2», «1/3+», «4 vertici» — the counter of the bar */
export function clickCount(spec: Pick<SpaceToolSpec, "clicks">, vertices: number,
                           openWords: (n: number) => string): string {
  if (spec.clicks.max != null && spec.clicks.max === spec.clicks.min) return `${vertices}/${spec.clicks.max}`;
  if (spec.clicks.max != null) return `${vertices}/${spec.clicks.min}–${spec.clicks.max}`;
  return vertices < spec.clicks.min ? `${vertices}/${spec.clicks.min}+` : openWords(vertices);
}

/** Where a click lands, by the tool's snap. */
export function snapped(spec: Pick<SpaceToolSpec, "snap">, hit: { point: V3; vertex?: V3 | null }): V3 {
  const p = spec.snap === "vertex" && hit.vertex ? hit.vertex : hit.point;
  return [p[0], p[1], p[2]];
}
