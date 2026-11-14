/**
 * MICRO-A-PROPRIO-EREDITATO (E.D., 14 Nov 2026) · the Inspector says, for every
 * node, which values are ITS OWN and which it INHERITS, and from which node:
 * start, end, author, licence, embargo — the own value in plain ink, the
 * inherited one in orange with «da <nodo>» (a click goes there) and «via
 * <nodo>» when the hop passes through a master, a Document, a container, a
 * member. An inherited value is not edited here: «Rendi proprio…» copies it on
 * the node, an explicit gesture, one step of undo.
 *
 * And the epochs: a servile node shows the epochs of its master, inherited,
 * without Move / Extend; a unit shows the epochs of its LIFE (the continuity
 * rule), read-only, with «perché». The own epoch edges the rule makes
 * redundant are said, with «Pulisci» (a preview, one step of undo).
 *
 * The readings are `provenance.ts` (s3Dgraphy's rules); this file draws them.
 */
import { t } from "./i18n";
import { helpGlyph } from "./help-glyph";
import type { DocumentStore } from "./model";
import { allowedEdgeTypes } from "./rules";
import { askConfirm } from "./app-dialog";
import {
  actTime, epochAttribution, mastersOf, PROV_RULES, provIndex, redundancyReport, resolveProvenance, servileKind,
  unitLife, isLifeBearing, type LaneEdge, type Prov, type ProvIndex, type ProvRule, type RedundantRec,
} from "./provenance";

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const fmtValue = (v: Prov["value"]): string => (v == null ? "" : typeof v === "number" ? String(Math.round(v * 1000) / 1000) : v);

/** per document revision, one index (the Inspector redraws often) */
let cached: { doc: unknown; rev: number; ix: ProvIndex } | null = null;
export function provIndexOf(store: DocumentStore): ProvIndex {
  const rev = (store as unknown as { rev?: number }).rev ?? -1;
  if (cached && cached.doc === store.doc && cached.rev === rev && rev >= 0) return cached.ix;
  const ix = provIndex(store.doc);
  cached = { doc: store.doc, rev, ix };
  return ix;
}

/** «da II A.D. · via SU001» — the words of an inherited value */
export function provSource(ix: ProvIndex, p: Prov): string {
  if (p.level === "node") return t("pv.own");
  const from = t("pv.from", { node: ix.name(p.origin) });
  return p.via && p.via !== p.origin ? `${from} · ${t("pv.via", { node: ix.name(p.via) })}` : from;
}

/** the tooltip / Tabular words of one rule: «Inizio 100 — da II A.D. (la sua epoca)» */
export function provTitle(ix: ProvIndex, rule: ProvRule, p: Prov): string {
  if (p.value == null) return `${t(`pv.rule.${rule}`)}: ${t("pv.none")}`;
  return `${t(`pv.rule.${rule}`)}: ${fmtValue(p.value)} — ${provSource(ix, p)}`
    + (p.level && p.level !== "node" ? ` (${t(`pv.level.${p.level}`)})` : "");
}

/** what «Rendi proprio» would write, or why not */
function makeOwnPlan(store: DocumentStore, ix: ProvIndex, id: string, rule: ProvRule, p: Prov): { ok: boolean; why?: string; run?: () => void } {
  const n = ix.node(id)!;
  const rn = t(`pv.rule.${rule}`);
  if (rule === "absolute_time_start" || rule === "absolute_time_end") {
    if (servileKind(n) === "servile") return { ok: false, why: t("pv.makeOwnServile", { rule: rn }) };
    // a unit's end is its continuity's: it is dated there, not copied here
    if (p.level === "life") return { ok: false, why: t("pv.makeOwnLife") };
    if (!allowedEdgeTypes(n.node_type, "property").includes("has_property")) return { ok: false, why: t("pv.makeOwnNotAllowed", { type: n.node_type }) };
    return { ok: true, run: () => {
      const pos = (store.doc.layout as { positions?: Record<string, { x: number; y: number }> } | undefined)?.positions?.[id];
      const prop = store.addNode({ id: store.newId(), name: rule, node_type: "property", description: fmtValue(p.value),
        data: { property_type: rule, value: fmtValue(p.value) } }, pos ? { x: pos.x + 30, y: pos.y + 60, w: 160, h: 40 } : undefined);
      store.addEdge(id, prop.id, "has_property");
    } };
  }
  const et = rule === "author" ? "has_author" : rule === "license" ? "has_license" : "has_embargo";
  const types = rule === "author" ? ["author", "author_ai"] : [rule];
  // the nodes that carry the value on its origin: its own edges, or the
  // graph-scope members when the origin is the graph
  const holders: string[] = [];
  if (p.origin && p.level !== "graph") {
    for (const e of ix.out.get(p.origin) ?? []) if (e.edge_type === et && types.includes(ix.nt(e.target))) holders.push(e.target);
  } else if (ix.graphSelf) {
    for (const pdg of ix.targets(ix.graphSelf, "has_paradata_nodegroup"))
      for (const m of ix.sources(pdg, "is_in_paradata_nodegroup")) if (types.includes(ix.nt(m))) holders.push(m);
  }
  const hs = rule === "author" ? holders : holders.slice(0, 1);
  if (!hs.length) return { ok: false, why: t("pv.makeOwnNoHolder") };
  if (!hs.every((h) => allowedEdgeTypes(n.node_type, ix.nt(h)).includes(et))) return { ok: false, why: t("pv.makeOwnNotAllowed", { type: n.node_type }) };
  return { ok: true, run: () => { for (const h of hs) if (!store.hasEdge(id, h, et)) store.addEdge(id, h, et); } };
}

/** «Proprio / ereditato»: one row per rule (and the act of an extractor) */
export function renderProvenance(root: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const ix = provIndexOf(store);
  const n = ix.node(id);
  if (!n || n.node_type === "EpochNode") return;
  const h = el("h3", "insp-sect", t("pv.sect"));
  h.append(" ", helpGlyph(t("pv.help"), "provenance"));
  root.appendChild(h);
  const box = el("div", "insp-propagative insp-provenance");
  box.dataset.provenance = id;
  for (const rule of PROV_RULES) {
    const p = resolveProvenance(ix, id, rule);
    const own = p.level === "node";
    const row = el("div", `insp-prop-row insp-prov-row${p.value == null ? " insp-prov-none" : own ? " insp-prop-own" : " insp-prov-inherited"}`);
    row.dataset.rule = rule;
    row.dataset.level = p.level ?? "";
    row.dataset.origin = p.origin ?? "";
    row.dataset.value = p.value == null ? "" : String(p.value);
    row.title = provTitle(ix, rule, p);
    row.appendChild(el("span", "insp-prop-rule", t(`pv.rule.${rule}`)));
    let shown = p.value == null ? t("pv.none") : fmtValue(p.value);
    if (rule === "absolute_time_end" && p.status) shown += ` · ${t(`pv.status.${p.status}`, { epoch: ix.name(unitLife(ix, id).end_epoch) })}`;
    row.appendChild(el("span", "insp-prop-value", shown));
    if (p.value != null) {
      if (own) row.appendChild(el("span", "insp-prop-source", t("pv.own")));
      else {
        const src = el("span", "insp-prov-src");
        const go = (target: string | null, words: string): void => {
          if (!target) { src.appendChild(el("span", "insp-prov-from", words)); return; }
          const b = el("button", "insp-prov-from insp-link", words) as HTMLButtonElement;
          b.type = "button";
          b.dataset.go = target;
          b.title = t("pv.goTitle", { node: ix.name(target) });
          b.addEventListener("click", () => onJump(target));
          src.appendChild(b);
        };
        go(p.origin, t("pv.from", { node: ix.name(p.origin) }));
        if (p.via && p.via !== p.origin) go(p.via, t("pv.via", { node: ix.name(p.via) }));
        row.appendChild(src);
        const plan = makeOwnPlan(store, ix, id, rule, p);
        const mk = el("button", "insp-btn insp-prov-own", t("pv.makeOwn")) as HTMLButtonElement;
        mk.type = "button";
        mk.dataset.makeOwn = rule;
        // a value that cannot be made own (a servile's date, an edge the
        // datamodel refuses) has no button: the row's title says why
        if (!plan.ok) { mk.disabled = true; mk.hidden = true; row.title += ` · ${plan.why ?? ""}`; }
        else {
          mk.title = t("pv.makeOwnTitle");
          mk.addEventListener("click", () => {
            void askConfirm(t("pv.makeOwnAsk", { value: fmtValue(p.value), node: ix.name(id), rule: t(`pv.rule.${rule}`), origin: ix.name(p.origin) }),
              { kind: "make-own", ok: t("pv.makeOwnOk") }).then((yes) => { if (yes) store.batch(() => plan.run!()); });
          });
        }
        row.appendChild(mk);
      }
    }
    box.appendChild(row);
  }
  if (n.node_type === "extractor" || n.node_type === "combiner") {
    const a = actTime(n);
    const has = a.start != null || a.end != null;
    const row = el("div", `insp-prop-row insp-prov-row${has ? " insp-prop-own" : " insp-prov-none"}`);
    row.dataset.rule = "act";
    row.title = t("pv.actTitle");
    row.append(el("span", "insp-prop-rule", t("pv.act")),
      el("span", "insp-prop-value", has ? [a.start, a.end].filter(Boolean).join(" – ") : t("pv.actNone")));
    box.appendChild(row);
  }
  root.appendChild(box);
}

/** «Pulisci» for a set of redundant records: a preview, then one step of undo */
export async function cleanRedundant(store: DocumentStore, recs: RedundantRec[]): Promise<boolean> {
  const edges: LaneEdge[] = recs.flatMap((r) => r.edges);
  if (!edges.length) return false;
  const ix = provIndexOf(store);
  const lines = recs.slice(0, 12).map((r) => `· ${r.name}: ${r.epochs.map((e) => ix.name(e)).join(", ")}`
    + (r.master_name ? ` — ${t("pv.followsMaster", { master: r.master_name })}` : ""));
  if (recs.length > 12) lines.push(`… +${recs.length - 12}`);
  const ok = await askConfirm(`${t("pv.cleanAsk", { n: String(edges.length), nodes: String(recs.length) })}\n${lines.join("\n")}`,
    { kind: "clean-redundant", ok: t("pv.clean") });
  if (!ok) return false;
  store.batch(() => { for (const e of edges) store.deleteEdge({ source: e.source, target: e.target, edge_type: e.edge_type }); });
  return true;
}

/** the Epochs of a servile node (inherited from its master) or of a unit (its
 *  life), read-only; null for the others (they keep the section of moves) */
export function renderInheritedEpochs(store: DocumentStore, id: string, onJump: (id: string) => void): HTMLElement | null {
  const ix = provIndexOf(store);
  const n = ix.node(id);
  if (!n) return null;
  const servile = servileKind(n) === "servile";
  const unit = isLifeBearing(n);
  if (!servile && !unit) return null;
  const a = epochAttribution(ix, id);
  const sec = el("div", "insp-epochs insp-epochs-inherited");
  sec.dataset.epochsInherited = servile ? "servile" : "life";
  const h = el("h3", "insp-sect", t("ep.sect"));
  h.append(" ", helpGlyph(t(servile ? "pv.epServileHelp" : "pv.epLifeHelp"), "epochs-inherited"));
  sec.appendChild(h);
  const say = el("p", "insp-hint insp-ep-follows");
  if (servile) {
    const ms = mastersOf(ix, id).filter((m) => m.id !== id);
    if (a.level === "master" && a.origin) {
      say.append(t("pv.epFrom") + " ");
      const b = el("button", "insp-link insp-prov-from", ix.name(a.origin)) as HTMLButtonElement;
      b.type = "button"; b.dataset.go = a.origin;
      b.addEventListener("click", () => onJump(a.origin!));
      say.appendChild(b);
      if (ms.length > 1) say.append(` ${t("pv.epUnion", { n: String(ms.length) })}`);
    } else say.textContent = ms.length ? t("pv.epMasterNoEpoch", { master: ix.name(ms[0].id) }) : (a.epochs.length ? t("pv.epOrphan") : t("ep.noEpoch"));
  } else {
    const life = unitLife(ix, id);
    say.textContent = t("pv.epWhy", { why: life.why || t("pv.none") });
    say.dataset.lifeStatus = life.status;
  }
  sec.appendChild(say);
  const list = el("div", "insp-ep-list");
  const life = unit ? unitLife(ix, id) : null;
  for (const e of a.epochs) {
    const row = el("div", `insp-ep-row${a.level === "node" ? "" : " insp-prov-inherited"}`);
    row.dataset.epoch = e;
    const lab = el("button", "insp-link insp-ep-name here", `✓ ${ix.name(e)}`) as HTMLButtonElement;
    lab.type = "button";
    lab.addEventListener("click", () => onJump(e));
    row.appendChild(lab);
    if (life) row.appendChild(el("span", "insp-ep-state", t(e === life.birth ? "pv.lifeBorn" : e === life.end_epoch ? "pv.lifeEnds" : "pv.lifeLives")));
    else row.appendChild(el("span", "insp-ep-state", t("pv.inherited")));
    list.appendChild(row);
  }
  sec.appendChild(list);
  // the edges the rule makes redundant (and, for a unit, those it contradicts)
  const rep = redundancyReport(ix);
  const mine = (xs: RedundantRec[]): RedundantRec[] => xs.filter((r) => r.id === id);
  const red = [...mine(rep.servile), ...mine(rep.survive)];
  const differs = mine(rep.servile_differs);
  const contra = mine(rep.survive_contradicting);
  for (const [recs, key] of [[red, "pv.redundant"], [differs, "pv.servileDiffers"]] as const) {
    if (!recs.length) continue;
    const p = el("p", "insp-hint insp-prov-redundant");
    p.dataset.redundant = key;
    p.textContent = t(key, { epochs: recs.flatMap((r) => r.epochs).map((e) => ix.name(e)).join(", ") }) + " ";
    const b = el("button", "insp-btn", t("pv.clean")) as HTMLButtonElement;
    b.type = "button"; b.dataset.clean = id;
    b.addEventListener("click", () => { void cleanRedundant(store, recs as RedundantRec[]); });
    p.appendChild(b);
    sec.appendChild(p);
  }
  if (contra.length) {
    const p = el("p", "insp-hint insp-prov-contra");
    p.textContent = t("pv.contradicting", { epochs: contra.flatMap((r) => r.epochs).map((e) => ix.name(e)).join(", ") });
    sec.appendChild(p);
  }
  return sec;
}
