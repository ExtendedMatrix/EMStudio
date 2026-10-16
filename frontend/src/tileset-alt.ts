/**
 * MICRO-SPAZIO-3D-3 p.12 · a tileset as the ALTERNATIVE of a container — pure
 * (`scripts/check-tileset-alt.mjs`).
 *
 * A survey gives its models in pieces (EST_fr, EST_bk, EST_L…) and a tileset of
 * the whole: two representations of the same set, one or the other. The
 * datamodel is not touched: the view COMPUTES the alternative from the DTC —
 * a tileset is the alternative of a container when its master (or one of its
 * versions) is DERIVED from the containers' members' masters, with
 * `dtc_derived_from` or with a step whose `dtc_had_input` are they and whose
 * `dtc_had_output` is it. From all of them: the alternative; from a part: the
 * alternative of a part, and it says so («3 of 4»).
 *
 * Measured on Templu Mare v3.2 (16 Oct 2026): XX_tileset's master
 * (TempluMare.zip) is `dtc_derived_from` the 2015 photogrammetric survey (the
 * Metashape project), and so are the EST and INT models' masters: siblings of
 * one survey, neither derived from the other — the rule does not find it, and
 * it does not guess from the common ancestor. The tileset's Inspector offers
 * «Dichiara che deriva da…» (the derivation written with the TS twin of
 * s3Dgraphy's `declare_derivation`, `ingest.ts`).
 */

export interface DocGraph { nodes: Array<{ id: string; node_type?: string; data?: unknown }>; edges: Array<{ source: string; target: string; edge_type?: string; attributes?: unknown }> }

const alive = (e: { attributes?: unknown }) => !((e.attributes as { removed?: unknown } | undefined)?.removed);

/** Is `out` (a tileset's master or one of its versions) derived from `input`? */
export function derivedFrom(g: DocGraph, outs: readonly string[], input: string): boolean {
  const O = new Set(outs);
  for (const e of g.edges) {
    if (!alive(e)) continue;
    if (e.edge_type === "dtc_derived_from" && O.has(e.source) && e.target === input) return true;
  }
  // a step: dtc_had_input the input, dtc_had_output one of the outs
  const procOut = new Map<string, Set<string>>();
  for (const e of g.edges) if (alive(e) && e.edge_type === "dtc_had_output" && O.has(e.target)) (procOut.get(e.source) ?? procOut.set(e.source, new Set()).get(e.source)!).add(e.target);
  for (const e of g.edges) if (alive(e) && e.edge_type === "dtc_had_input" && e.target === input && procOut.has(e.source)) return true;
  return false;
}

export interface TilesetAlternative {
  tileset: string;
  group: string;
  /** the members its master derives from, and how many members there are */
  covered: string[];
  total: number;
}

/**
 * The alternatives of the containers: `tilesets` are the models whose file is a
 * tileset with their master and versions (`outs`), `groups` the containers with
 * their members and each member's master.
 */
export function tilesetAlternatives(g: DocGraph,
                                    tilesets: ReadonlyArray<{ id: string; outs: string[] }>,
                                    groups: ReadonlyArray<{ id: string; members: ReadonlyArray<{ id: string; master: string }> }>): TilesetAlternative[] {
  const out: TilesetAlternative[] = [];
  for (const t of tilesets)
    for (const gr of groups) {
      if (!gr.members.length) continue;
      const covered = gr.members.filter((m) => m.master && derivedFrom(g, t.outs, m.master)).map((m) => m.id);
      if (covered.length) out.push({ tileset: t.id, group: gr.id, covered, total: gr.members.length });
    }
  return out;
}

/** The choice of a container with an alternative: its models, the tileset, or the distance. */
export type AltMode = "models" | "tileset" | "auto";
