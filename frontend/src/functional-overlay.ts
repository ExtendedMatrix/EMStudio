/**
 * MICRO-MF02 (E.D., 22 Nov 2026) · THE FUNCTIONAL OVERLAY ON THE MATRIX.
 *
 * EMBARGO (MICRO-SEG30): the function `functional-overlay` of the register
 * (features.ts). This module is reached ONLY through
 * `featureOn("functional-overlay")` / `LAB` (rule 4): in the community build
 * nothing imports it; its texts live in the `LAB_TEXTS` blocks of i18n.ts.
 *
 * What it does (the «scrivania», «Sovrimpressione», approved by E.D.): a
 * Matrix window with the switch «Functional overlay» on draws the braces of
 * the functional units ON the Matrix itself, around their members. The
 * layout is SPATIAL: the members of one functional unit are kept together in
 * their lane, a unit shared by two functional units stands ON THE BORDER
 * between the two braces (the enclosure SU003/USV102 between portico and
 * courtyard), and the braces overlap only there. Where the geometry does not
 * hold — a unit in three or more functional units, two units that cannot
 * stand side by side, units of another scale — the view falls back to the
 * INSTANCE (the master in one brace, a dashed copy in the other); the
 * instances between epochs are drawn only inside the braces. THE LANES OF THE
 * MATRIX ARE NOT TOUCHED: every unit stays in its own lane (its band, its
 * height, its order among the lanes); only its place inside the lane changes.
 *
 * The view by ACTIVITY is off while the overlay is on (E.D., 21 Nov 2026): the
 * activities' boxes are not drawn (an activity stays an attribute of its
 * units: the Inspector says it), and the header says so.
 *
 * NOTHING SEMANTIC IS DECIDED HERE (CLAUDE.md, invariant 2): which slot each
 * unit goes to, which memberships are instances and why, come from
 * s3Dgraphy's `functional_matrix.overlay_plan` (the `overlay` of the bridge's
 * answer to POST /functional-matrix, the same answer the Functional Matrix
 * draws). This module only LAYS OUT the slots in the lane — geometry — and
 * builds a scene of its own, a copy: the Matrix's scene and the document are
 * never changed, and a node of the overlay is not dragged (its place is the
 * view's, not the hand's).
 *
 * Pure: no DOM, no store — checked in node (scripts/check-functional-overlay.mjs).
 */
import type { Lane, Scene, SceneEdge, SceneNode } from "./scene";
import type { Evidence, FmAnswer, FmUnit } from "./functional-matrix";

// ── the plan (s3dgraphy.functional_matrix.overlay_plan) ──────────────────────

export type FoReason = "three_or_more" | "not_contiguous" | "other_scale" | "other_lane" | "no_lane"
  /** the page's own: the plan put a unit in a lane the Matrix draws it elsewhere */
  | "matrix_lane";
export type FoSlot = { kind: "own"; unit: string } | { kind: "border"; units: [string, string] };
export interface FoPlanLane { lane: string; slots: FoSlot[]; braces: Array<{ unit: string; slots: number[]; depth: number }> }
export interface FoPlan {
  lanes: FoPlanLane[];
  place: Record<string, { lane: string; slot: number; fu?: string; border?: [string, string] }>;
  instances: Array<{ unit: string; fu: string; lane: string; slot: number | null; reason: FoReason; from_lane: string | null }>;
  stats: { units: number; spatial: number; border: number; instanced: number;
           by_reason: Record<string, number>; memberships: number; memberships_spatial: number };
}
export type FoAnswer = FmAnswer & { overlay?: FoPlan };

// ── what the renderer draws ─────────────────────────────────────────────────

export interface FoBrace {
  unit: string; name: string; scale: string | null; evidence: Evidence;
  x: number; y: number; w: number; h: number; depth: number; lane: string;
  /** what the renderer paints: the colour of the degree, the scale in words */
  colour: string; scaleText: string;
}
export interface FoBorder { units: [string, string]; x: number; y: number; w: number; h: number }
export interface FoDrawing {
  braces: FoBrace[];
  borders: FoBorder[];
  /** what this scene shows of the plan: the units moved, the instances drawn
   *  (and why), the units with no functional unit */
  placed: number; instances: Array<{ unit: string; fu: string; reason: FoReason }>; rest: number;
  stats: FoPlan["stats"] | null;
}

/** the margins of a brace by its depth (0 = no child in the lane) */
export const FO_PAD = (depth: number): number => 10 + 12 * depth;
export const FO_TOP = (depth: number): number => 18 + 14 * depth;
export const FO_BOTTOM = (depth: number): number => 6 + 8 * depth;
const GAP = 10;           // between two units of a slot, side by side
const ROW_GAP = 14;       // …one under the other: room for «↑epoch»
const REST_GAP = 56;      // before the units of no functional unit
const BORDER_GAP = 6;     // the extra air beside a border slot

export interface FoOptions {
  /** the nodes the overlay keeps (the units and their continuity); the rest
   *  of the Matrix (activities, paradata, documents) is not drawn */
  keep(n: SceneNode): boolean;
  /** a continuity node (BR): kept, not laid out (it follows its unit) */
  continuity(n: SceneNode): boolean;
  /** the edges the overlay keeps (the stratigraphic ones) */
  keepEdge(e: SceneEdge): boolean;
  /** a lane's name, for «↑epoch» */
  laneName(id: string): string | null;
  /** the colour of the degree of evidence (functional-matrix.ts evidenceColour) */
  colour(ev: Evidence): string;
  /** the scale in the interface's language («stanza», «edificio»), "" for none */
  scaleText(scale: string | null): string;
}

interface Item { node: SceneNode | null; inst: { unit: string; fu: string; reason: FoReason; from: string | null } | null }

/**
 * The scene of a Matrix window with the overlay on: a COPY of `base` with the
 * units laid out by the plan inside their own lanes, the instances added, the
 * activities and the rest of the Matrix left out, and the braces to draw.
 * Returns null when the answer has no plan (an older bridge).
 */
export function overlayScene(base: Scene, answer: FoAnswer | null, opt: FoOptions): Scene | null {
  const plan = answer?.overlay;
  if (!answer || !plan) return null;
  const units = new Map<string, FmUnit>(answer.units.map((u) => [u.id, u]));
  const nodes: SceneNode[] = [];
  const byId = new Map<string, SceneNode>();
  for (const n of base.nodes) {
    if (n.instanceOf || n.collapsed || !opt.keep(n)) continue;
    const c: SceneNode = { ...n, badge: undefined, pdCollapsed: undefined };
    nodes.push(c);
    byId.set(c.id, c);
  }
  const lanes: Lane[] = [...base.lanes];
  const laneOfNode = new Map<string, string>();
  for (const n of nodes) {
    const cy = n.y + n.h / 2;
    const l = lanes.find((x) => cy >= x.y && cy <= x.y + x.height);
    if (l) laneOfNode.set(n.id, l.id);
  }
  // the size of a unit: the commonest of the plain units (a stratigraphic unit
  // drawn as a container in the Matrix becomes one of them here)
  const plain = nodes.filter((n) => !opt.continuity(n) && !base.groupsById?.has(n.id));
  const cellW = median(plain.map((n) => n.w)) || 90;
  const cellH = median(plain.map((n) => n.h)) || 32;
  for (const n of nodes) if (base.groupsById?.has(n.id)) { n.w = cellW; n.h = cellH; }

  const braces: FoBrace[] = [];
  const borders: FoBorder[] = [];
  const instancesDrawn: FoDrawing["instances"] = [];
  let placed = 0, restN = 0;
  const planOf = new Map(plan.lanes.map((l) => [l.lane, l]));
  const extra: SceneNode[] = [];

  for (const lane of lanes) {
    const here = nodes.filter((n) => laneOfNode.get(n.id) === lane.id && !opt.continuity(n));
    const pl = planOf.get(lane.id) ?? null;
    if (!here.length && !pl) continue;
    const left = here.length ? Math.min(...here.map((n) => n.x)) : (nodes.length ? Math.min(...nodes.map((n) => n.x)) : 40);
    const slots: Item[][] = (pl?.slots ?? []).map(() => []);
    const rest: SceneNode[] = [];
    for (const n of here) {
      const p = plan.place[n.id];
      if (p && p.lane === lane.id && slots[p.slot]) { slots[p.slot].push({ node: n, inst: null }); placed++; }
      else rest.push(n);
    }
    if (pl) {
      for (const i of plan.instances) {
        if (i.lane !== lane.id || i.slot == null || !slots[i.slot] || !byId.has(i.unit)) continue;
        slots[i.slot].push({ node: null, inst: { unit: i.unit, fu: i.fu, reason: i.reason, from: i.from_lane } });
      }
      // a master the plan puts in this lane while the Matrix draws it in
      // another: it stays in its lane, an instance stands in the slot
      for (const [uid, p] of Object.entries(plan.place)) {
        if (p.lane !== lane.id || !byId.has(uid) || laneOfNode.get(uid) === lane.id || !slots[p.slot]) continue;
        const fu = p.fu ?? p.border![0];
        slots[p.slot].push({ node: null, inst: { unit: uid, fu, reason: "matrix_lane", from: laneOfNode.get(uid) ?? null } });
      }
    }
    // the order inside a slot: the Matrix's, top to bottom then left to right
    // (the newest first), the instances after the masters
    for (const s of slots) s.sort((a, b) => ord(a) - ord(b) || (a.node && b.node ? a.node.y - b.node.y || a.node.x - b.node.x : 0));
    rest.sort((a, b) => a.y - b.y || a.x - b.x);

    const maxDepth = Math.max(0, ...(pl?.braces ?? []).map((b) => b.depth));
    const top = lane.y + FO_TOP(maxDepth);
    const avail = lane.height - FO_TOP(maxDepth) - FO_BOTTOM(maxDepth);
    const rowsFit = Math.max(1, Math.floor((avail + ROW_GAP) / (cellH + ROW_GAP)));
    // the gap after each slot: the margins of the braces closing at it and
    // of the ones opening at the next
    const bracesOf = (pl?.braces ?? []);
    const gapAfter = (i: number): number => {
      const closing = bracesOf.filter((b) => b.slots.includes(i) && !b.slots.includes(i + 1));
      const opening = bracesOf.filter((b) => b.slots.includes(i + 1) && !b.slots.includes(i));
      const pc = closing.length ? Math.max(...closing.map((b) => FO_PAD(b.depth))) : 0;
      const po = opening.length ? Math.max(...opening.map((b) => FO_PAD(b.depth))) : 0;
      const nearBorder = pl!.slots[i]?.kind === "border" || pl!.slots[i + 1]?.kind === "border";
      return pc + po + GAP + (nearBorder ? BORDER_GAP : 0);
    };
    let x = left + (bracesOf.length ? FO_PAD(maxDepth) : 0);
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    (pl?.slots ?? []).forEach((slot, i) => {
      const items = slots[i];
      const n = items.length;
      const rows = Math.max(1, Math.min(n, rowsFit));
      const cols = Math.max(1, Math.ceil(n / rows));
      const w = n ? cols * (cellW + GAP) - GAP : cellW;
      const h = n ? rows * (cellH + ROW_GAP) - ROW_GAP : cellH;
      items.forEach((it, k) => {
        const cx = x + Math.floor(k / rows) * (cellW + GAP);
        const cy = top + (k % rows) * (cellH + ROW_GAP);
        if (it.node) { it.node.x = cx + (cellW - it.node.w) / 2; it.node.y = cy + (cellH - it.node.h) / 2; return; }
        const m = byId.get(it.inst!.unit)!;
        const from = it.inst!.from ? opt.laneName(it.inst!.from) : null;
        extra.push({
          id: `fo:${it.inst!.fu}:${it.inst!.unit}`, instanceOf: it.inst!.unit, node: m.node,
          x: cx + (cellW - m.w) / 2, y: cy + (cellH - m.h) / 2, w: m.w, h: m.h,
          functional: { fu: it.inst!.fu, reason: it.inst!.reason, from },
        });
        instancesDrawn.push({ unit: it.inst!.unit, fu: it.inst!.fu, reason: it.inst!.reason });
      });
      rects.push({ x, y: top, w, h });
      if (slot.kind === "border") borders.push({ units: slot.units, x, y: top, w, h });
      x += w + (i + 1 < pl!.slots.length ? gapAfter(i) : 0);
    });
    for (const b of bracesOf) {
      const rs = b.slots.map((i) => rects[i]).filter(Boolean);
      const u = units.get(b.unit);
      if (!rs.length || !u) continue;
      const x0 = Math.min(...rs.map((r) => r.x)), x1 = Math.max(...rs.map((r) => r.x + r.w));
      const y0 = Math.min(...rs.map((r) => r.y)), y1 = Math.max(...rs.map((r) => r.y + r.h));
      braces.push({ unit: b.unit, name: u.name, scale: u.scale, evidence: u.evidence, lane: lane.id, depth: b.depth,
                    colour: opt.colour(u.evidence), scaleText: opt.scaleText(u.scale),
                    x: x0 - FO_PAD(b.depth), y: y0 - FO_TOP(b.depth), w: x1 - x0 + 2 * FO_PAD(b.depth),
                    h: y1 - y0 + FO_TOP(b.depth) + FO_BOTTOM(b.depth) });
    }
    // the units of no functional unit: after the braces, in the Matrix's order
    if (rest.length) {
      x += (pl?.slots.length ? FO_PAD(maxDepth) + REST_GAP : 0);
      const rows = Math.max(1, Math.min(rest.length, rowsFit));
      rest.forEach((n, k) => {
        n.x = x + Math.floor(k / rows) * (cellW + GAP) + (cellW - n.w) / 2;
        n.y = top + (k % rows) * (cellH + ROW_GAP) + (cellH - n.h) / 2;
      });
      restN += rest.length;
    }
  }
  // the outer braces first: drawn under the inner ones
  braces.sort((a, b) => b.depth - a.depth);
  const all = [...nodes, ...extra];
  for (const e of extra) byId.set(e.id, e);
  const edges = base.edges.filter((e) => byId.has(e.source) && byId.has(e.target) && opt.keepEdge(e));
  return {
    nodes: all, byId, edges, lanes,
    groups: [], groupsById: new Map(), memberOf: new Map(), outlineOf: new Map(),
    functional: { braces, borders, placed, instances: instancesDrawn, rest: restN, stats: plan.stats },
  };
}

const ord = (it: Item): number => (it.node ? 0 : 1);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** the brace under a world point: its label row (the line above), the
 *  innermost first — a click there selects the functional unit */
export function hitBrace(scene: Scene, wx: number, wy: number): FoBrace | null {
  const bs = scene.functional?.braces ?? [];
  let best: FoBrace | null = null;
  for (const b of bs) {
    if (wx < b.x || wx > b.x + b.w || wy < b.y || wy > b.y + 16) continue;
    if (!best || b.depth < best.depth) best = b;
  }
  return best;
}

/** «S · I»: the measure of MF02 §C as the header's tooltip says it */
export function overlayMeasure(d: FoDrawing | null | undefined): { spatial: number; instanced: number; border: number; units: number; epochs: number } | null {
  const s = d?.stats;
  if (!s) return null;
  return { spatial: s.spatial, instanced: s.instanced, border: s.border, units: s.units,
           epochs: (s.by_reason.other_lane ?? 0) + (s.by_reason.no_lane ?? 0) };
}
