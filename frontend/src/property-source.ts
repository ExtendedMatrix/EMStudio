/**
 * FONTE · a property read as a source (E.D., 9 Oct 2026: «la proprietà come
 * fonte»; the instance is a view, s3Dgraphy 1.6.37).
 *
 * In the DATA the extractor of the property that reads is `extracted_from` the
 * MASTER — the other unit's property, in its own unit — and remembers what it
 * read (`data.read_value`, `data.read_at`): s3Dgraphy's
 * `property_source.read_property`, which this file writes through the store as
 * the client form of the same rule. No instance is ever written: the view draws
 * one in the reader's group (`paradata-view.ts`).
 *
 * The value read is the one the library compares (`PropertyNode.value`, i.e.
 * `data.value`); EMStudio writes a value in `description` and `data.value`
 * together (`DocumentStore.setPropertyValue`), and a master that has it only in
 * `description` (written before) gets `data.value` aligned in the same step, so
 * the reading and `source_changed` speak of the same thing.
 */
import type { DocumentStore } from "./model";
import type { EmNode } from "./types";
import { addReading, extractorsOfProperty, ownersOf, IS_IN_PARADATA_NODEGROUP,
         type NewReading } from "./paradata-chain";
import { ensureGroup } from "./compact";

export const READ_VALUE = "read_value";
export const READ_AT = "read_at";

const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;

/** The value of a property as s3Dgraphy reads it: `data.value`, else the
 *  description EMStudio wrote alone before both were kept together. */
export function libraryValue(p: EmNode | undefined): string | null {
  const v = dataOf(p).value;
  if (v !== undefined && v !== null && v !== "") return String(v);
  const d = String(p?.description ?? "").trim();
  return d ? d : null;
}

const nowStamp = (): string => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/** `data.value` on a master that has its value only in `description`. */
function alignMaster(store: DocumentStore, masterId: string): void {
  const m = store.node(masterId);
  if (!m) return;
  const d = dataOf(m);
  if ((d.value === undefined || d.value === null || d.value === "") && String(m.description ?? "").trim())
    store.updateNode(masterId, { data: { ...d, value: String(m.description).trim() } });
}

export interface PropertyReading extends Partial<NewReading> {
  extractorId: string;
  /** the reading was there already: it was read again */
  reread: boolean;
  /** the group the property (and its new extractor) sit in, and whether it was made */
  group: string | null;
  groupCreated: boolean;
}

/**
 * «Prendi da un'altra proprietà…»: the property `propertyId` reads the property
 * `masterId` of another unit. ONE undo step (one burst of CRDT operations):
 *   · the property's paradata group — its original owner's, made when missing
 *     (`compact.ensureGroup`), the property in it;
 *   · an extractor in that group, `extracted_from` the master, named after the
 *     master's unit (`US 12.01`, NAME1), with `has_data_provenance` from the
 *     property (or under its combiner: a second source makes one, as «+ lettura»
 *     does — `addReading`);
 *   · the value read on the extractor (`read_value`, `read_at`).
 * When an extractor of this property already reads that master it is read
 * again instead (the library's `read_property` asked twice). A property cannot
 * read itself (the library refuses the property an extractor feeds: for the
 * new extractor that is the reading property only).
 */
export function readFromProperty(store: DocumentStore, propertyId: string, masterId: string): PropertyReading {
  const prop = store.node(propertyId);
  const master = store.node(masterId);
  if (prop?.node_type !== "property") throw new Error(`'${propertyId}' is not a property`);
  if (master?.node_type !== "property") throw new Error(`'${masterId}' is not a property`);
  if (propertyId === masterId) throw new Error("a property cannot read itself");
  return store.batch(() => {
    const doc = store.doc;
    const already = extractorsOfProperty(doc, propertyId).find((x) =>
      doc.graph.edges.some((e) => e.source === x && e.target === masterId && e.edge_type === "extracted_from"
        && !((e.attributes ?? {}) as Record<string, unknown>).removed));
    alignMaster(store, masterId);
    const reading = { [READ_VALUE]: libraryValue(store.node(masterId)), [READ_AT]: nowStamp() };
    if (already) {
      store.updateNode(already, { data: { ...dataOf(store.node(already)), ...reading } });
      const g = doc.graph.edges.find((e) => e.source === already && e.edge_type === IS_IN_PARADATA_NODEGROUP)?.target ?? null;
      return { extractorId: already, reread: true, group: g, groupCreated: false };
    }
    // the group of the property: where it is, else its original owner's (made)
    let group = doc.graph.edges.find((e) => e.source === propertyId && e.edge_type === IS_IN_PARADATA_NODEGROUP)?.target ?? null;
    let groupCreated = false;
    if (!group) {
      const owner = ownersOf(doc, propertyId).find((o) => o.original)?.owner
        ?? ownersOf(doc, propertyId)[0]?.owner;
      if (owner) {
        const g = ensureGroup(store, owner, [propertyId]);
        group = g.id;
        groupCreated = g.created;
        store.addEdge(propertyId, group, IS_IN_PARADATA_NODEGROUP);
      }
    }
    const r = addReading(store, propertyId, { kind: "property", id: masterId }, { extractorData: reading });
    // a place in the Matrix, under the property (the Matrix draws only what
    // has a position; the next Layout packs it): the combiner, then the reading
    const positions = ((store.doc.layout ??= {}).positions ??= {});
    const at = positions[propertyId];
    if (at) {
      let y = at.y + (at.h ?? 32) + 32;
      if (r.combinerCreated && !positions[r.combinerCreated]) {
        positions[r.combinerCreated] = { x: at.x + (at.w ?? 90) / 2 - 16, y, w: 32, h: 32 };
        y += 64;
      }
      if (!positions[r.extractorId]) {
        const below = Object.values(positions).filter((q) => Math.abs(q.x - (at.x + (at.w ?? 90) / 2 - 16)) < 40
          && q.y >= y - 4 && q.y < y + 200).length;
        positions[r.extractorId] = { x: at.x + (at.w ?? 90) / 2 - 16 + below * 44, y, w: 32, h: 32 };
      }
    }
    // the extractor sits where the property's chain is (addReading joins the
    // chain's group, which is now this one)
    if (group && !store.hasEdge(r.extractorId, group, IS_IN_PARADATA_NODEGROUP))
      store.addEdge(r.extractorId, group, IS_IN_PARADATA_NODEGROUP);
    return { ...r, reread: false, group, groupCreated };
  });
}

/**
 * «Riallinea il valore letto»: the extractor reads its master again — the cure
 * of `source_changed` (the library's: a person reads again, `read_property`).
 * ONE undo step. Returns the new value read, or null when it reads no property.
 */
export function rereadProperty(store: DocumentStore, extractorId: string): string | null {
  const x = store.node(extractorId);
  if (!x) return null;
  const masters = store.doc.graph.edges.filter((e) => e.source === extractorId && e.edge_type === "extracted_from"
    && store.node(e.target)?.node_type === "property").map((e) => e.target);
  if (!masters.length) return null;
  let value: string | null = null;
  store.batch(() => {
    alignMaster(store, masters[0]);
    value = libraryValue(store.node(masters[0]));
    store.updateNode(extractorId, { data: { ...dataOf(store.node(extractorId)), [READ_VALUE]: value, [READ_AT]: nowStamp() } });
  });
  return value;
}

/** The master an extractor reads, when it reads a property, with what it read. */
export function readingOf(store: DocumentStore, extractorId: string): { master: string; read: string | null } | null {
  const e = store.doc.graph.edges.find((x) => x.source === extractorId && x.edge_type === "extracted_from"
    && store.node(x.target)?.node_type === "property");
  if (!e) return null;
  const r = dataOf(store.node(extractorId))[READ_VALUE];
  return { master: e.target, read: r == null ? null : String(r) };
}
