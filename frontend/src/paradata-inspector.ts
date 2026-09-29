/**
 * CATENA · the paradata chain in the Inspector — the property card.
 *
 * For a unit (or a document, or an epoch: every node `has_property` admits) one
 * card per property: name and value, the chain DOCUMENT → PLACE → EXTRACTOR
 * (→ COMBINER) → PROPERTY with every link clickable (the place opens the
 * document on it), each reading's result and geometry badge,
 * its description (editable here, the SECONDARY place; the document's window is
 * the main one), «Usa come valore», and — for a property with more than one owner
 * — «condivisa con X» / «ereditata da X». «Eredita da…» opens the link component
 * on the properties of the other units. Nothing here is automatic.
 *
 * For an EXTRACTOR: its place in the chain and its description. For a DOCUMENT:
 * the readings of it. The logic lives in `paradata-chain.ts`; this file only
 * draws and calls back.
 */
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import {
  extractorsOfProperty,
  geometryOf,
  measureText,
  ownersOf,
  propertiesOf,
  propertyOfExtractor,
  propertyValue,
  provenanceOf,
  readingsOfDocument,
  resultOf,
  setReadingDescription,
  sourceOf,
  type Geometry,
} from "./paradata-chain";
import type { EmNode } from "./types";
import { mediumOfFile, type Medium } from "./doc-form";

export interface ChainUi {
  store: DocumentStore;
  isUnit: (nodeType: string | undefined) => boolean;
  /** may this node own a property (has_property from the datamodel)? */
  canOwnProperty: (nodeType: string | undefined) => boolean;
  jump: (id: string) => void;
  /** «Eredita da…» — open the link component for this owner */
  inherit: (ownerId: string, anchor: HTMLElement) => void;
  /** «+ lettura» — from where, then the document's window */
  addReading?: (propertyId: string, anchor: HTMLElement) => void;
  /** open the document's window on this reading */
  openReading?: (extractorId: string) => void;
  /** LUOGO · open the document on the reading's place (shown, not re-armed) */
  openPlace?: (extractorId: string) => void;
  /** «Usa come valore» */
  useAsValue: (extractorId: string) => void;
  /** the AI chip of a node ("" when the node is not AI-assisted) */
  aiChip?: (nodeId: string) => HTMLElement | null;
  /** the extra rows a document shows (dating, phase 6) */
  documentExtras?: (host: HTMLElement, documentId: string) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const MEDIUM_ICON: Record<string, string> = { image: "▣", text: "¶", "3d": "⬡" };

/** The medium of a document, read off the file it points at (its own
 *  `data.url|filename|path`, else a linked resource's) with `mediumOfFile` —
 *  never stored as a field of its own (doc-form: no «supporto» in EM). A
 *  document with its text inline (`data.text`, e.g. from a Tropy note) is text. */
export function mediumOf(doc: EmNode | undefined, resolve: (id: string) => EmNode | undefined,
                         linked: (id: string) => string[]): Medium | null {
  if (!doc) return null;
  const d = (doc.data ?? {}) as Record<string, unknown>;
  const loc = [d.url, d.filename, d.path, ...linked(doc.id).map((r) => {
    const rd = (resolve(r)?.data ?? {}) as Record<string, unknown>;
    return rd.url ?? rd.filename ?? rd.path;
  })].find((x) => typeof x === "string" && x);
  if (loc) return mediumOfFile(String(loc).split(/[?#]/)[0]);
  if (typeof d.text === "string" && d.text) return "text";
  return null;
}

const GEO_ICON: Record<string, string> = { region2d: "▭", passage: "¶", point: "⌖", line: "⟷", polyline: "⌇" };

/** The badge of a reading's place: its kind, and for a measure its length. */
export function geometryBadge(g: Geometry | null): HTMLElement {
  if (!g) return el("span", "chain-geo none", t("chain.geo.none"));
  const m = measureText(g);
  const b = el("span", `chain-geo ${g.kind}`, `${GEO_ICON[g.kind] ?? "·"} ${t(`chain.geo.${g.kind}`)}${m ? ` · ${m}` : ""}`);
  b.dataset.kind = g.kind;
  if (m) b.dataset.measure = m;
  return b;
}

function linkBtn(ui: ChainUi, id: string, cls = ""): HTMLButtonElement {
  const n = ui.store.node(id);
  const b = el("button", `tv-link chain-link ${cls}`.trim(), String(n?.name || id));
  b.type = "button";
  b.title = `${n?.node_type ?? ""}`;
  b.addEventListener("click", () => ui.jump(id));
  return b;
}

/** One reading, in the order of the argument (LUOGO):
 *  `└ D.2 ⬡ → [⌇ polilinea · 4.031 m] → D.2.01 (→ height)` — the document, the
 *  PLACE in it (its kind, and for a measure its length; a click opens the
 *  document on that place), the extractor that read it, the property. A reading
 *  from a unit: `└ USM101 → D.2.01`. */
function readingRow(ui: ChainUi, x: string, depth: number, withProperty = false): HTMLElement {
  const doc = ui.store.doc;
  const wrap = el("div", "chain-reading");
  wrap.dataset.extractor = x;
  wrap.style.setProperty("--depth", String(depth));
  const row = el("div", "chain-row");
  row.appendChild(el("span", "chain-ar", "└"));
  const src = sourceOf(doc, x);
  if (src) {
    row.appendChild(linkBtn(ui, src.id, src.kind));
    if (src.kind === "document") {
      const m = mediumOf(ui.store.node(src.id), (id) => ui.store.node(id),
        (id) => doc.graph.edges.filter((e) => e.source === id && e.edge_type === "has_linked_resource").map((e) => e.target));
      if (m) {
        const tag = el("span", "chain-medium", MEDIUM_ICON[m]);
        tag.title = t(`chain.medium.${m}`);
        row.appendChild(tag);
      }
      // the place: where in the document the reading looked
      row.appendChild(el("span", "chain-ar", "→"));
      const g = geometryOf(doc, x);
      const badge = geometryBadge(g);
      badge.classList.add("chain-place");
      if (g && ui.openPlace) {
        const b = el("button", badge.className);
        b.type = "button";
        b.textContent = badge.textContent;
        Object.assign(b.dataset, badge.dataset);
        b.dataset.place = g.regionId ?? "";
        b.title = t("chain.openPlace");
        b.addEventListener("click", () => ui.openPlace!(x));
        row.appendChild(b);
      } else row.appendChild(badge);
    } else row.appendChild(el("span", "chain-medium unit", t("chain.fromUnit")));
  } else row.appendChild(el("span", "chain-nosrc", t("chain.noSource")));
  row.append(el("span", "chain-ar", "→"), linkBtn(ui, x, "x"));
  const chip = ui.aiChip?.(x);
  if (chip) row.appendChild(chip);
  if (withProperty) {
    const p = propertyOfExtractor(doc, x);
    if (p) row.append(el("span", "chain-ar", "→"), linkBtn(ui, p, "p"));
  }
  wrap.appendChild(row);

  const desc = el("div", "chain-desc");
  const x0 = ui.store.node(x);
  const ta = el("span", "chain-desc-text");
  ta.contentEditable = "true";
  ta.dataset.xdesc = x;
  ta.dataset.ph = t("chain.descPh");
  ta.textContent = String(x0?.description ?? "");
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    e.stopPropagation();
  });
  ta.addEventListener("blur", () => setReadingDescription(ui.store, x, (ta.textContent ?? "").trim()));
  desc.appendChild(ta);
  const res = resultOf(doc, x);
  if (res) desc.appendChild(el("b", "chain-result", res.length > 80 ? `${res.slice(0, 80)}…` : res));
  const acts = el("span", "chain-acts");
  if (src?.kind === "document" && ui.openReading) {
    const a = el("button", "tv-act", t("chain.read"));
    a.type = "button";
    a.title = t("chain.readHint");
    a.addEventListener("click", () => ui.openReading!(x));
    acts.appendChild(a);
  }
  if (res && propertyOfExtractor(doc, x)) {
    const u = el("button", "tv-act", t("chain.useValue"));
    u.type = "button";
    u.title = res;
    u.addEventListener("click", () => ui.useAsValue(x));
    acts.appendChild(u);
  }
  if (acts.childNodes.length) desc.appendChild(acts);
  wrap.appendChild(desc);
  return wrap;
}

/** The card of one property, as seen from `ownerId`. */
export function propertyCard(ui: ChainUi, propertyId: string, ownerId: string | null): HTMLElement {
  const store = ui.store;
  const doc = store.doc;
  const p = store.node(propertyId);
  const card = el("div", "chain-card");
  card.dataset.property = propertyId;
  const owners = ownersOf(doc, propertyId);
  const orig = owners.find((o) => o.original)?.owner ?? null;
  const heir = !!ownerId && owners.length > 1 && orig !== ownerId
    && !!owners.find((o) => o.owner === ownerId)?.inherited;
  if (owners.length > 1) {
    const tag = el("div", "chain-shared");
    tag.appendChild(el("span", "", heir ? `⟲ ${t("chain.inheritedFrom")} ` : `⟲ ${t("chain.sharedWith")} `));
    const others = heir && orig ? [orig] : owners.map((o) => o.owner).filter((o) => o !== ownerId);
    others.forEach((o, i) => {
      if (i) tag.append(" · ");
      tag.appendChild(linkBtn(ui, o));
    });
    card.appendChild(tag);
    if (heir) card.classList.add("heir");
  }
  const head = el("div", "chain-prop");
  head.appendChild(linkBtn(ui, propertyId, "p"));
  const val = el("input", "chain-value");
  val.value = propertyValue(p);
  val.placeholder = t("chain.valuePh");
  // an heir instances the property: the value is corrected where it was made
  if (heir) { val.readOnly = true; val.title = t("chain.heirValue"); }
  val.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") val.blur(); });
  val.addEventListener("change", () => {
    if (val.value.trim() !== propertyValue(store.node(propertyId))) store.setPropertyValue(propertyId, val.value);
  });
  head.appendChild(val);
  const chip = ui.aiChip?.(propertyId);
  if (chip) head.appendChild(chip);
  card.appendChild(head);

  const prov = provenanceOf(doc, propertyId);
  for (const c of prov.combiners) {
    const row = el("div", "chain-row comb");
    row.append(el("span", "chain-ar", "└"), linkBtn(ui, c, "c"));
    const d = String(store.node(c)?.description ?? "");
    if (d) row.appendChild(el("span", "chain-d", d));
    card.appendChild(row);
    for (const x of prov.combined.get(c) ?? []) card.appendChild(readingRow(ui, x, 1));
  }
  for (const x of prov.direct) card.appendChild(readingRow(ui, x, 0));
  if (!extractorsOfProperty(doc, propertyId).length)
    card.appendChild(el("p", "chain-note", t("chain.noReading")));
  if (ui.addReading && !heir) {
    const acts = el("div", "chain-card-acts");
    const b = el("button", "insp-btn", prov.direct.length && !prov.combiners.length
      ? t("chain.addSource") : t("chain.addReading"));
    b.type = "button";
    b.dataset.addReading = propertyId;
    b.addEventListener("click", () => ui.addReading!(propertyId, b));
    acts.appendChild(b);
    card.appendChild(acts);
    if (prov.direct.length && !prov.combiners.length)
      card.appendChild(el("p", "chain-note", t("chain.combinerHint")));
  }
  return card;
}

/**
 * Draw the chain section for the selected node into the inspector host, just
 * before «Connections». Returns false when the node has no chain to show.
 */
export function renderChainSection(host: HTMLElement, ui: ChainUi, nodeId: string): boolean {
  host.querySelector(".insp-chain")?.remove();
  const store = ui.store;
  const node = store.node(nodeId);
  if (!node) return false;
  const sec = el("section", "insp-chain");
  const doc = store.doc;
  if (node.node_type === "extractor") {
    sec.appendChild(el("h3", "insp-sect", t("chain.reading")));
    sec.appendChild(readingRow(ui, nodeId, 0, true));
  } else if (node.node_type === "combiner") {
    sec.appendChild(el("h3", "insp-sect", t("chain.reasoning")));
    const p = doc.graph.edges.find((e) => e.target === nodeId && e.edge_type === "has_data_provenance")?.source;
    if (p) sec.appendChild(propertyCard(ui, p, null));
  } else if (node.node_type === "property") {
    sec.appendChild(el("h3", "insp-sect", t("chain.chain")));
    sec.appendChild(propertyCard(ui, nodeId, null));
  } else if (ui.canOwnProperty(node.node_type)) {
    const props = propertiesOf(doc, nodeId);
    sec.appendChild(el("h3", "insp-sect", t("chain.paradata", { n: String(props.length) })));
    if (!props.length) sec.appendChild(el("p", "chain-note", t("chain.noProperty")));
    for (const p of props) sec.appendChild(propertyCard(ui, p, nodeId));
    if (ui.isUnit(node.node_type)) {
      const acts = el("div", "chain-card-acts");
      const b = el("button", "insp-btn", t("chain.inherit"));
      b.type = "button";
      b.title = t("chain.inheritHint");
      b.dataset.inherit = nodeId;
      b.addEventListener("click", () => ui.inherit(nodeId, b));
      acts.appendChild(b);
      sec.appendChild(acts);
    }
    if (node.node_type === "document") {
      const reads = readingsOfDocument(doc, nodeId);
      sec.appendChild(el("h3", "insp-sect", t("chain.readingsOf", { n: String(reads.length) })));
      for (const x of reads) sec.appendChild(readingRow(ui, x, 0, true));
      ui.documentExtras?.(sec, nodeId);
    }
  } else return false;
  const conn = [...host.querySelectorAll("h3.insp-sect")].find((h) => h.textContent === "Connections");
  if (conn) conn.before(sec);
  else host.appendChild(sec);
  return true;
}
