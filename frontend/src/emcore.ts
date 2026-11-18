// em-core in the browser: the SAME Rust layout engine that powers em-cli,
// compiled to WebAssembly (crates/em-wasm) — one implementation, identical
// results across CLI, desktop and web (ADR-001, ARCHITECTURE §4.4).
// Rebuild with: scripts/build-wasm.sh (the .wasm is vendored so `npm run
// build` works without a Rust toolchain).
import type { EmGraph, EmLayout } from "./types";
import wasmUrl from "./wasm/em_wasm.wasm?url";

interface EmCoreExports {
  memory: WebAssembly.Memory;
  em_alloc: (len: number) => number;
  em_free: (ptr: number, len: number) => void;
  em_layout: (ptr: number, len: number) => number;
  em_free_result: (ptr: number) => void;
}

let exportsCache: EmCoreExports | null = null;

async function ensure(): Promise<EmCoreExports> {
  if (exportsCache) return exportsCache;
  const response = await fetch(wasmUrl);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  exportsCache = instance.exports as unknown as EmCoreExports;
  return exportsCache;
}

/**
 * Compute the swimlane layout via em-core (WASM). When `sketch` is passed,
 * its positions act as a From-Sketch soft constraint: the manual
 * arrangement survives the re-layout (yEd parity).
 *
 * `sizesOnly` (EM3) is NOT a layout: em-core returns the sketch with every node's
 * SIZE re-asserted from its type and positions untouched. It exists because a size
 * is geometry of the type while a position is user intent — a document saved before
 * a type's box geometry existed must draw correctly on load, without moving
 * anything and without the frontend re-implementing `box_for_node` (em-core stays
 * the only owner of the size).
 */
export async function computeLayout(
  graph: EmGraph,
  sketch?: EmLayout,
  opts?: { sizesOnly?: boolean; reduceCrossings?: boolean },
): Promise<EmLayout> {
  const core = await ensure();
  const input = new TextEncoder().encode(
    JSON.stringify({
      graph, layout: sketch, sizes_only: !!opts?.sizesOnly,
      // MICRO-V · «Disponi riducendo gli incroci»: D for this run only
      ...(opts?.reduceCrossings ? { reduce_crossings: true } : {}),
    }),
  );
  const ptr = core.em_alloc(input.length);
  new Uint8Array(core.memory.buffer, ptr, input.length).set(input);
  const out = core.em_layout(ptr, input.length);
  core.em_free(ptr, input.length);
  // fresh views: the call may have grown (re-allocated) the memory
  const view = new DataView(core.memory.buffer);
  const len = view.getUint32(out, true);
  const json = new TextDecoder().decode(
    new Uint8Array(core.memory.buffer, out + 4, len),
  );
  core.em_free_result(out);
  const result = JSON.parse(json) as { ok?: EmLayout & { lane_from_sources?: string[] }; err?: string };
  if (result.err || !result.ok) throw new Error(result.err ?? "layout failed");
  // MICRO-V · the nodes with no epoch that em-core put in the lane of their
  // sources: an OUTPUT, kept beside the layout and out of it (the archival
  // layout is the document's, and this is not intent)
  const bySources = result.ok.lane_from_sources;
  delete result.ok.lane_from_sources;
  if (bySources?.length) laneFromSourcesOf.set(result.ok, new Set(bySources));
  return result.ok;
}

const laneFromSourcesOf = new WeakMap<object, Set<string>>();
/** MICRO-V · the nodes of `layout` placed in a lane by their sources (G): the
 *  Matrix marks them «senza epoca». Empty for a layout em-core did not give. */
export function laneFromSources(layout: EmLayout | null | undefined): ReadonlySet<string> {
  return (layout && laneFromSourcesOf.get(layout)) || EMPTY;
}
const EMPTY: ReadonlySet<string> = new Set();
