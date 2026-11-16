/**
 * MICRO-E-PORTA-VERSIONI-COLORI p.4 (E.D., 16 Nov 2026) · the sets a document
 * reaches, not only the ones it links.
 *
 * Archive › Documenti looked at `document —has_linked_resource→ set` alone, so
 * the models a document publishes (D.01: ten SM_OB_*_LOD1; D.09: the 87 of the
 * reconstruction) and their files fell in «Sets not censused». A document
 * reaches a set by three roads, and a set reached is censused:
 *
 *   1. document —has_linked_resource→ set (as before);
 *   2. document —has_representation_model(_doc|_sf)→ model —has_linked_resource→
 *      set; a target that is a group of models (a container) brings its
 *      members;
 *   3. the container of those models —has_linked_resource→ set (Survey2015's
 *      tileset), when every member of it that has a publisher has THIS one.
 *      Its members nobody else publishes (the RMSF beside the survey) come
 *      with it.
 *
 * A resource reached that is not a set itself (a master datablock in a .blend)
 * is a row when sets are derived from it: its versions are what is on disk.
 *
 * And a version follows its master: a set produced by a DTC process whose
 * input is a reached set (`dtc_had_input` / `dtc_had_output`), or derived from
 * it (`dtc_derived_from`), is reached too, under that master.
 *
 * Pure: the graph's index in, the tree out (check-doc-sets.mjs).
 */
import type { MediaIx } from "./media";

const MODEL_EDGES = ["has_representation_model", "has_representation_model_doc", "has_representation_model_sf"];
const GROUP_TYPES = new Set(["RepresentationModelNodeGroup", "RepresentationModelDocNodeGroup", "RepresentationModelSFNodeGroup"]);
const GROUP_EDGES = ["is_in_representation_model_group"];

export interface DocSetRow {
  /** the set (a resource) */
  set: string;
  /** the model (or the container) it comes through; null = linked directly */
  via: string | null;
  /** the versions derived from it, each with its own */
  versions: string[];
}

/** the versions of a set: outputs of a process that had it as input, and sets derived from it */
export function versionsOf(ix: MediaIx, set: string, isSetNode: (id: string) => boolean): string[] {
  const out = new Set<string>();
  for (const p of ix.inn(set, "dtc_had_input"))
    for (const o of ix.out(p, "dtc_had_output")) if (o !== set && isSetNode(o)) out.add(o);
  for (const d of ix.inn(set, "dtc_derived_from")) if (d !== set && isSetNode(d)) out.add(d);
  return [...out];
}

/** the models a document publishes, its containers opened into their members */
export function docModels(ix: MediaIx, doc: string): { models: string[]; groups: string[] } {
  const models = new Set<string>(), groups = new Set<string>();
  for (const et of MODEL_EDGES)
    for (const t of ix.out(doc, et)) {
      const tn = ix.byId.get(t);
      if (GROUP_TYPES.has(String(tn?.node_type))) {
        groups.add(t);
        for (const m of GROUP_EDGES.flatMap((ge) => ix.inn(t, ge))) models.add(m);
      } else models.add(t);
    }
  // 3 · a container all of whose published members come from this document
  for (const m of [...models])
    for (const g of GROUP_EDGES.flatMap((ge) => ix.out(m, ge))) {
      if (groups.has(g)) continue;
      const members = GROUP_EDGES.flatMap((ge) => ix.inn(g, ge));
      const published = members.map((x) => MODEL_EDGES.flatMap((et) => ix.inn(x, et))
        .filter((s) => ix.byId.get(s)?.node_type === "document"));
      if (published.some((ps) => ps.length) && published.every((ps) => !ps.length || (ps.length === 1 && ps[0] === doc))) groups.add(g);
    }
  // the container's members nobody else publishes (an RMSF beside the survey) come with it
  for (const g of groups)
    for (const m of GROUP_EDGES.flatMap((ge) => ix.inn(g, ge)))
      if (!MODEL_EDGES.flatMap((et) => ix.inn(m, et)).some((s) => s !== doc && ix.byId.get(s)?.node_type === "document")) models.add(m);
  return { models: [...models], groups: [...groups] };
}

/** every set a document reaches, in reading order: linked, then its models', then its containers' */
export function documentSets(ix: MediaIx, doc: string, isSetNode: (id: string) => boolean): DocSetRow[] {
  const rows: DocSetRow[] = [];
  const seen = new Set<string>();
  const push = (set: string, via: string | null) => {
    if (seen.has(set) || ix.byId.get(set)?.node_type !== "resource") return;
    // a version of a version (an LOD packed as .3tz) is still this master's
    const versions: string[] = [];
    const mine = new Set([set]);
    for (let q = [set]; q.length;) {
      const next: string[] = [];
      for (const s of q) for (const v of versionsOf(ix, s, isSetNode)) if (!seen.has(v) && !mine.has(v)) { mine.add(v); versions.push(v); next.push(v); }
      q = next;
    }
    // a master that is not a set (a datablock in a .blend) is a row when its versions are
    if (!isSetNode(set) && !versions.length) return;
    seen.add(set);
    for (const v of versions) seen.add(v);
    rows.push({ set, via, versions });
  };
  for (const r of ix.out(doc, "has_linked_resource")) push(r, null);
  const { models, groups } = docModels(ix, doc);
  const byName = (a: string, b: string) => String(ix.byId.get(a)?.name ?? a).localeCompare(String(ix.byId.get(b)?.name ?? b), undefined, { numeric: true });
  for (const m of models.sort(byName)) for (const r of ix.out(m, "has_linked_resource")) push(r, m);
  for (const g of groups.sort(byName)) for (const r of ix.out(g, "has_linked_resource")) push(r, g);
  return rows;
}

/** every set reached by some document (a version under its master counts) */
export function censusedSets(ix: MediaIx, docs: string[], isSetNode: (id: string) => boolean): Set<string> {
  const all = new Set<string>();
  for (const d of docs) for (const r of documentSets(ix, d, isSetNode)) { all.add(r.set); for (const v of r.versions) all.add(v); }
  return all;
}
