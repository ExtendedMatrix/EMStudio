// EM-Data (DP-81): a tabular VIEW on the graph — the five em_data sheets
// (Units / Epochs / Authors / Documents / Claims). MICRO-3DTILES-LOD parte 3: the
// old «US view» was the Units with one more column, the first epoch — that column
// is the Units' now, edited the same way, and the sheet is gone.
//
// This is NOT a second source of truth. Rows are DERIVED from the em.json graph
// on every read, and cell edits mutate the SAME DocumentStore the Inspector and
// canvas use (checkpoint/undo, op-log). New rows mint their ids with the SAME
// deterministic uuid5 scheme as s3Dgraphy's `UnifiedXLSXImporter._mint`, so the
// table→graph step stays reproducible (edit one cell, re-import, same document
// apart from what changed). We do not re-implement em_data semantics — we mirror
// the importer's keying and reuse the store's mutation path.
//
// The per-row `volatile` flag is populated by an injected provider (AUX2): a
// mapped-but-not-baked auxiliary lives in the in-memory graph, is shown here and
// on the canvas, marked (blue), and excluded from save until baked.

import type { DocumentStore } from "./model";
import type { EmEdge, EmNode } from "./types";
import { isStratigraphicType, nodeLabel, typesOfClass } from "./rules";
import { RELATION_CLAIMS } from "./table-views";

// ── deterministic identity (mirror of UnifiedXLSXImporter._mint) ────────────
// Fixed namespace, copied verbatim from s3Dgraphy so ids computed here match the
// Python importer byte-for-byte. `uuid5(NS, "{graph_id}|{kind}|{key}")`.
const EM_DATA_NS = "6f1a2c94-0b8e-5d3a-9c47-a1b2c3d4e5f6";

/** Synchronous SHA-1 (RFC 3174) — needed because uuid5 is name-based (SHA-1) and
 *  we mint ids inline during an edit. Standard algorithm; not s3Dgraphy logic. */
function sha1(bytes: Uint8Array): Uint8Array {
  const ml = bytes.length * 8;
  // pad
  const withOne = new Uint8Array(((bytes.length + 8) >> 6) * 64 + 64);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 4, ml >>> 0, false);
  dv.setUint32(withOne.length - 8, Math.floor(ml / 0x100000000), false);

  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotl = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  for (let i = 0; i < withOne.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++)
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const od = new DataView(out.buffer);
  od.setUint32(0, h0, false);
  od.setUint32(4, h1, false);
  od.setUint32(8, h2, false);
  od.setUint32(12, h3, false);
  od.setUint32(16, h4, false);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/-/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function uuid5(namespace: string, name: string): string {
  const nsBytes = hexToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(nsBytes.length + nameBytes.length);
  buf.set(nsBytes);
  buf.set(nameBytes, nsBytes.length);
  const hash = sha1(buf);
  const b = hash.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The node/edge id UnifiedXLSXImporter would mint for this row (uuid5). */
export function emDataMint(graphId: string, kind: string, key: string): string {
  return uuid5(EM_DATA_NS, `${graphId}|${kind}|${key}`);
}

// ── sheet model ─────────────────────────────────────────────────────────────
export type SheetKey =
  | "Units"
  | "Epochs"
  | "Authors"
  | "Documents"
  | "Claims";

export const EM_DATA_SHEETS: { key: SheetKey; label: string }[] = [
  { key: "Units", label: "Units" },
  { key: "Epochs", label: "Epochs" },
  { key: "Authors", label: "Authors" },
  { key: "Documents", label: "Documents" },
  { key: "Claims", label: "Claims" },
];

export type CellEditor =
  | { kind: "text" }
  | { kind: "number" }
  | { kind: "color" }
  | { kind: "select"; options: { value: string; label: string }[] }
  | { kind: "readonly" };

export interface Column {
  key: string;
  label: string;
  editor: CellEditor;
  /** provenance columns of the Claims sheet: shown, edited via affordance only */
  provenance?: boolean;
}

export interface Row {
  /** the anchor node id this row maps to (or a synthetic key for Claims rows) */
  id: string;
  cells: Record<string, string>;
  /** AUX2: a mapped-but-not-baked node — visible, marked, not yet persisted */
  volatile: boolean;
  /** STRUTTURA · a row that is shown, not edited here (an edge claim) */
  readonly?: boolean;
  /** STRUTTURA · nesting of the first cell (sub-epochs under their mother) */
  depth?: number;
}

export interface Table {
  sheet: SheetKey;
  columns: Column[];
  rows: Row[];
  /** true when new rows can be appended from the table */
  canAdd: boolean;
}

/** A provider that answers "is this node volatile?" — supplied by AUX2. When
 *  absent (EMDATA1 alone) every node is persistent. Single source of truth for
 *  the volatile flag, read by BOTH this table and the canvas renderer. */
export type VolatileProvider = (nodeId: string) => boolean;

const EPOCH_TYPES = new Set(["EpochNode", "epoch"]);
const isEpoch = (n: EmNode) => EPOCH_TYPES.has(n.node_type);
const isAuthor = (n: EmNode) =>
  n.node_type === "author" || n.node_type === "author_ai";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function dataOf(n: EmNode): Record<string, unknown> {
  // read-only: never mutate the graph from a table build
  return (n.data ?? {}) as Record<string, unknown>;
}

// ── read: derive a table from the graph ─────────────────────────────────────
export function buildTable(
  store: DocumentStore,
  sheet: SheetKey,
  volatile: VolatileProvider = () => false,
): Table {
  const nodes = store.doc.graph.nodes;
  const edges = store.doc.graph.edges;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const V = (id: string) => volatile(id);

  const stratTypeOptions = () =>
    [...new Set(typesOfClass("StratigraphicNode"))]
      .filter((t) => isStratigraphicType(t))
      .map((t) => ({ value: t, label: `${t} — ${nodeLabel(t)}` }));

  const epochOptions = () => [
    { value: "", label: "—" },
    ...nodes
      .filter(isEpoch)
      .map((e) => ({ value: e.id, label: str(e.name) || e.id })),
  ];

  const firstEpochIdOf = (unitId: string): string => {
    const e = edges.find(
      (x) => x.source === unitId && x.edge_type === "has_first_epoch",
    );
    return e ? e.target : "";
  };

  if (sheet === "Units") {
    const units = nodes.filter((n) => isStratigraphicType(n.node_type));
    const columns: Column[] = [
      { key: "ID", label: "ID", editor: { kind: "text" } },
      {
        key: "TYPE",
        label: "Type",
        editor: { kind: "select", options: stratTypeOptions() },
      },
      { key: "NAME", label: "Name", editor: { kind: "text" } },
      // was the «US view»'s own column: the first epoch, written as
      // `has_first_epoch` (MICRO-3DTILES-LOD parte 3)
      {
        key: "EPOCH",
        label: "First epoch",
        editor: { kind: "select", options: epochOptions() },
      },
    ];
    const rows: Row[] = units.map((n) => {
      const cells: Record<string, string> = {
        ID: str(n.name) || n.id,
        TYPE: n.node_type,
        NAME: str(n.description),
        EPOCH: firstEpochIdOf(n.id),
      };
      return { id: n.id, cells, volatile: V(n.id) };
    });
    return { sheet, columns, rows, canAdd: true };
  }

  if (sheet === "Epochs") {
    const columns: Column[] = [
      { key: "ID", label: "ID", editor: { kind: "text" } },
      { key: "START", label: "Start", editor: { kind: "number" } },
      { key: "END", label: "End", editor: { kind: "number" } },
      // STRUTTURA · the EMdb Epochs.PARENT column. The nesting is READ FROM THE
      // EDGES (`has_sub_epoch`), never from the dates: it is the importer's
      // assertion (`unified_xlsx_importer.py`), and two spans that happen to
      // nest are not a sub-epoch.
      { key: "PARENT", label: "Parent", editor: { kind: "readonly" } },
      { key: "COLOR", label: "Color", editor: { kind: "color" } },
    ];
    const parentOf = new Map<string, string>();
    const kids = new Map<string, string[]>();
    for (const e of edges)
      if (e.edge_type === "has_sub_epoch") {
        parentOf.set(e.target, e.source);
        kids.set(e.source, [...(kids.get(e.source) ?? []), e.target]);
      }
    const startOf = (n: EmNode): number => {
      const d = dataOf(n);
      const v = Number(d.start_time ?? d.start);
      return Number.isFinite(v) ? v : -Infinity;
    };
    const newest = (a: EmNode, b: EmNode): number => startOf(b) - startOf(a);
    const ordered: Array<[EmNode, number]> = [];
    const seen = new Set<string>();
    const rec = (n: EmNode, depth: number): void => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      ordered.push([n, depth]);
      (kids.get(n.id) ?? []).map((k) => byId.get(k)).filter((k): k is EmNode => !!k && isEpoch(k))
        .sort(newest).forEach((k) => rec(k, depth + 1));
    };
    nodes.filter((n) => isEpoch(n) && !parentOf.has(n.id)).sort(newest).forEach((n) => rec(n, 0));
    nodes.filter(isEpoch).forEach((n) => rec(n, 0)); // a cycle's members, never dropped
    const rows: Row[] = ordered.map(([n, depth]) => {
      const d = dataOf(n);
      const par = parentOf.get(n.id);
      return {
        id: n.id,
        cells: {
          ID: str(n.name) || n.id,
          START: str(d.start_time ?? d.start ?? ""),
          END: str(d.end_time ?? d.end ?? ""),
          PARENT: par ? str(byId.get(par)?.name) || par : "—",
          COLOR: str(d.fill_color ?? (n as Record<string, unknown>).color ?? ""),
        },
        volatile: V(n.id),
        depth,
      };
    });
    return { sheet, columns, rows, canAdd: true };
  }

  if (sheet === "Authors") {
    const columns: Column[] = [
      { key: "ID", label: "ID", editor: { kind: "text" } },
      {
        key: "KIND",
        label: "Kind",
        editor: {
          kind: "select",
          options: [
            { value: "human", label: "human" },
            { value: "ai", label: "ai" },
          ],
        },
      },
      { key: "DISPLAY_NAME", label: "Display name", editor: { kind: "text" } },
      { key: "ORCID", label: "ORCID", editor: { kind: "text" } },
      { key: "AFFILIATION", label: "Affiliation", editor: { kind: "text" } },
    ];
    const rows: Row[] = nodes.filter(isAuthor).map((n) => {
      const d = dataOf(n);
      return {
        id: n.id,
        cells: {
          ID: str(n.name) || n.id,
          KIND: n.node_type === "author_ai" ? "ai" : "human",
          DISPLAY_NAME: str(d.display_name ?? n.description ?? ""),
          ORCID: str(d.orcid ?? ""),
          AFFILIATION: str(d.affiliation ?? ""),
        },
        volatile: V(n.id),
      };
    });
    return { sheet, columns, rows, canAdd: true };
  }

  if (sheet === "Documents") {
    const columns: Column[] = [
      { key: "ID", label: "ID", editor: { kind: "text" } },
      { key: "FILENAME", label: "Filename", editor: { kind: "text" } },
      { key: "TITLE", label: "Title", editor: { kind: "text" } },
      { key: "YEAR", label: "Year", editor: { kind: "text" } },
      {
        key: "AUTHOR_IDS",
        label: "Authors",
        editor: { kind: "readonly" },
        provenance: true,
      },
    ];
    const authorsOf = (docId: string): string =>
      edges
        .filter((e) => e.source === docId && e.edge_type === "has_author")
        .map((e) => str(byId.get(e.target)?.name) || e.target)
        .join(", ");
    const rows: Row[] = nodes
      .filter((n) => n.node_type === "document")
      .map((n) => {
        const d = dataOf(n);
        return {
          id: n.id,
          cells: {
            ID: str(n.name) || n.id,
            FILENAME: str(d.filename ?? ""),
            TITLE: str(d.title ?? n.description ?? ""),
            YEAR: str(d.year ?? ""),
            AUTHOR_IDS: authorsOf(n.id),
          },
          volatile: V(n.id),
        };
      });
    return { sheet, columns, rows, canAdd: true };
  }

  // Claims: one row per PropertyNode (the assertion) + its provenance chain,
  // rendered read-mostly. VALUE / PROPERTY_TYPE edit the PropertyNode; the
  // provenance columns are shown but not free-typed (edited via affordance).
  const props = nodes.filter((n) => n.node_type === "property");
  const targetOf = (propId: string): EmNode | undefined => {
    const e = edges.find(
      (x) => x.target === propId && x.edge_type === "has_property",
    );
    return e ? byId.get(e.source) : undefined;
  };
  const chainText = (propId: string): { comb: string; prov: string } => {
    // property ─has_data_provenance→ (combiner | extractor); combiner ─combines→ extractor
    const provEdges = edges.filter(
      (x) => x.source === propId && x.edge_type === "has_data_provenance",
    );
    const origins = provEdges.map((e) => byId.get(e.target)).filter(Boolean) as EmNode[];
    const comb = origins.find((o) => o.node_type === "combiner");
    const extractors: EmNode[] = [];
    for (const o of origins) {
      if (o.node_type === "extractor") extractors.push(o);
      if (o.node_type === "combiner") {
        for (const ce of edges.filter(
          (x) => x.source === o.id && x.edge_type === "combines",
        )) {
          const ex = byId.get(ce.target);
          if (ex) extractors.push(ex);
        }
      }
    }
    const docNames = new Set<string>();
    const authNames = new Set<string>();
    for (const ex of extractors) {
      for (const de of edges.filter(
        (x) => x.source === ex.id && x.edge_type === "extracted_from",
      )) {
        const dn = byId.get(de.target);
        if (dn) docNames.add(str(dn.name) || dn.id);
      }
    }
    const authOf = (origin: EmNode) =>
      edges
        .filter((x) => x.source === origin.id && x.edge_type === "has_author")
        .forEach((x) => {
          const an = byId.get(x.target);
          if (an) authNames.add(str(an.name) || an.id);
        });
    extractors.forEach(authOf);
    origins.forEach(authOf);
    return {
      comb: comb ? str(comb.description) || str(comb.name) : "",
      prov: [
        extractors.length ? `ext: ${extractors.map((e) => str(e.name)).join(", ")}` : "",
        docNames.size ? `doc: ${[...docNames].join(", ")}` : "",
        authNames.size ? `auth: ${[...authNames].join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };
  const columns: Column[] = [
    { key: "TARGET_ID", label: "Target", editor: { kind: "readonly" }, provenance: true },
    // STRUTTURA · what KIND of statement the row is: a qualia (a property), an
    // epoch membership, a relation — the desk's «Genere»
    { key: "KIND", label: "Kind", editor: { kind: "readonly" } },
    { key: "PROPERTY_TYPE", label: "Property", editor: { kind: "text" } },
    { key: "VALUE", label: "Value", editor: { kind: "text" } },
    { key: "UNITS", label: "Units", editor: { kind: "text" } },
    { key: "COMBINER_REASONING", label: "Combiner", editor: { kind: "readonly" }, provenance: true },
    { key: "PROVENANCE", label: "Provenance", editor: { kind: "readonly" }, provenance: true },
  ];
  const rows: Row[] = props.map((p) => {
    const d = dataOf(p);
    const tgt = targetOf(p.id);
    const c = chainText(p.id);
    return {
      id: p.id,
      cells: {
        TARGET_ID: tgt ? str(tgt.name) || tgt.id : "—",
        KIND: "qualia",
        PROPERTY_TYPE: str(
          (p as Record<string, unknown>).property_type ?? d.property_type ?? p.name ?? "",
        ),
        // `data.value` is where s3Dgraphy's em.json exporter puts a property's
        // value; the top-level `value` is what THIS app writes when the cell is
        // edited here, and `description` is where the GraphML import has always
        // left it. All three are the same fact, so all three are read — a
        // property that arrived from the library was showing an empty Value
        // column while the reading sat in the document all along.
        VALUE: str(
          (p as Record<string, unknown>).value ?? d.value ?? p.description ?? "",
        ),
        UNITS: str(d.units ?? ""),
        COMBINER_REASONING: c.comb,
        PROVENANCE: c.prov,
      },
      volatile: V(p.id),
    };
  });
  // …and the two other kinds of claim, READ-ONLY: they are edges, and an edge
  // is edited on the canvas. Epoch membership and the stratigraphic relations of
  // every unit, the same statements the EMdb Claims sheet lists.
  const RELATIONS = new Set(RELATION_CLAIMS);
  edges.forEach((e, i) => {
    const s = byId.get(e.source);
    const d = byId.get(e.target);
    if (!s || !d || !isStratigraphicType(s.node_type)) return;
    const et = e.edge_type ?? "";
    const kind = et === "has_first_epoch" ? "epoch" : RELATIONS.has(et) ? "relation" : "";
    if (!kind) return;
    rows.push({
      id: `claim:${e.id ?? i}`,
      cells: { TARGET_ID: str(s.name) || s.id, KIND: kind, PROPERTY_TYPE: et,
               VALUE: str(d.name) || d.id, UNITS: "", COMBINER_REASONING: "", PROVENANCE: "" },
      volatile: false,
      readonly: true,
    });
  });
  return { sheet, columns, rows, canAdd: false };
}

// ── write: apply a cell edit back to the graph via the store ────────────────
/** Propagate one cell edit to the graph. Returns true when something changed. */
export function applyEdit(
  store: DocumentStore,
  sheet: SheetKey,
  rowId: string,
  col: string,
  value: string,
): boolean {
  const n = store.node(rowId);
  if (!n) return false;

  if (sheet === "Units") {
    if (col === "ID") store.updateNode(rowId, { name: value });
    else if (col === "NAME") store.updateNode(rowId, { description: value });
    else if (col === "TYPE" && value && value !== n.node_type)
      store.updateNode(rowId, { node_type: value });
    else if (col === "EPOCH") setFirstEpoch(store, rowId, value);
    return true;
  }

  if (sheet === "Epochs") {
    const d = { ...(n.data ?? {}) } as Record<string, unknown>;
    if (col === "ID") store.updateNode(rowId, { name: value });
    else if (col === "START") {
      d.start_time = num(value);
      store.updateNode(rowId, { data: d });
    } else if (col === "END") {
      d.end_time = num(value);
      store.updateNode(rowId, { data: d });
    } else if (col === "COLOR") {
      d.fill_color = value;
      store.updateNode(rowId, { data: d, color: value } as Partial<EmNode>);
    }
    return true;
  }

  if (sheet === "Authors") {
    if (col === "ID") store.updateNode(rowId, { name: value });
    else if (col === "KIND")
      store.updateNode(rowId, {
        node_type: value === "ai" ? "author_ai" : "author",
      });
    else {
      const d = { ...(n.data ?? {}) } as Record<string, unknown>;
      const key =
        col === "DISPLAY_NAME"
          ? "display_name"
          : col === "ORCID"
            ? "orcid"
            : "affiliation";
      d[key] = value;
      store.updateNode(rowId, { data: d });
    }
    return true;
  }

  if (sheet === "Documents") {
    if (col === "ID") store.updateNode(rowId, { name: value });
    else {
      const d = { ...(n.data ?? {}) } as Record<string, unknown>;
      const key =
        col === "FILENAME" ? "filename" : col === "TITLE" ? "title" : "year";
      d[key] = value;
      store.updateNode(rowId, { data: d });
      if (col === "TITLE") store.updateNode(rowId, { description: value });
    }
    return true;
  }

  if (sheet === "Claims") {
    if (col === "PROPERTY_TYPE")
      store.updateNode(rowId, {
        name: value,
        property_type: value,
      } as Partial<EmNode>);
    else if (col === "VALUE")
      store.updateNode(rowId, {
        value: value,
        description: value,
      } as Partial<EmNode>);
    return true;
  }
  return false;
}

/** Set / clear a unit's has_first_epoch edge (US-view epoch select). */
function setFirstEpoch(
  store: DocumentStore,
  unitId: string,
  epochId: string,
): void {
  store.batch(() => {
    for (const e of store.doc.graph.edges.filter(
      (x) => x.source === unitId && x.edge_type === "has_first_epoch",
    ))
      store.deleteEdge(e as EmEdge);
    if (epochId) store.addEdge(unitId, epochId, "has_first_epoch");
  });
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── add / delete rows (uuid5 keyed, same as the importer) ───────────────────
export function addRow(store: DocumentStore, sheet: SheetKey): string | null {
  const graphId = str(
    (store.doc.graph as Record<string, unknown>).graph_id ?? "graph",
  );
  const names = new Set(store.doc.graph.nodes.map((n) => str(n.name)));
  const nextKey = (prefix: string): string => {
    let i = 1;
    while (names.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  };

  if (sheet === "Units") {
    const key = nextKey("U");
    const id = emDataMint(graphId, "unit", key);
    store.addNode({ id, name: key, node_type: "US", description: "" });
    return id;
  }
  if (sheet === "Epochs") {
    const key = nextKey("E");
    const id = emDataMint(graphId, "epoch", key);
    store.addNode({
      id,
      name: key,
      node_type: "EpochNode",
      description: "",
      data: { start_time: 0, end_time: 0 },
    });
    return id;
  }
  if (sheet === "Authors") {
    let i = 1;
    while (names.has(`A.${String(i).padStart(2, "0")}`)) i++;
    const key = `A.${String(i).padStart(2, "0")}`;
    const id = emDataMint(graphId, "author", key);
    store.addNode({ id, name: key, node_type: "author", description: "" });
    return id;
  }
  if (sheet === "Documents") {
    let i = 1;
    while (names.has(`D.${String(i).padStart(2, "0")}`)) i++;
    const key = `D.${String(i).padStart(2, "0")}`;
    const id = emDataMint(graphId, "document", key);
    store.addNode({ id, name: key, node_type: "document", description: "" });
    return id;
  }
  return null; // Claims rows are authored via the affordance, not appended raw
}

/** Add a qualia Claim: a PropertyNode + has_property edge on the target unit
 *  (uuid5 keyed like the importer's `_handle_qualia`). Provenance is added later
 *  via its affordance (read-mostly). Returns the new PropertyNode id. */
export function addQualiaClaim(
  store: DocumentStore,
  targetId: string,
  propertyType: string,
  value: string,
): string | null {
  const target = store.node(targetId);
  if (!target) return null;
  const graphId = str(
    (store.doc.graph as Record<string, unknown>).graph_id ?? "graph",
  );
  // line-number surrogate: count existing claims of this type on the target + 1,
  // mirroring the importer's target+type+line key (kept unique per target/type).
  const existing = store.doc.graph.edges.filter(
    (e) => e.source === targetId && e.edge_type === "has_property",
  ).length;
  const key = `${targetId}|${propertyType}|${existing + 1}`;
  const id = emDataMint(graphId, "property", key);
  store.batch(() => {
    store.addNode({
      id,
      name: propertyType,
      node_type: "property",
      description: value,
      property_type: propertyType,
      value: value,
    } as EmNode);
    store.addEdge(targetId, id, "has_property");
  });
  return id;
}

export function deleteRow(store: DocumentStore, rowId: string): void {
  store.deleteNode(rowId);
}
