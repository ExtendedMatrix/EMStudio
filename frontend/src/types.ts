// .em.json v1 shapes (draft spec: docs/emjson-v1-draft.md, normative home: s3Dgraphy)

export interface EmNode {
  id: string;
  name?: string;
  node_type: string;
  description?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface EmEdge {
  id?: string;
  source: string;
  target: string;
  edge_type?: string;
  [k: string]: unknown;
}

export interface EmGraph {
  graph_id?: string;
  nodes: EmNode[];
  edges: EmEdge[];
  [k: string]: unknown;
}

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Swimlane {
  epoch_id: string;
  y: number;
  height: number;
  order?: number;
}

export interface EmLayout {
  canvas?: { width: number; height: number };
  swimlanes?: Swimlane[];
  positions?: Record<string, LayoutRect>;
  folded_groups?: string[];
  group_spaces?: Record<string, Record<string, LayoutRect>>;
  /** node ids pinned in place — the layout engine keeps them at their Rect */
  pinned?: string[];
  /** rule pins: a node placed at a corner of a container (epoch/group) + offset */
  anchors?: LayoutAnchor[];
  [k: string]: unknown;
}

export interface LayoutAnchor {
  node: string;
  /** container id — an epoch (its lane content) or a group node */
  to: string;
  /** "bl" | "tl" | "br" | "tr" (default "bl") */
  corner?: string;
  dx?: number;
  dy?: number;
}

export interface EmDocument {
  header?: Record<string, unknown>;
  graph: EmGraph;
  layout?: EmLayout;
}

/** A canvas PROJECTION of the graph — each carries its own viewport, scene and
 *  "circles of detail". `dtc` (WIN2) reads the same nodes through their
 *  digital-twin-creation relations; `multigraph` (MULTIGRAPH) shows the graph
 *  WITH everything attached to it — paradata, ornaments, graph-scope nodes — so
 *  they can be seen and set. Both are projections, not second models.
 *  `graphs` (MICRO-AUTORI-LAYOUT p.5, «Multigraph») is the workspace seen from
 *  above: one node per open graph, its own paradata attached, the rapporti
 *  between the graphs (`views/graphs.ts`). */
export type ViewKind = "matrix" | "graph" | "dtc" | "multigraph" | "graphs";

/** DP-82 · the MODE of the central area — what it currently shows. `matrix`,
 *  `graph` and `dtc` are canvas projections (they carry their own viewport/
 *  scene/circles, see `ViewKind`); `narrative` reads the graph as a story.
 *  Extensible: `table` (and a future `3d`) slots in here without touching the
 *  callers — the enum + the render dispatch are the single extension point. */
/**
 * GONE (14 set 2026) · `CentralMode` was `ViewKind | "narrative"`.
 *
 * The narrative was the one thing that was BOTH a window type and a mode of the
 * canvas — a `WindowType` in `workspace.ts` with its own tab and preset, AND an
 * overlay switched on over the canvas by `centralMode === "narrative"`. Two ways
 * to be the same thing, and the second is why `#narrative-view` had to be a
 * singleton: an overlay is over ONE canvas.
 *
 * E.D.'s decision of 12 September: the narrative is a window type and nothing
 * else. So the union has one member left and the alias says so — a central mode
 * IS a canvas projection. Kept as a name because that is what its call sites
 * mean; delete it the day nothing reads it.
 */
export type CentralMode = ViewKind;

/** A resolved authority cross-reference stored on a node/qualia
 *  (`data.authority_refs`) — the P1-D shape. `match` drives the export
 *  predicate (skos:exactMatch / skos:closeMatch; owl:sameAs is identity-only). */
export interface AuthorityRef {
  uri: string;
  authority?: string;
  label?: string;
  rank?: number;
  match?: string;
  broader?: string;
}

/** A ranked candidate returned by em-bridge `/resolve-authority` (superset of
 *  AuthorityRef with resolver-side context that is NOT persisted on the node). */
export interface AuthorityCandidate extends AuthorityRef {
  scheme?: string;
  provenance?: Record<string, unknown>;
  license?: string;
}
