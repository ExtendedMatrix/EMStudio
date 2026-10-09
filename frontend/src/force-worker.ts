/**
 * G2 · the Graph's force simulation, in a Web Worker (MICRO grafo reattivo).
 *
 * The main thread draws; this thread moves the nodes. Forces (the d3-force
 * family, written here — one file, no dependency):
 *
 *  · many-body repulsion, Barnes–Hut on a quadtree (θ = 0.9): O(n log n) a tick;
 *  · springs along the edges (rest length from the two radii);
 *  · a weak pull of every member toward the centre of each of its clusters (the
 *    epochs and the groups, drawn as halos and not as nodes, G3);
 *  · a weak pull to the origin, so disconnected pieces do not drift apart;
 *  · collision: two discs never overlap.
 *
 * It cools like d3 (`alpha` decays toward 0) and STOPS by itself when settled
 * (`alpha < alphaMin`): the main thread is told `settled`, and nothing runs
 * until a drag or a reheat. Positions go back as one Float64Array every few
 * ticks (transferable), at most ~60 a second.
 *
 * Messages in: `init` {nodes, links, clusters, seed positions}, `drag` {i, x, y}
 * (pins node i), `release` {i}, `reheat` {alpha}, `stop`.
 * Messages out: `pos` {xy, alpha}, `settled`.
 */

interface InitMsg {
  type: "init";
  /** x, y, r per node, flat */
  nodes: Float64Array;
  /** source, target index per link, flat */
  links: Int32Array;
  /** member indices per cluster */
  clusters: number[][];
  alpha?: number;
}
type InMsg =
  | InitMsg
  | { type: "drag"; i: number; x: number; y: number }
  | { type: "release"; i: number }
  | { type: "reheat"; alpha: number }
  | { type: "stop" };

let n = 0;
let x = new Float64Array(0);
let y = new Float64Array(0);
let vx = new Float64Array(0);
let vy = new Float64Array(0);
let r = new Float64Array(0);
let fixed = new Uint8Array(0);
let links: Int32Array<ArrayBufferLike> = new Int32Array(0);
let linkStrength = new Float64Array(0);
let degree = new Float64Array(0);
let clusters: number[][] = [];
let alpha = 1;
const alphaMin = 0.004;
const alphaDecay = 1 - Math.pow(alphaMin, 1 / 300);
const velocityDecay = 0.4;
let running = false;
let lastPost = 0;

const post = (msg: unknown, transfer?: Transferable[]): void =>
  (self as unknown as Worker).postMessage(msg, transfer ?? []);

function sendPositions(force = false): void {
  const now = performance.now();
  if (!force && now - lastPost < 16) return;
  lastPost = now;
  const xy = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    xy[2 * i] = x[i];
    xy[2 * i + 1] = y[i];
  }
  post({ type: "pos", xy, alpha }, [xy.buffer]);
}

// ── Barnes–Hut quadtree ───────────────────────────────────────────────────
// a flat pool of cells: children (4), mass, centre of mass, the leaf's body
let qx0 = 0, qy0 = 0, qsize = 1;
let cellChild = new Int32Array(0);
let cellMass = new Float64Array(0);
let cellCx = new Float64Array(0);
let cellCy = new Float64Array(0);
let cellBody = new Int32Array(0);
let cellCount = 0;

function newCell(): number {
  const c = cellCount++;
  if (c >= cellMass.length) {
    const cap = Math.max(64, cellMass.length * 2);
    const grow = <T extends Int32Array | Float64Array>(a: T, k: number): T => {
      const b = new (a.constructor as { new (n: number): T })(cap * k);
      b.set(a);
      return b;
    };
    cellChild = grow(cellChild, 4);
    cellMass = grow(cellMass, 1);
    cellCx = grow(cellCx, 1);
    cellCy = grow(cellCy, 1);
    cellBody = grow(cellBody, 1);
  }
  cellChild.fill(-1, c * 4, c * 4 + 4);
  cellMass[c] = 0;
  cellCx[c] = 0;
  cellCy[c] = 0;
  cellBody[c] = -1;
  return c;
}

function buildTree(): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < x0) x0 = x[i];
    if (x[i] > x1) x1 = x[i];
    if (y[i] < y0) y0 = y[i];
    if (y[i] > y1) y1 = y[i];
  }
  qsize = Math.max(x1 - x0, y1 - y0, 1) * 1.001 + 1;
  qx0 = x0;
  qy0 = y0;
  cellCount = 0;
  const root = newCell();
  for (let i = 0; i < n; i++) insert(root, i, qx0, qy0, qsize, 0);
  accumulate(root);
}

function insert(c: number, i: number, cx: number, cy: number, size: number, depth: number): void {
  const isLeaf = cellChild[c * 4] === -1 && cellChild[c * 4 + 1] === -1 && cellChild[c * 4 + 2] === -1 && cellChild[c * 4 + 3] === -1;
  if (isLeaf && cellBody[c] === -1) {
    cellBody[c] = i;
    return;
  }
  // two bodies at the same point, past any useful depth: this one is not a
  // source of repulsion (it still feels the others')
  if (depth > 40) return;
  const half = size / 2;
  const place = (j: number): void => {
    const qx = x[j] >= cx + half ? 1 : 0;
    const qy = y[j] >= cy + half ? 1 : 0;
    const k = c * 4 + qy * 2 + qx;
    if (cellChild[k] === -1) cellChild[k] = newCell();
    insert(cellChild[k], j, cx + qx * half, cy + qy * half, half, depth + 1);
  };
  if (isLeaf) {
    const b = cellBody[c];
    cellBody[c] = -1;
    place(b);
  }
  place(i);
}

/** Masses and centres of mass, bottom-up (a body's mass grows with its disc). */
function accumulate(c: number): void {
  const b = cellBody[c];
  if (b !== -1) {
    cellMass[c] = 1 + r[b] / 10;
    cellCx[c] = x[b];
    cellCy[c] = y[b];
    return;
  }
  let m = 0, sx = 0, sy = 0;
  for (let k = 0; k < 4; k++) {
    const ch = cellChild[c * 4 + k];
    if (ch === -1) continue;
    accumulate(ch);
    m += cellMass[ch];
    sx += cellCx[ch] * cellMass[ch];
    sy += cellCy[ch] * cellMass[ch];
  }
  cellMass[c] = m;
  cellCx[c] = m ? sx / m : 0;
  cellCy[c] = m ? sy / m : 0;
}

const THETA2 = 0.81;
const CHARGE = -38;

function repel(i: number, c: number, size: number, a: number): void {
  if (cellMass[c] === 0) return;
  const dx = cellCx[c] - x[i];
  const dy = cellCy[c] - y[i];
  let d2 = dx * dx + dy * dy;
  const leaf = cellBody[c] !== -1;
  if (leaf && cellBody[c] === i) return;
  if (leaf || (size * size) / Math.max(d2, 1e-9) < THETA2) {
    if (d2 < 1) d2 = 1;
    const f = (CHARGE * cellMass[c] * a) / d2;
    vx[i] += dx * f;
    vy[i] += dy * f;
    return;
  }
  const half = size / 2;
  for (let k = 0; k < 4; k++) {
    const ch = cellChild[c * 4 + k];
    if (ch !== -1) repel(i, ch, half, a);
  }
}

function tick(): void {
  alpha += (0 - alpha) * alphaDecay;
  // many-body
  buildTree();
  for (let i = 0; i < n; i++) repel(i, 0, qsize, alpha);
  // springs
  for (let k = 0; k < links.length; k += 2) {
    const s = links[k], t = links[k + 1];
    let dx = x[t] + vx[t] - x[s] - vx[s];
    let dy = y[t] + vy[t] - y[s] - vy[s];
    let l = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const rest = r[s] + r[t] + 16;
    const st = linkStrength[k >> 1];
    l = ((l - rest) / l) * alpha * st;
    dx *= l;
    dy *= l;
    const bias = degree[s] / (degree[s] + degree[t]);
    vx[t] -= dx * bias;
    vy[t] -= dy * bias;
    vx[s] += dx * (1 - bias);
    vy[s] += dy * (1 - bias);
  }
  // clusters: a weak pull to each cluster's centre
  for (const members of clusters) {
    if (members.length < 2) continue;
    let cx = 0, cy = 0;
    for (const i of members) {
      cx += x[i];
      cy += y[i];
    }
    cx /= members.length;
    cy /= members.length;
    const k = 0.06 * alpha;
    for (const i of members) {
      vx[i] += (cx - x[i]) * k;
      vy[i] += (cy - y[i]) * k;
    }
  }
  // gravity to the origin
  const g = 0.02 * alpha;
  for (let i = 0; i < n; i++) {
    vx[i] -= x[i] * g;
    vy[i] -= y[i] * g;
  }
  // integrate
  for (let i = 0; i < n; i++) {
    if (fixed[i]) {
      vx[i] = 0;
      vy[i] = 0;
      continue;
    }
    vx[i] *= 1 - velocityDecay;
    vy[i] *= 1 - velocityDecay;
    x[i] += vx[i];
    y[i] += vy[i];
  }
  collide();
}

/** Discs never overlap: a grid of cells the size of the largest disc. */
function collide(): void {
  let rmax = 1;
  for (let i = 0; i < n; i++) if (r[i] > rmax) rmax = r[i];
  const cell = rmax * 2 + 4;
  const grid = new Map<number, number[]>();
  const key = (gx: number, gy: number): number => gx * 73856093 ^ gy * 19349663;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(x[i] / cell), Math.floor(y[i] / cell));
    const b = grid.get(k);
    if (b) b.push(i);
    else grid.set(k, [i]);
  }
  for (let i = 0; i < n; i++) {
    const gx = Math.floor(x[i] / cell), gy = Math.floor(y[i] / cell);
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const b = grid.get(key(gx + ox, gy + oy));
        if (!b) continue;
        for (const j of b) {
          if (j <= i) continue;
          const dx = x[j] - x[i], dy = y[j] - y[i];
          const min = r[i] + r[j] + 3;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 1e-3;
          const push = ((min - d) / d) * 0.5;
          const px = (d2 ? dx : (i % 2 ? 1 : -1)) * push, py = (d2 ? dy : 1) * push;
          if (!fixed[i]) { x[i] -= px; y[i] -= py; }
          if (!fixed[j]) { x[j] += px; y[j] += py; }
        }
      }
  }
}

function loop(): void {
  if (!running) return;
  const t0 = performance.now();
  // as many ticks as fit in ~12 ms, then yield (messages get through)
  do {
    tick();
  } while (performance.now() - t0 < 12 && alpha >= alphaMin);
  sendPositions();
  if (alpha < alphaMin) {
    running = false;
    sendPositions(true);
    post({ type: "settled" });
    return;
  }
  setTimeout(loop, 0);
}

function start(): void {
  if (running) return;
  running = true;
  setTimeout(loop, 0);
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const m = ev.data;
  if (m.type === "init") {
    n = m.nodes.length / 3;
    x = new Float64Array(n);
    y = new Float64Array(n);
    r = new Float64Array(n);
    vx = new Float64Array(n);
    vy = new Float64Array(n);
    fixed = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = m.nodes[3 * i];
      y[i] = m.nodes[3 * i + 1];
      r[i] = m.nodes[3 * i + 2];
    }
    links = m.links;
    degree = new Float64Array(n);
    for (let k = 0; k < links.length; k += 2) {
      degree[links[k]]++;
      degree[links[k + 1]]++;
    }
    linkStrength = new Float64Array(links.length / 2);
    for (let k = 0; k < links.length; k += 2)
      linkStrength[k >> 1] = 1 / Math.max(1, Math.min(degree[links[k]], degree[links[k + 1]]));
    clusters = m.clusters;
    alpha = m.alpha ?? 1;
    start();
  } else if (m.type === "drag") {
    if (m.i < 0 || m.i >= n) return;
    fixed[m.i] = 1;
    x[m.i] = m.x;
    y[m.i] = m.y;
    if (alpha < 0.3) alpha = 0.3;
    start();
  } else if (m.type === "release") {
    if (m.i >= 0 && m.i < n) fixed[m.i] = 0;
  } else if (m.type === "reheat") {
    alpha = Math.max(alpha, m.alpha);
    start();
  } else if (m.type === "stop") {
    running = false;
  }
};
