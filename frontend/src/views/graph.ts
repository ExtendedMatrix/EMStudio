// Graph view: the full property graph (epochs as nodes, paradata chains,
// authors, resources). A projection for inspection, not the archival layout
// (which belongs to em-core and the .em.json layout section). Three client-side
// algorithms — a deterministic layered (Sugiyama-ish) default, a radial burst
// for knowledge-graph exploration, and a force-directed "explode" that spaces a
// dense graph out with no overlaps. Manual drags are applied as overrides on
// top (see main.ts graphOverrides / liquid drag).
import type { FoldedView } from "../folding";
import type { Scene, SceneNode } from "../scene";
import type { EmDocument, EmEdge, EmNode } from "../types";
import { isRemoved } from "../crdt";

const NODE_W = 120;
const NODE_H = 34;
const H_GAP = 26;
const V_GAP = 70;
const SUB_V_GAP = 18;
const SWEEPS = 4;
/** wrap wide layers into sub-rows: top-down aspect, like yEd hierarchic */
const MAX_COLS = 12;

export type GraphAlgorithm = "layered" | "radial" | "force";

/** G3 · the CENTRES of a static layout (layered, radial) — what the liquid
 *  Graph seeds its discs with, or places them at when the algorithm is not the
 *  live simulation. Cached on the structure like the boxes. */
export function graphCentres(nodes: EmNode[], edges: EmEdge[], algo: "layered" | "radial"): Map<string, Pos> {
  const base = basePositions(byId(nodes), edges, algo);
  const out = new Map<string, Pos>();
  for (const [id, p] of base) out.set(id, { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 });
  return out;
}

type Pos = { x: number; y: number };

function byId(inputNodes: EmNode[]): EmNode[] {
  return [...inputNodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** undirected adjacency (deduped, self-loops dropped) */
function adjacency(ids: string[], edges: EmEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const id of ids) adj.set(id, new Set());
  for (const e of edges) {
    if (e.source === e.target) continue;
    const a = adj.get(e.source);
    const b = adj.get(e.target);
    if (a && b) {
      a.add(e.target);
      b.add(e.source);
    }
  }
  return adj;
}

/** Assemble a Scene from a positions map (nodes at NODE_W×NODE_H, unless a
 *  per-type size is supplied by `sizeOf`). BUGFIX-GLYPH: the node's box comes
 *  from em-core (the size owner, via `doc.layout.positions[id].w/h`), so a glyph
 *  / shape is square here too — Graph no longer forces a wide 120×34 box that
 *  left the connect handle floating far from the glyph. The graph LAYOUT still
 *  spaces on NODE_W (a wider gap never overlaps), only the DRAWN box shrinks. */
function assemble(
  nodes: EmNode[],
  pos: Map<string, Pos>,
  inputEdges: EmEdge[],
  badges?: Map<string, number>,
  sizeOf?: (id: string) => { w: number; h: number } | undefined,
): Scene {
  const scene: Scene = { nodes: [], byId: new Map(), edges: [], lanes: [] };
  for (const n of nodes) {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    const sz = sizeOf?.(n.id);
    const sn: SceneNode = {
      id: n.id,
      x: p.x,
      y: p.y,
      w: sz?.w ?? NODE_W,
      h: sz?.h ?? NODE_H,
      node: n,
      badge: badges?.get(n.id),
      // FONTE · a trace the view kept (a live chain still reads it)
      ...(isRemoved(n as unknown as Record<string, unknown>) ? { trace: true } : {}),
    };
    scene.nodes.push(sn);
    scene.byId.set(sn.id, sn);
  }
  for (const e of inputEdges)
    if (scene.byId.has(e.source) && scene.byId.has(e.target))
      scene.edges.push({ source: e.source, target: e.target, edge: e });
  return scene;
}

// ---------------------------------------------------------------- layered
export function layoutLayered(
  inputNodes: EmNode[],
  inputEdges: EmEdge[],
  badges?: Map<string, number>,
): Scene {
  const nodes = byId(inputNodes);
  const ids = nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  const out: number[][] = Array.from({ length: n }, () => []);
  const inn: number[][] = Array.from({ length: n }, () => []);
  const seen = new Set<string>();
  for (const e of inputEdges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a + ":" + b;
    if (seen.has(key)) continue;
    seen.add(key);
    out[a].push(b);
    inn[b].push(a);
  }

  const color = new Uint8Array(n);
  const dagOut: number[][] = Array.from({ length: n }, () => []);
  const dfs = (u: number): void => {
    color[u] = 1;
    for (const v of out[u]) {
      if (color[v] === 1) continue;
      dagOut[u].push(v);
      if (color[v] === 0) dfs(v);
    }
    color[u] = 2;
  };
  for (let i = 0; i < n; i++) if (color[i] === 0) dfs(i);

  const indeg = new Uint32Array(n);
  for (let u = 0; u < n; u++) for (const v of dagOut[u]) indeg[v]++;
  const layer = new Int32Array(n);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
    for (const v of dagOut[u]) {
      layer[v] = Math.max(layer[v], layer[u] + 1);
      if (--indeg[v] === 0) queue.push(v);
    }
  }

  const maxLayer = n ? Math.max(...layer) : 0;
  const rows: number[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (let i = 0; i < n; i++) rows[layer[i]].push(i);

  const posArr = new Float64Array(n);
  const reindex = (): void =>
    rows.forEach((row) => row.forEach((node, i) => (posArr[node] = i)));
  reindex();
  const bary = (row: number[], neigh: number[][]): void => {
    const score = row.map((v) => {
      const ns = neigh[v];
      if (!ns.length) return posArr[v];
      return ns.reduce((s, w) => s + posArr[w], 0) / ns.length;
    });
    const order = row
      .map((_, i) => i)
      .sort(
        (a, b) => score[a] - score[b] || (ids[row[a]] < ids[row[b]] ? -1 : 1),
      );
    const next = order.map((i) => row[i]);
    row.length = 0;
    row.push(...next);
  };
  for (let s = 0; s < SWEEPS; s++) {
    for (let r = 1; r < rows.length; r++) bary(rows[r], inn);
    reindex();
    for (let r = rows.length - 2; r >= 0; r--) bary(rows[r], out);
    reindex();
  }

  const pos = new Map<string, Pos>();
  let y = 0;
  rows.forEach((row) => {
    const subRows: number[][] = [];
    for (let i = 0; i < row.length; i += MAX_COLS)
      subRows.push(row.slice(i, i + MAX_COLS));
    subRows.forEach((sub, si) => {
      const rowW = sub.length * (NODE_W + H_GAP) - H_GAP;
      sub.forEach((v, i) => {
        pos.set(ids[v], { x: i * (NODE_W + H_GAP) - rowW / 2, y });
      });
      y += NODE_H + (si < subRows.length - 1 ? SUB_V_GAP : 0);
    });
    y += V_GAP;
  });
  return assemble(nodes, pos, inputEdges, badges);
}

// ---------------------------------------------------------------- radial
// BFS rings around the highest-degree hub — the classic knowledge-graph burst.
export function layoutRadial(
  inputNodes: EmNode[],
  inputEdges: EmEdge[],
  badges?: Map<string, number>,
): Scene {
  const nodes = byId(inputNodes);
  const ids = nodes.map((n) => n.id);
  if (ids.length <= 1) {
    const pos = new Map<string, Pos>(ids.map((id) => [id, { x: 0, y: 0 }]));
    return assemble(nodes, pos, inputEdges, badges);
  }
  const adj = adjacency(ids, inputEdges);
  let root = ids[0];
  let best = -1;
  for (const id of ids) {
    const d = adj.get(id)!.size;
    if (d > best) {
      best = d;
      root = id;
    }
  }
  const level = new Map<string, number>([[root, 0]]);
  const parent = new Map<string, string>();
  const q = [root];
  while (q.length) {
    const u = q.shift()!;
    for (const v of [...adj.get(u)!].sort()) {
      if (!level.has(v)) {
        level.set(v, level.get(u)! + 1);
        parent.set(v, u);
        q.push(v);
      }
    }
  }
  let maxLvl = 0;
  for (const l of level.values()) maxLvl = Math.max(maxLvl, l);
  for (const id of ids) if (!level.has(id)) level.set(id, maxLvl + 1); // disconnected → outer ring
  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const l = level.get(id)!;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(id);
  }
  const RING = 170;
  const pos = new Map<string, Pos>([[root, { x: 0, y: 0 }]]);
  const angleOf = (id: string): number => {
    const p = pos.get(id);
    return p ? Math.atan2(p.y, p.x) : 0;
  };
  for (const l of [...byLevel.keys()].sort((a, b) => a - b)) {
    if (l === 0) continue;
    const arr = byLevel.get(l)!;
    // keep children near their parent by ordering on the parent's angle
    arr.sort((a, b) => {
      const pa = parent.get(a);
      const pb = parent.get(b);
      const aa = pa ? angleOf(pa) : 0;
      const ab = pb ? angleOf(pb) : 0;
      return aa - ab || (a < b ? -1 : 1);
    });
    // grow the ring when it is crowded so nodes never overlap on it
    const R = Math.max(l * RING, (arr.length * 62) / (2 * Math.PI));
    arr.forEach((id, i) => {
      const a = (2 * Math.PI * i) / arr.length;
      pos.set(id, { x: R * Math.cos(a), y: R * Math.sin(a) });
    });
  }
  return assemble(nodes, pos, inputEdges, badges);
}

// ---------------------------------------------------------------- force
// Deterministic Fruchterman–Reingold seeded from the layered layout — spreads a
// dense graph out ("explode") with edge springs + all-pairs repulsion.
export function layoutForce(
  inputNodes: EmNode[],
  inputEdges: EmEdge[],
  badges?: Map<string, number>,
): Scene {
  const base = layoutLayered(inputNodes, inputEdges); // for stable ids + edges
  const ids = base.nodes.map((sn) => sn.id);
  const n = ids.length;
  if (n <= 1) return layoutLayered(inputNodes, inputEdges, badges);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  // deterministic sunflower (phyllotaxis) disc seed — a uniform spread that FR
  // expands cleanly, unlike the tall/narrow layered seed which collapses.
  const GOLDEN = 2.399963229728653;
  const SEED_R = 70;
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN;
    const rr = SEED_R * Math.sqrt(i);
    px[i] = rr * Math.cos(a);
    py[i] = rr * Math.sin(a);
  }
  const E: [number, number][] = [];
  const deg = new Uint32Array(n);
  for (const e of base.edges) {
    const a = idx.get(e.source)!;
    const b = idx.get(e.target)!;
    if (a !== b) {
      E.push([a, b]);
      deg[a]++;
      deg[b]++;
    }
  }
  const k = 175; // ideal edge length (> node width → no overlap)
  const GRAVITY = 0.03; // gentle pull toward centroid
  const CUTOFF2 = (6 * k) * (6 * k); // repulsion range: beyond it, gravity wins
  //  — bounds disconnected nodes (whose only escape is cumulative repulsion)
  //    near the cluster instead of flinging them to infinity.
  const ITER = 350;
  let temp = 350;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let it = 0; it < ITER; it++) {
    dx.fill(0);
    dy.fill(0);
    // centroid for the gravity term
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      cx += px[i];
      cy += py[i];
    }
    cx /= n;
    cy /= n;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ex = px[i] - px[j];
        let ey = py[i] - py[j];
        let d2 = ex * ex + ey * ey;
        if (d2 > CUTOFF2) continue; // out of range → no repulsion
        if (d2 < 0.01) {
          d2 = 0.01;
          ex = (i - j) * 0.01; // deterministic nudge for coincident nodes
          ey = 0.01;
        }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        dx[i] += (ex / d) * f;
        dy[i] += (ey / d) * f;
        dx[j] -= (ex / d) * f;
        dy[j] -= (ey / d) * f;
      }
    }
    for (const [a, b] of E) {
      const ex = px[a] - px[b];
      const ey = py[a] - py[b];
      const d = Math.sqrt(ex * ex + ey * ey) || 0.01;
      const f = (d * d) / k;
      dx[a] -= (ex / d) * f;
      dy[a] -= (ey / d) * f;
      dx[b] += (ex / d) * f;
      dy[b] += (ey / d) * f;
    }
    // gravity toward the centroid (linear spring)
    for (let i = 0; i < n; i++) {
      dx[i] += (cx - px[i]) * GRAVITY;
      dy[i] += (cy - py[i]) * GRAVITY;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01;
      const m = Math.min(d, temp);
      px[i] += (dx[i] / d) * m;
      py[i] += (dy[i] / d) * m;
    }
    temp *= 0.98;
  }
  // degree-0 nodes have no edge to hold them (only repulsion) — the sim can't
  // place them, so tidy them into a column just right of the connected cluster.
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  for (let i = 0; i < n; i++) {
    if (deg[i] === 0) continue;
    minx = Math.min(minx, px[i]);
    miny = Math.min(miny, py[i]);
    maxx = Math.max(maxx, px[i]);
    maxy = Math.max(maxy, py[i]);
  }
  if (Number.isFinite(minx)) {
    let gx = maxx + NODE_W + 40;
    let gy = miny;
    for (let i = 0; i < n; i++) {
      if (deg[i] !== 0) continue;
      px[i] = gx;
      py[i] = gy;
      gy += NODE_H + 24;
      if (gy > maxy) {
        gy = miny;
        gx += NODE_W + 40;
      }
    }
  }
  const pos = new Map<string, Pos>();
  ids.forEach((id, i) => pos.set(id, { x: px[i], y: py[i] }));
  return assemble(
    base.nodes.map((sn) => sn.node),
    pos,
    inputEdges,
    badges,
  );
}

// ---- base-layout cache: recompute only on algorithm / graph-structure change
// so a manual drag (overrides) rebuilds in O(n) instead of re-running force. ---
let cacheKey = "";
let cachePos = new Map<string, Pos>();
function basePositions(
  nodes: EmNode[],
  edges: EmEdge[],
  algo: GraphAlgorithm,
): Map<string, Pos> {
  const key = `${algo}:${nodes.length}:${edges.length}:${nodes.map((n) => n.id).join(",")}`;
  if (key === cacheKey) return cachePos;
  const s =
    algo === "radial"
      ? layoutRadial(nodes, edges)
      : algo === "force"
        ? layoutForce(nodes, edges)
        : layoutLayered(nodes, edges);
  cachePos = new Map(s.nodes.map((sn) => [sn.id, { x: sn.x, y: sn.y }]));
  cacheKey = key;
  return cachePos;
}

export function buildGraphScene(
  doc: EmDocument,
  view?: FoldedView,
  opts?: {
    algorithm?: GraphAlgorithm;
    overrides?: Map<string, Pos>;
  },
): Scene {
  const nodes = byId(view?.nodes ?? doc.graph.nodes);
  const edges = view?.edges ?? doc.graph.edges;
  const algo = opts?.algorithm ?? "layered";
  const base = basePositions(nodes, edges, algo);
  const pos = new Map(base);
  const ov = opts?.overrides;
  if (ov) for (const [id, p] of ov) if (pos.has(id)) pos.set(id, p);
  // BUGFIX-GLYPH · read each node's box from em-core's stored size
  // (doc.layout.positions[id].w/h) so glyphs/shapes are square in Graph too,
  // falling back to NODE_W/NODE_H for a node em-core never sized.
  const positions = doc.layout?.positions;
  const sizeOf = (id: string): { w: number; h: number } | undefined => {
    const r = positions?.[id];
    return r && typeof r.w === "number" && typeof r.h === "number"
      ? { w: r.w, h: r.h }
      : undefined;
  };
  const scene = assemble(nodes, pos, edges, view?.badges, sizeOf);
  // BADGE1 · attach the collapsed ornament badges to their referent SceneNode
  // (the ornament nodes themselves are already stripped from view.nodes upstream)
  if (view?.adornments)
    for (const sn of scene.nodes)
      sn.adornments = view.adornments.get(sn.id);
  return scene;
}
