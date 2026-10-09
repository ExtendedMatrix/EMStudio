// A synthetic stratigraphic graph for the performance and layout checks: N units
// in E epochs, M stratigraphic edges, deterministic (same seed → same bytes).
//
//   node scripts/make-synthetic-graph.mjs [nodes=5000] [edges=8000] [out.em.json]
//
// The shape is the one an excavation has, scaled up: every unit has its epoch
// (`has_first_epoch`, not counted in M: in the Matrix it is the lane, not a
// line), the units of an epoch form a deep sequence of `is_after` (the newer
// unit is the source), a few `has_same_time` pairs sit side by side, and one
// edge in twenty crosses into the next older epoch. No cycle: the order is a
// rank drawn per unit, and every `is_after` goes from a lower rank to a higher
// one. The mix of types is that of Templu Mare: mostly US, then SF, USVs, USVn.
//
// `export function synthetic(n, m, seed)` is what the in-browser checks import.
import { writeFileSync } from "node:fs";

export function synthetic(n = 5000, m = 8000, seed = 20261009) {
  let s = seed >>> 0;
  const rnd = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const E = Math.max(1, Math.round(n / 1000) + 3);
  const nodes = [];
  const edges = [];
  const epochs = [];
  for (let i = 0; i < E; i++) {
    const id = `epoch_${i}`;
    // epoch 0 is the newest
    epochs.push(id);
    nodes.push({ id, node_type: "EpochNode", name: `Epoch ${E - i}`,
      data: { start_time: 2000 - (i + 1) * 300, end_time: 2000 - i * 300 } });
  }
  const types = [["US", 0.7], ["SF", 0.12], ["USVs", 0.1], ["USVn", 0.08]];
  const typeOf = () => {
    let r = rnd();
    for (const [t, p] of types) { if ((r -= p) < 0) return t; }
    return "US";
  };
  const units = [];
  for (let i = 0; i < n; i++) {
    const ep = Math.min(E - 1, Math.floor((i / n) * E));
    const id = `u${String(i).padStart(5, "0")}`;
    const t = typeOf();
    units.push({ id, ep, rank: i });
    nodes.push({ id, node_type: t, name: `${t}${i}`, data: {} });
    edges.push({ id: `fe_${i}`, edge_type: "has_first_epoch", source: id, target: epochs[ep] });
  }
  const byEpoch = epochs.map((_, k) => units.filter((u) => u.ep === k));
  const seen = new Set();
  let k = 0;
  let guard = 0;
  while (k < m && guard++ < m * 20) {
    const ep = Math.floor(rnd() * E);
    const pool = byEpoch[ep];
    if (pool.length < 2) continue;
    const a = pool[Math.floor(rnd() * pool.length)];
    let b;
    const r = rnd();
    let type = "is_after";
    if (r < 0.05 && ep + 1 < E) {
      // into the next older epoch
      const older = byEpoch[ep + 1];
      b = older[Math.floor(rnd() * older.length)];
    } else {
      // a near successor: a sequence, not a random graph
      const j = pool.indexOf(a) + 1 + Math.floor(rnd() * rnd() * 40);
      if (j >= pool.length) continue;
      b = pool[j];
      if (r > 0.97) type = "has_same_time";
    }
    if (a.id === b.id) continue;
    const key = `${a.id}>${b.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: `e_${k}`, edge_type: type, source: a.id, target: b.id });
    k++;
  }
  return {
    header: { name: `synthetic-${n}-${m}` },
    graph: { graph_id: `synthetic-${n}-${m}`, name: `synthetic ${n}/${m}`, nodes, edges },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] ?? 5000);
  const m = Number(process.argv[3] ?? 8000);
  const out = process.argv[4] ?? `synthetic-${n}.em.json`;
  const doc = synthetic(n, m);
  writeFileSync(out, JSON.stringify(doc));
  const strat = doc.graph.edges.filter((e) => e.edge_type !== "has_first_epoch").length;
  console.log(`${out}: ${doc.graph.nodes.length} nodes, ${strat} stratigraphic edges (+${doc.graph.edges.length - strat} has_first_epoch)`);
}
