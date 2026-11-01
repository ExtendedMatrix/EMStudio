/**
 * MICRO-CODA-VISTA p.1 · a version registered on the WRONG asset (E.D., 1 Nov
 * 2026, Templu Mare v6: «Porta2_BAKE_SM_Porta2_BAKE@lod0-mobile.glb registered
 * in the graph as a version of Tempio_4_BAKE_SM_Tempio_4_BAKE»). The cause was
 * the page's: «Prepare for a use» kept its context (which master) by the
 * .blend, and two items of the queue from the same .blend ended side by side —
 * the second's master took the first's file. Fixed at the root in main.ts;
 * this module FINDS what was already written in a graph, so «Correggi» can
 * move it (or remove it) before the person saves.
 *
 * A version the page registered from EM Tools' «Prepare for a use» on a
 * master inside a .blend says the datablock it was made from: the `model` of
 * its `lod_generation` step (the file is named after it,
 * `<datablock>@<level>-<use>.glb`). When that datablock is not the one of the
 * master the step takes in (its url, `blend://…#Mesh/<datablock>`), the
 * version is on the wrong asset. Versions without a `model` (EM Tools' own
 * pipeline, gltfpack) say nothing and are never judged — the file's name is
 * the OBJECT's there, not the datablock's. A copy of a form registered with the same file
 * (`shared_mesh`) is right when the form's own registration is: it follows it.
 *
 * Pure: the graph as nodes and edges. `scripts/check-version-misplaced.mjs`.
 */

export interface MisNode { id: string; name?: unknown; node_type?: string; data?: unknown }
export interface MisEdge { source: string; target: string; edge_type?: unknown; id?: string }

export interface Misplaced {
  /** the version, its name and file (as the graph writes it) */
  version_id: string; name: string; file: string; checksum: string; level: string;
  /** the lod_generation step that made it (removed with it) */
  process_id: string;
  /** the master it is registered on */
  on_id: string; on_name: string;
  /** the object it was made from */
  model: string;
  /** that object's master in this graph (same .blend), when there is one */
  right_id: string | null; right_name: string;
  /** registered as a copy of a form (the same file on each copy) */
  shared: boolean;
  /** «move»: to the right master; «remove»: nowhere to move it here (a copy
   *  of a form whose registration was wrong, or no master for the object) */
  action: "move" | "remove";
}

const dataOf = (n: { data?: unknown } | undefined): Record<string, unknown> =>
  (n && typeof n.data === "object" && n.data ? n.data as Record<string, unknown> : {});
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** `blend://../SB/X.blend#Mesh/Name` → { file: "../SB/X.blend", block: "Name" }
 *  (also `blend://…/X.blend/Name`, the older form) */
export function blendBlock(url: string): { file: string; block: string } | null {
  if (!url.startsWith("blend://")) return null;
  const rest = url.slice("blend://".length);
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    const tail = rest.slice(hash + 1);
    return { file: rest.slice(0, hash), block: tail.slice(tail.lastIndexOf("/") + 1) };
  }
  const i = rest.toLowerCase().lastIndexOf(".blend/");
  if (i < 0) return null;
  return { file: rest.slice(0, i + 6), block: rest.slice(i + 7) };
}

/** the object a file of «Prepare for a use» was made from: `<object>@…` */
export function fileModel(url: string): string {
  const base = url.split(/[\\/]/).pop() ?? "";
  const at = base.indexOf("@");
  return at > 0 ? base.slice(0, at) : "";
}

export function findMisplaced(nodes: readonly MisNode[], edges: readonly MisEdge[]): Misplaced[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outOf = new Map<string, MisEdge[]>();
  for (const e of edges) { const l = outOf.get(e.source) ?? []; l.push(e); outOf.set(e.source, l); }
  const targets = (id: string, type: string): string[] =>
    (outOf.get(id) ?? []).filter((e) => str(e.edge_type) === type).map((e) => e.target)
      .filter((x) => byId.get(x)?.node_type === "resource");
  // the masters inside a .blend, by (file, datablock) — copies may share one
  const masters = new Map<string, MisNode[]>();
  for (const n of nodes) {
    if (n.node_type !== "resource") continue;
    const b = blendBlock(str(dataOf(n).url));
    if (b) masters.set(`${b.file}|${b.block}`, [...(masters.get(`${b.file}|${b.block}`) ?? []), n]);
  }
  type Row = Omit<Misplaced, "action" | "right_id" | "right_name"> & { file_blend: string; right: MisNode | null; wrong: boolean };
  const rows: Row[] = [];
  for (const p of nodes) {
    const pd = dataOf(p);
    if (str(pd.dtc_kind) !== "lod_generation") continue;
    const params = (pd.parameters && typeof pd.parameters === "object" ? pd.parameters : {}) as Record<string, unknown>;
    for (const mid of targets(p.id, "dtc_had_input")) {
      const m = byId.get(mid)!;
      const mb = blendBlock(str(dataOf(m).url));
      if (!mb) continue;
      for (const vid of targets(p.id, "dtc_had_output")) {
        const v = byId.get(vid)!;
        const vd = dataOf(v);
        const url = str(vd.url);
        const model = str(params.model);
        if (!model) continue;
        // the right master: the ONE whose datablock it is (two sharing it:
        // not decidable here — removed, said)
        const cands = masters.get(`${mb.file}|${model}`) ?? [];
        const right = cands.length === 1 ? cands[0] : null;
        rows.push({ version_id: vid, name: str(v.name), file: url, checksum: str(vd.checksum), level: str(params.level),
                    process_id: p.id, on_id: mid, on_name: str(m.name), model, shared: params.shared_mesh === true,
                    file_blend: mb.file, right, wrong: model !== mb.block });
      }
    }
  }
  // a copy of a form follows the form's own registration of the same file:
  // right when that one is right, wrong when it is wrong (or missing)
  const own = rows.filter((r) => !r.shared);
  const out: Misplaced[] = [];
  for (const r of rows) {
    let wrong = r.wrong;
    if (r.shared) {
      const first = own.find((o) => o.checksum && o.checksum === r.checksum && o.model === r.model);
      wrong = first ? first.wrong : true;
    }
    if (!wrong) continue;
    const move = !r.shared && !!r.right && r.right.id !== r.on_id;
    out.push({ version_id: r.version_id, name: r.name, file: r.file, checksum: r.checksum, level: r.level, process_id: r.process_id,
               on_id: r.on_id, on_name: r.on_name, model: r.model, right_id: move ? r.right!.id : null,
               right_name: move ? str(r.right!.name) : "", shared: r.shared, action: move ? "move" : "remove" });
  }
  return out.sort((a, b) => a.on_name.localeCompare(b.on_name) || a.name.localeCompare(b.name));
}
