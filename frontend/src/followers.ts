/**
 * MICRO-MATRIX-FASI p.2 (E.D., 6 Nov 2026) · «the property follows its node».
 *
 * A property, an extractor, a combiner has no epoch of its own: it is drawn
 * where its node is. Measured on TempluMare_v6 (dev.104): D.40 moved to the
 * phase «Fine XX» and its `absolute_time_start` (2003) stayed in «2015», the red
 * edge crossing the bands. So whoever moves a node into another epoch or phase
 * moves with it what depends ONLY on it:
 *
 *  · a property it holds (`has_property`) that no other node holds;
 *  · an extractor read only from it (`extracted_from` → it, and nothing else);
 *  · a combiner whose every input (`combines`) is one of those extractors.
 *
 * A node with an epoch of its own (`has_first_epoch`, `survive_in_epoch`) never
 * follows: it has its place. A property held by more than one node stays where
 * it is, and is returned as `shared`, so the caller can say so.
 *
 * Pure: edges in, ids out. No layout, no store.
 */
export interface FollowEdge {
  source: string;
  target: string;
  edge_type?: string;
}

export interface Followers {
  /** what moves with the node */
  follow: string[];
  /** properties of the node that other nodes hold too: they stay */
  shared: string[];
}

const OWN_EPOCH = new Set(["has_first_epoch", "survive_in_epoch"]);

interface Index {
  dated: Set<string>;
  holders: Map<string, Set<string>>;
  readFrom: Map<string, Set<string>>;
  inputs: Map<string, Set<string>>;
}

function index(edges: readonly FollowEdge[]): Index {
  const ix: Index = { dated: new Set(), holders: new Map(), readFrom: new Map(), inputs: new Map() };
  const add = (m: Map<string, Set<string>>, k: string, v: string): void => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(v);
  };
  for (const e of edges) {
    const t = e.edge_type ?? "";
    if (OWN_EPOCH.has(t)) ix.dated.add(e.source);
    else if (t === "has_property") add(ix.holders, e.target, e.source);
    else if (t === "extracted_from") add(ix.readFrom, e.source, e.target);
    else if (t === "combines") add(ix.inputs, e.source, e.target);
  }
  return ix;
}

/** follower → its owner, for every follower of the graph, and the shared
 *  properties → their holders. One pass over the edges. */
function resolve(ix: Index): { owner: Map<string, string>; shared: Map<string, string[]> } {
  const owner = new Map<string, string>();
  const shared = new Map<string, string[]>();
  for (const [p, hs] of ix.holders) {
    if (ix.dated.has(p)) continue;
    if (hs.size > 1) shared.set(p, [...hs]);
    else { const [o] = hs; if (o !== p) owner.set(p, o); }
  }
  const extractorOf = new Map<string, string>();
  for (const [x, from] of ix.readFrom) {
    if (ix.dated.has(x) || owner.has(x) || from.size !== 1) continue;
    const [o] = from;
    if (o === x) continue;
    owner.set(x, o);
    extractorOf.set(x, o);
  }
  for (const [c, ins] of ix.inputs) {
    if (ix.dated.has(c) || owner.has(c) || !ins.size) continue;
    const os = new Set([...ins].map((i) => extractorOf.get(i)));
    if (os.size === 1) {
      const [o] = os;
      if (o && o !== c) owner.set(c, o);
    }
  }
  return { owner, shared };
}

export function followersOf(edges: readonly FollowEdge[], owner: string): Followers {
  const r = resolve(index(edges));
  const follow: string[] = [];
  for (const [f, o] of r.owner) if (o === owner) follow.push(f);
  const shared: string[] = [];
  for (const [p, hs] of r.shared) if (hs.includes(owner)) shared.push(p);
  return { follow, shared };
}

/** follower → its owner, for every follower in the graph */
export function ownerMap(edges: readonly FollowEdge[]): Map<string, string> {
  return resolve(index(edges)).owner;
}
