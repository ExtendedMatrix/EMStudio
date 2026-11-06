/**
 * MICRO-LAB bande-2 · NOTHING DRAWN ON TOP OF SOMETHING ELSE.
 *
 * E.D. (25 Oct 2026, lab.3): in horizons the Matrix showed group boxes over
 * other groups, cards «from …» over one another, nodes of two graphs over each
 * other. This is the measure: a pure check of a built Matrix scene (no DOM),
 * the same for the epochs and the horizons, used by the node and the browser
 * checks.
 *
 *  · two boxes (leaf nodes) must not intersect;
 *  · a box and a group: apart, or — if the group is one of its containers
 *    (`memberOf`, `outlineOf`) — inside it or apart, never across its border
 *    (a member drawn away from its box, joined by its edge, is legal: a dated
 *    document in the band of its date);
 *  · two groups: the same, nested or apart;
 *  · two bands (lanes, the horizon bands too) must not share a y;
 *  · the cards (`extra`, e.g. the «from …» badges, in WORLD coordinates) must
 *    not intersect a box, a group header or another card — except their own box.
 *
 * A tolerance of half a unit absorbs the rounding of the layout.
 */
import type { Scene } from "./scene";

export interface Rect { x: number; y: number; w: number; h: number }
export interface OverlapItem extends Rect { kind: "node" | "group" | "card" | "lane"; id: string; owner?: string }
export interface Overlap { a: string; b: string; kind: string }
export interface OverlapReport { items: number; overlaps: Overlap[]; byKind: Record<string, number> }

const EPS = 0.5;
const meets = (a: Rect, b: Rect): boolean =>
  a.x + a.w > b.x + EPS && b.x + b.w > a.x + EPS && a.y + a.h > b.y + EPS && b.y + b.h > a.y + EPS;
const inside = (a: Rect, b: Rect): boolean =>
  a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS;

/** The boxes a Matrix scene draws, as rectangles (world coordinates). */
export function sceneItems(scene: Scene, cards: readonly OverlapItem[] = []): OverlapItem[] {
  const groups = scene.groupsById ?? new Map();
  const items: OverlapItem[] = [];
  for (const n of scene.nodes) {
    if (n.collapsed || groups.has(n.id) || !(n.w > 0 && n.h > 0)) continue;
    items.push({ kind: "node", id: n.id, x: n.x, y: n.y, w: n.w, h: n.h });
  }
  for (const g of scene.groups ?? []) {
    if (scene.byId.get(g.id)?.collapsed) continue;
    items.push({ kind: "group", id: g.id, x: g.x, y: g.y, w: g.w, h: g.h });
  }
  for (const l of scene.lanes) items.push({ kind: "lane", id: l.id, x: 0, y: l.y, w: 1, h: l.height });
  return [...items, ...cards];
}

export function sceneOverlaps(scene: Scene, cards: readonly OverlapItem[] = []): OverlapReport {
  const items = sceneItems(scene, cards);
  const parents = [scene.memberOf, scene.outlineOf].filter((m): m is Map<string, string> => !!m);
  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>();
    const todo = [id];
    while (todo.length) {
      const x = todo.pop()!;
      for (const m of parents) {
        const p = m.get(x);
        if (p && !out.has(p)) { out.add(p); todo.push(p); }
      }
    }
    return out;
  };
  const anc = new Map<string, Set<string>>();
  const ancOf = (id: string): Set<string> => anc.get(id) ?? anc.set(id, ancestors(id)).get(id)!;
  const overlaps: Overlap[] = [];
  const push = (a: OverlapItem, b: OverlapItem, kind: string): void => { overlaps.push({ a: a.id, b: b.id, kind }); };
  const lanes = items.filter((i) => i.kind === "lane");
  for (let i = 0; i < lanes.length; i++)
    for (let j = i + 1; j < lanes.length; j++) {
      const a = lanes[i], b = lanes[j];
      if (a.y + a.h > b.y + EPS && b.y + b.h > a.y + EPS) push(a, b, "lane/lane");
    }
  const boxes = items.filter((i) => i.kind !== "lane");
  // sweep on x: only the pairs whose x ranges meet are compared
  const order = [...boxes].sort((a, b) => a.x - b.x);
  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    for (let j = i + 1; j < order.length; j++) {
      const b = order[j];
      if (b.x >= a.x + a.w - EPS) break;
      const [p, q] = a.kind <= b.kind ? [a, b] : [b, a];
      const kind = `${p.kind}/${q.kind}`;
      if (p.kind === "card" || q.kind === "card") {
        const c = p.kind === "card" ? p : q, o = c === p ? q : p;
        if (o.id === c.owner || (o.kind === "group" && !meetsHeader(o, c, scene))) continue;
        if (meets(c, o)) push(c, o, kind);
        continue;
      }
      if (p.kind === "group" && q.kind === "group") {
        if (ancOf(p.id).has(q.id)) { if (meets(p, q) && !inside(p, q)) push(p, q, "group/group:across"); continue; }
        if (ancOf(q.id).has(p.id)) { if (meets(q, p) && !inside(q, p)) push(q, p, "group/group:across"); continue; }
        if (meets(p, q)) push(p, q, kind);
        continue;
      }
      if (p.kind === "group" || q.kind === "group") {
        const g = p.kind === "group" ? p : q, n = g === p ? q : p;
        if (ancOf(n.id).has(g.id)) { if (meets(n, g) && !inside(n, g)) push(n, g, "group/node:across"); continue; }
        if (meets(n, g)) push(g, n, "group/node");
        continue;
      }
      if (meets(p, q)) push(p, q, kind);
    }
  }
  const byKind: Record<string, number> = {};
  for (const o of overlaps) byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
  return { items: items.length, overlaps, byKind };
}

/** a card against a group: only its header counts (a card inside an open
 *  group's body sits on the group's own ground) */
function meetsHeader(g: Rect & { id: string }, c: Rect, scene: Scene): boolean {
  const sg = scene.groupsById?.get(g.id);
  const head: Rect = { x: g.x, y: g.y, w: g.w, h: sg?.headerH ?? 20 };
  return meets(head, c);
}

/**
 * MICRO-LAB bande-2 · MAKE ROOM, first in a picture nobody arranges by hand
 * (the Matrix in horizons: read-only, laid out fresh). em-core reserves a type's box
 * for every node; what the view grows after it — an open paradata group set out
 * under its unit (views/matrix.ts, MICRO-AUTORI-LAYOUT p.2), its instances and
 * their cards — can then cover a neighbour. In the epochs «the hand or Layout
 * moves» what it covers; here there is no hand, so this pass does it, the same
 * way every time (deterministic: the scene's order, no measure of the screen):
 *
 *  · the BLOCKS are boxes with everything drawn in them (a group, its members);
 *  · taken from left to right, a block that meets one already set moves right,
 *    past it, with all it holds — y never changes (the bands, the arrows down);
 *  · the moves accumulate per block, so the order of the blocks in a row stays.
 *
 * MICRO-LAB bande-3 · …and in the EPOCHS too (E.D., 25 Oct 2026, on the lab.4:
 * «fare spazio vale anche nelle epoche», which updates the rule of 11 Oct: the
 * hand and Layout stay). There the hand arranges, so `fixed` names what it
 * placed (`layout.hand_placed`): a block holding a node the hand placed NEVER
 * moves by itself. It is set first, as an obstacle; the other blocks make room
 * around it as around any other (rightwards, past it). Two blocks the hand
 * placed one on the other stay so — the hand or Layout separate them.
 *
 * Returns how many blocks moved.
 */
export function makeRoom(scene: Scene, gap = 24, fixed?: (id: string) => boolean): number {
  const groups = scene.groupsById ?? new Map();
  const parentOf = (id: string): string | undefined =>
    scene.memberOf?.get(id) ?? scene.outlineOf?.get(id) ?? scene.arrangedIn?.get(id);
  const kids = new Map<string, string[]>();
  for (const n of scene.nodes) {
    const p = parentOf(n.id);
    if (p && p !== n.id) (kids.get(p) ?? kids.set(p, []).get(p)!).push(n.id);
  }
  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    let cur = id;
    for (let p = parentOf(cur); p && scene.byId.has(p) && !seen.has(p); p = parentOf(cur)) { seen.add(cur); cur = p; }
    return cur;
  };
  const shown = (id: string): boolean => { const s = scene.byId.get(id); return !!s && !s.collapsed; };
  // ONE tree: each node under one parent, in one block. Open paradata groups
  // nested in one another (a PD set out under a unit that is a member of
  // another open PD) can make the parent chain a cycle; a node reached twice
  // stays where it was first reached (MICRO-LAB bande-3: counted in two blocks
  // it moved twice — GT16, its 111 groups open, in the epochs)
  const taken = new Set<string>();
  const tree = new Map<string, string[]>();
  const grow = (root: string): void => {
    const todo = [root];
    taken.add(root);
    while (todo.length) {
      const id = todo.pop()!;
      const ch: string[] = [];
      for (const k of kids.get(id) ?? []) if (!taken.has(k)) { taken.add(k); ch.push(k); todo.push(k); }
      tree.set(id, ch);
    }
  };
  const roots: string[] = [];
  for (const n of scene.nodes) {
    // a group's box is its Group (its node may carry no size of its own)
    const box = groups.get(n.id) ?? n;
    if (n.collapsed || !(box.w > 0 && box.h > 0) || taken.has(n.id)) continue;
    let root = rootOf(n.id);
    if (taken.has(root)) root = n.id;
    grow(root);
    roots.push(root);
  }
  const under = (id: string, out: string[] = []): string[] => {
    out.push(id);
    for (const k of tree.get(id) ?? []) under(k, out);
    return out;
  };
  const cardOf = new Map(cardItems(scene).map((c) => [c.owner!, c]));
  type Block = { ids: string[]; x: number; y: number; r: number; b: number; fixed: boolean; key: string };
  const blockOf = (top: string): Block | null => {
    const ids = under(top).filter(shown);
    let x = Infinity, y = Infinity, r = -Infinity, b = -Infinity;
    for (const id of ids) {
      for (const s of [groups.get(id) ?? scene.byId.get(id)!, cardOf.get(id)]) {
        if (!s) continue;
        x = Math.min(x, s.x); y = Math.min(y, s.y); r = Math.max(r, s.x + s.w); b = Math.max(b, s.y + s.h);
      }
    }
    return Number.isFinite(x) ? { ids, x, y, r, b, fixed: !!fixed && ids.some(fixed), key: top } : null;
  };
  let moved = 0;
  /** blocks side by side: the hand's first, where the hand left them; then from
   *  left to right, each past whatever it meets, rightwards */
  const separate = (list: Block[]): void => {
    const order = [...list].sort((a, b) => a.x - b.x || a.y - b.y || (a.key < b.key ? -1 : 1));
    const placed = order.filter((bl) => bl.fixed).map((bl) => ({ x: bl.x, y: bl.y, r: bl.r, b: bl.b }));
    for (const bl of order) {
      if (bl.fixed) continue;
      let dx = 0;
      for (let guard = 0; guard <= order.length; guard++) {
        const hit = placed.find((p) => bl.x + dx < p.r - EPS && p.x < bl.r + dx - EPS
                                     && bl.y < p.b - EPS && p.y < bl.b - EPS);
        if (!hit) break;
        dx = hit.r + gap - bl.x;
      }
      if (dx > EPS) {
        moved++;
        for (const id of bl.ids) {
          const s = scene.byId.get(id);
          if (s) s.x += dx;
          const g = groups.get(id);
          if (g && g !== s) g.x += dx;
        }
      }
      placed.push({ x: bl.x + dx, y: bl.y, r: bl.r + dx, b: bl.b });
    }
  };
  // MICRO-LAB bande-3 · BY LEVEL, innermost first. In the epochs the open
  // paradata groups are set out INSIDE an activity (one block at the top): its
  // members make room among themselves, then the activity's box takes in what
  // moved (its right and bottom edges only grow: y never changes), then the
  // level above. lab.4 separated the outer blocks only.
  const PAD = 12; // views/matrix.ts GROUP_PAD
  const depthFirst = (id: string): void => {
    const ch = (tree.get(id) ?? []).filter(shown);
    for (const k of ch) depthFirst(k);
    if (ch.length > 1) separate(ch.map(blockOf).filter((b): b is Block => !!b));
    const g = groups.get(id);
    if (g && ch.length) {
      let r = -Infinity, b = -Infinity;
      for (const k of ch) for (const d of under(k)) {
        if (!shown(d)) continue;
        const s = groups.get(d) ?? scene.byId.get(d)!;
        r = Math.max(r, s.x + s.w); b = Math.max(b, s.y + s.h);
      }
      const sn = scene.byId.get(id);
      if (r + PAD > g.x + g.w + EPS) { g.w = r + PAD - g.x; if (sn && sn !== g) sn.w = g.w; }
      if (b + PAD > g.y + g.h + EPS) { g.h = b + PAD - g.y; if (sn && sn !== g) sn.h = g.h; }
    }
  };
  for (const r of roots) depthFirst(r);
  separate(roots.map(blockOf).filter((b): b is Block => !!b));
  return moved;
}

/**
 * MICRO-LAB bande-2 · THE CARDS «from …» GROUPED. The instances a group draws
 * under one unit stack in a column (views/matrix.ts); each carried its card,
 * wider than the box, over the next column's (E.D.'s screenshot: «from Outside
 * the visible horizons» on «from Early Medieval Transition»). A run of
 * instances in one column that come from the SAME place shows one card, on the
 * first, with «+n» for the others; the renderer clips a card to its box.
 * Pure: the renderer and the checks read the same answer.
 */
export function cardRuns(scene: Scene): Map<string, { show: boolean; more: number }> {
  const cols = new Map<string, { id: string; y: number; owner: string }[]>();
  for (const n of scene.nodes) {
    const b = n.instanceBadge;
    if (!b?.ownerName) continue;
    const k = `${b.group}|${Math.round(n.x + n.w / 2)}`;
    (cols.get(k) ?? cols.set(k, []).get(k)!).push({ id: n.id, y: n.y, owner: b.ownerName });
  }
  const out = new Map<string, { show: boolean; more: number }>();
  for (const col of cols.values()) {
    col.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
    for (let i = 0; i < col.length;) {
      let j = i + 1;
      while (j < col.length && col[j].owner === col[i].owner) j++;
      out.set(col[i].id, { show: true, more: j - i - 1 });
      for (let k = i + 1; k < j; k++) out.set(col[k].id, { show: false, more: 0 });
      i = j;
    }
  }
  return out;
}

/** The cards as the renderer draws them at scale 1, in world coordinates
 *  (`BADGE_PX` 16: a card 12.8 high, 0.6 of it above the box, clipped to the
 *  box's right edge) — for the checks, independent of the camera. */
export function cardItems(scene: Scene, badgePx = 16): OverlapItem[] {
  const runs = cardRuns(scene);
  const h = Math.max(badgePx * 0.8, Math.max(7, Math.round(badgePx * 0.5)) * 1.5);
  const out: OverlapItem[] = [];
  for (const n of scene.nodes) {
    if (!n.instanceBadge?.ownerName || n.collapsed || runs.get(n.id)?.show === false) continue;
    const x = n.x - badgePx * 0.25;
    out.push({ kind: "card", id: `card:${n.id}`, owner: n.id, x, y: n.y - h * 0.6,
               w: Math.max(n.w + badgePx * 0.25, badgePx * 4), h });
  }
  return out;
}
