// MICRO valore-proprietà (E.D., 28 Oct 2026) · the value of a property in two
// places, from now on. EM's historical place is `description` (yEd/GraphML,
// the old readers); `data.value` (s3Dgraphy's `PropertyNode.value`) mirrors it.
// Every property written carries the same value in both. Exceptions: the
// `geometry` property (its `data.value` is its shape's id, the description
// stays what it is) and a `data.value` that is a bare uuid (a pointer).
//
// The same rule as s3Dgraphy's `PropertyNode` (nodes/property_node.py): at
// birth the missing place copies the other, two different → `data.value` wins;
// a later write of one rewrites the other; emptying one empties the other when
// they were aligned. `DocumentStore` applies it in `addNode`, `updateNode` and
// on opening a document (in memory: the file changes only when it is saved).
// Remote operations are not touched: their writer aligned them.
import type { EmDocument, EmNode } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** a bare uuid: a pointer to a node, not a datum */
export function isUuidPointer(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** the text a value mirrors to: "" for nothing, the string of a scalar,
 *  `null` for what has no single text (an object, a list) and is not mirrored */
function asText(v: unknown): string | null {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

const dataOf = (n: Partial<EmNode> | undefined): Record<string, unknown> =>
  ((n?.data ?? {}) as Record<string, unknown>);

export function isProperty(n: Partial<EmNode> | undefined): boolean {
  return n?.node_type === "property";
}

/** the geometry property keeps its two places apart */
export function mirrorExempt(n: Partial<EmNode> | undefined): boolean {
  const t = String(dataOf(n).property_type || n?.name || "").trim().toLowerCase();
  return t === "geometry";
}

function withValue(data: Record<string, unknown>, v: string): Record<string, unknown> {
  const d = { ...data };
  if (v === "") delete d.value;
  else d.value = v;
  return d;
}

/** Align a property being born, in place. Returns true when it changed. */
export function alignPropertyAtBirth(n: EmNode): boolean {
  if (!isProperty(n) || mirrorExempt(n)) return false;
  const v = dataOf(n).value, d = n.description;
  if (isUuidPointer(v) || isUuidPointer(d)) return false;
  const tv = asText(v), td = asText(d);
  if (tv === null || td === null) return false;
  if (tv && tv !== td) { n.description = tv; return true; }
  if (td && !tv) { n.data = withValue(dataOf(n), td); return true; }
  return false;
}

/** The patch `updateNode` must apply so the two places stay one: the patch
 *  given, completed with the other place. `before` is the node as it is. */
export function alignPropertyPatch(before: EmNode, patch: Partial<EmNode>): Partial<EmNode> {
  if (!isProperty(before)) return patch;
  const after = { ...before, ...patch } as EmNode;
  if (mirrorExempt(after)) return patch;
  const oldV = dataOf(before).value;
  const tvOld = asText(oldV), tdOld = asText(before.description);
  const wasAligned = tvOld !== null && tvOld === (tdOld ?? "");
  const valChanged = "data" in patch && dataOf(patch).value !== oldV;
  const descChanged = "description" in patch && patch.description !== before.description;
  if (valChanged) {
    const nv = dataOf(after).value;
    if (isUuidPointer(nv)) return patch;
    const t = asText(nv);
    if (t === null) return patch;
    if (t) return { ...patch, description: t };
    return wasAligned ? { ...patch, description: "" } : patch;
  }
  if (descChanged) {
    // a pointer in data.value stays: the description is its own text
    if (tvOld === null || isUuidPointer(oldV) || isUuidPointer(patch.description)) return patch;
    const t = asText(patch.description);
    if (t === null) return patch;
    if (t) return tvOld === t ? patch : { ...patch, data: withValue(dataOf(after), t) };
    return wasAligned ? { ...patch, data: withValue(dataOf(after), "") } : patch;
  }
  return patch;
}

/** Align every property of a document, in place (on opening it). The count. */
export function alignPropertyValues(doc: EmDocument): number {
  let n = 0;
  for (const node of doc.graph?.nodes ?? []) if (alignPropertyAtBirth(node)) n++;
  return n;
}

/** The properties whose two places differ (geometry and pointers excluded). */
export function divergentProperties(doc: EmDocument): EmNode[] {
  return (doc.graph?.nodes ?? []).filter((n) => {
    if (!isProperty(n) || mirrorExempt(n)) return false;
    const v = dataOf(n).value;
    if (isUuidPointer(v) || isUuidPointer(n.description)) return false;
    const tv = asText(v), td = asText(n.description);
    if (tv === null || td === null) return false;
    return tv.trim() !== td.trim();
  });
}
