/**
 * MICRO-MF05 (E.D., 22 Nov 2026) · THE JAR (A2 of the decisions on the
 * landscape graph: «il barattolo è possibile proprio perché le Matrix sono
 * affiancate»). The gestures that MAKE the functional reading:
 *
 *   · a unit dragged from the Matrix into a brace of the Functional Matrix →
 *     the membership (`is_in_functional_unit`); the master stays where it is,
 *     the Functional Matrix draws its instance;
 *   · an instance dragged from one brace to another → the membership MOVES;
 *     with Alt (⌥) held at the release it is COPIED (the wall of two rooms);
 *   · at the release, the check of coherence (the bridge's answer, a toast);
 *   · a multiple selection + «Read as…»: choose a functional unit or make
 *     one (name, scale, function from the vocabulary, first epoch, inside);
 *   · in the Space: the lasso on the proxies + «New functional unit».
 *
 * EMBARGO (MICRO-SEG30): part of the function `functional-matrix`. This
 * module is reached ONLY through `FM_ON` in main.ts (rule 4 of the register),
 * its texts (`jar.*`) live in the `LAB_TEXTS` blocks of i18n.ts.
 *
 * What is here is PURE (no store, no DOM but the dialog's body): which
 * memberships a gesture writes, which it refuses and why, the default first
 * epoch of a new unit, the point-in-polygon of the lasso. main.ts applies the
 * plan as ONE step of the store (undo / redo), with the paradata of the
 * reading (an extractor under the unit's function: the person who reads and the
 * day, `has_author` and `data.act_start`). Its source is NOT the members: an
 * extractor `extracted_from` a member closes a loop member → unit → function →
 * extractor → member, which the Matrix's check of cycles warns about at every
 * gesture (measured on the villa → castle, 22 Nov 2026). The members are the
 * memberships themselves; a document, when there is one, is added by hand
 * («+ lettura»), as for any reading.
 */

export const MEMBER_EDGE = "is_in_functional_unit";
export const FU_TYPE = "FunctionalUnitNodeGroup";
/** the scales of a functional unit (LG2, `data.scale`), from the widest */
export const SCALES = ["territory", "complex", "building", "room", "component"] as const;

export interface JarNode { id: string; node_type?: string; name?: string | null; data?: unknown; description?: string | null }
export interface JarEdge { id?: string; edge_type?: string; source: string; target: string }
export interface JarDoc { nodes: ReadonlyArray<JarNode>; edges: ReadonlyArray<JarEdge> }

/** why a unit cannot enter a functional unit */
export type JarRefusal = "type" | "self" | "cycle" | "missing";

export interface JarPlan {
  /** the members the gesture links (`member → unit`) */
  add: string[];
  /** already members: nothing to write */
  already: string[];
  /** the units refused, each with why */
  refused: Array<{ id: string; why: JarRefusal }>;
  /** a move: the memberships the gesture takes away (`member → from`) */
  remove: Array<{ member: string; from: string }>;
}

const isFu = (n: JarNode | undefined): boolean => n?.node_type === FU_TYPE;

function nodeMap(doc: JarDoc): Map<string, JarNode> {
  return new Map(doc.nodes.map((n) => [n.id, n]));
}

/** does `member → unit` exist? */
export function isMember(doc: JarDoc, member: string, unit: string): boolean {
  return doc.edges.some((e) => e.edge_type === MEMBER_EDGE && e.source === member && e.target === unit);
}

/** the functional units a node is a member of (the direct ones) */
export function unitsOf(doc: JarDoc, member: string): string[] {
  return doc.edges.filter((e) => e.edge_type === MEMBER_EDGE && e.source === member).map((e) => e.target);
}

/** the functional units nested in `unit` (itself included), by the same edge */
function nestedIn(doc: JarDoc, unit: string, by: Map<string, JarNode>): Set<string> {
  const out = new Set<string>();
  const todo = [unit];
  while (todo.length) {
    const cur = todo.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const e of doc.edges)
      if (e.edge_type === MEMBER_EDGE && e.target === cur && isFu(by.get(e.source))) todo.push(e.source);
  }
  return out;
}

/**
 * A gesture on `members` toward `unit`: «add» (the Matrix's drag, «Read as…»,
 * the lasso), «move» (an instance from `from` to `unit`), «copy» (the same with
 * Alt). `canBeMember(type)` is the datamodel's word (rules.ts
 * `allowedEdgeTypes`, the source classes of `is_in_functional_unit`). A
 * functional unit may enter another one (a room in the building), never one
 * nested in itself.
 */
export function planJar(doc: JarDoc, members: readonly string[], unit: string,
                        canBeMember: (type: string | undefined) => boolean,
                        gesture: { kind: "add" | "move" | "copy"; from?: string | null } = { kind: "add" }): JarPlan {
  const by = nodeMap(doc);
  const plan: JarPlan = { add: [], already: [], refused: [], remove: [] };
  if (!isFu(by.get(unit))) {
    for (const m of members) plan.refused.push({ id: m, why: "missing" });
    return plan;
  }
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m)) continue;
    seen.add(m);
    const n = by.get(m);
    if (!n) { plan.refused.push({ id: m, why: "missing" }); continue; }
    if (m === unit) { plan.refused.push({ id: m, why: "self" }); continue; }
    if (!canBeMember(n.node_type)) { plan.refused.push({ id: m, why: "type" }); continue; }
    if (isFu(n) && nestedIn(doc, m, by).has(unit)) { plan.refused.push({ id: m, why: "cycle" }); continue; }
    if (isMember(doc, m, unit)) plan.already.push(m);
    else plan.add.push(m);
    if (gesture.kind === "move" && gesture.from && gesture.from !== unit && isMember(doc, m, gesture.from))
      plan.remove.push({ member: m, from: gesture.from });
  }
  return plan;
}

/** the members a selection offers to «Read as…»: the nodes that can be members */
export function jarCandidates(doc: JarDoc, ids: readonly string[],
                              canBeMember: (type: string | undefined) => boolean): string[] {
  const by = nodeMap(doc);
  return [...new Set(ids)].filter((id) => { const n = by.get(id); return !!n && canBeMember(n.node_type); });
}

/** the functional units of the graph, for the chooser: name, scale, id */
export function functionalUnits(doc: JarDoc): Array<{ id: string; name: string; scale: string | null }> {
  return doc.nodes.filter(isFu).map((n) => ({
    id: n.id, name: String(n.name ?? n.id),
    scale: typeof (n.data as { scale?: unknown } | undefined)?.scale === "string" ? String((n.data as { scale: string }).scale) : null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/** the values of `primary_function` the graph already uses (the chooser's
 *  first suggestions, before the vocabulary) */
export function functionsInUse(doc: JarDoc): string[] {
  const out = new Set<string>();
  for (const n of doc.nodes) {
    if (n.node_type !== "property") continue;
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (n.name !== "primary_function" && d.property_type !== "primary_function") continue;
    const v = String(d.value ?? n.description ?? "").trim();
    if (v) out.add(v);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** the `primary_function` property of a functional unit (`has_property`), or null */
export function functionProperty(doc: JarDoc, unit: string): string | null {
  const by = nodeMap(doc);
  for (const e of doc.edges) {
    if (e.edge_type !== "has_property" || e.source !== unit) continue;
    const p = by.get(e.target);
    const d = (p?.data ?? {}) as Record<string, unknown>;
    if (p?.node_type === "property" && (p.name === "primary_function" || d.property_type === "primary_function")) return p.id;
  }
  return null;
}

/**
 * The first epoch of a NEW functional unit made of `members`: the one they
 * share; else the most recent of their first epochs — the unit is when all its
 * members are (a castle with a Roman wall among its members is medieval).
 * `firstEpoch(id)` is the store's; `order` the epochs from the most recent
 * (the lanes of the Matrix). Null: none of them has one.
 */
export function defaultEpoch(members: readonly string[], firstEpoch: (id: string) => string | null,
                             order: readonly string[]): string | null {
  const eps = [...new Set(members.map(firstEpoch).filter((e): e is string => !!e))];
  if (!eps.length) return null;
  if (eps.length === 1) return eps[0];
  const rank = (e: string) => { const i = order.indexOf(e); return i < 0 ? Infinity : i; };
  return [...eps].sort((a, b) => rank(a) - rank(b))[0];
}

/** the name of a new unit when the person writes none: its function, else «FU <n>» */
export function defaultName(fn: string, doc: JarDoc): string {
  const f = fn.trim();
  if (f) return f;
  const used = new Set(doc.nodes.filter(isFu).map((n) => String(n.name ?? "")));
  let n = 1;
  while (used.has(`FU ${n}`)) n++;
  return `FU ${n}`;
}

/** the day of the reading, as the datamodel dates an author's act (`act_start`) */
export function today(now: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * The reading of THIS person on THIS day of a unit's members, when there is
 * one: the extractor under the unit's `primary_function` (directly or under its
 * combiner) dated `act_start` today, signed by `author` (none: unsigned), with
 * no source of its own (a reading from a document is another reading). A second
 * gesture of the same day is the same reading: no second extractor.
 */
export function readingOfToday(doc: JarDoc, propertyId: string, author: string | null, day: string): string | null {
  const by = nodeMap(doc);
  const under = new Set<string>();
  for (const e of doc.edges) if (e.edge_type === "has_data_provenance" && e.source === propertyId) under.add(e.target);
  for (const c of [...under]) if (by.get(c)?.node_type === "combiner")
    for (const e of doc.edges) if (e.edge_type === "combines" && e.source === c) under.add(e.target);
  for (const x of under) {
    const n = by.get(x);
    if (n?.node_type !== "extractor") continue;
    if (String(((n.data ?? {}) as Record<string, unknown>).act_start ?? "") !== day) continue;
    const authors = doc.edges.filter((e) => e.edge_type === "has_author" && e.source === x).map((e) => e.target);
    if (author ? !authors.includes(author) : authors.length > 0) continue;
    if (doc.edges.some((e) => e.edge_type === "extracted_from" && e.source === x)) continue;
    return x;
  }
  return null;
}

/** The lasso: is a point inside the polygon (screen pixels)? Even-odd rule. */
export function insidePolygon(p: { x: number; y: number }, poly: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** the units of the Space's selection keys (`proxy:<unit>`), in order */
export function unitsOfSpaceKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((k) => k.startsWith("proxy:")).map((k) => k.slice(6)))];
}

// ── «Read as…»: the dialog's body ───────────────────────────────────────────

export interface ReadAsChoice {
  /** an existing unit, or a new one */
  mode: "existing" | "new";
  unit: string | null;
  name: string;
  scale: string;
  fn: string;
  /** a term of an installed vocabulary chosen for the function */
  term: { concept: string; label: string; lang: string; vocabulary?: string; version?: string } | null;
  epoch: string | null;
  parent: string | null;
}

export interface ReadAsVocabCandidate { uri: string; label: string; lang: string; vocabulary: string; version?: string; match: string }

export interface ReadAsForm {
  body: HTMLElement;
  /** what the form says now (read at «OK») */
  choice(): ReadAsChoice;
}

/**
 * The body of «Read as…»: who (the members, how many refused and why), WHAT
 * (an existing functional unit, or a new one with its name, scale, function —
 * the graph's values and the installed vocabularies' terms —, first epoch and
 * the unit it is inside). `search` asks the vocabularies (VocabState.search,
 * quale `primary_function`); null: none installed / no bridge.
 */
export function readAsForm(o: {
  doc: Document;
  t: (k: string, v?: Record<string, string | number>) => string;
  members: Array<{ id: string; name: string }>;
  refused: Array<{ id: string; name: string; why: JarRefusal }>;
  units: Array<{ id: string; name: string; scale: string | null }>;
  functions: string[];
  epochs: Array<{ id: string; name: string }>;
  epoch: string | null;
  preferNew: boolean;
  search: ((text: string) => Promise<ReadAsVocabCandidate[]>) | null;
}): ReadAsForm {
  const { doc, t } = o;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const body = el("div", "jar-form");
  body.dataset.jarForm = "1";
  const who = el("p", "jar-who", t("jar.form.members", { n: o.members.length,
    list: o.members.slice(0, 12).map((m) => m.name).join(", ") + (o.members.length > 12 ? "…" : "") }));
  body.appendChild(who);
  if (o.refused.length) {
    const r = el("p", "jar-refused", t("jar.form.refused", { n: o.refused.length,
      list: o.refused.slice(0, 8).map((x) => `${x.name} (${t(`jar.why.${x.why}`)})`).join(", ") }));
    r.dataset.jarRefused = String(o.refused.length);
    body.appendChild(r);
  }
  const radio = (value: "existing" | "new", label: string): HTMLInputElement => {
    const lab = el("label", "jar-mode");
    const r = el("input");
    r.type = "radio"; r.name = "jar-mode"; r.value = value; r.dataset.jarMode = value;
    lab.append(r, ` ${label}`);
    body.appendChild(lab);
    return r;
  };
  // an existing unit
  const rEx = radio("existing", t("jar.form.existing"));
  const sel = el("select", "jar-unit");
  sel.dataset.jarUnit = "1";
  for (const u of o.units) {
    const op = el("option", undefined, `${u.name}${u.scale ? ` · ${t(`fm.scale.${u.scale}`)}` : ""}`);
    op.value = u.id;
    sel.appendChild(op);
  }
  body.appendChild(sel);
  // a new one
  const rNew = radio("new", t("jar.form.new"));
  const grid = el("div", "jar-grid");
  const field = (label: string, input: HTMLElement): void => {
    const l = el("label", "jar-field");
    l.append(el("span", "jar-k", label), input);
    grid.appendChild(l);
  };
  const name = el("input");
  name.type = "text"; name.dataset.jarName = "1"; name.placeholder = t("jar.form.namePh");
  field(t("jar.form.name"), name);
  const scale = el("select");
  scale.dataset.jarScale = "1";
  for (const s of SCALES) { const op = el("option", undefined, t(`fm.scale.${s}`)); op.value = s; scale.appendChild(op); }
  scale.value = "room";
  field(t("jar.form.scale"), scale);
  // the function: the graph's values as a datalist, the vocabulary on request
  const fnWrap = el("span", "jar-fn");
  const fn = el("input");
  fn.type = "text"; fn.dataset.jarFn = "1"; fn.placeholder = t("jar.form.fnPh");
  const listId = `jar-fns-${Math.random().toString(36).slice(2, 8)}`;
  const dl = el("datalist");
  dl.id = listId;
  for (const f of o.functions) { const op = el("option"); op.value = f; dl.appendChild(op); }
  fn.setAttribute("list", listId);
  const look = el("button", "jar-vocab", t("jar.form.vocab"));
  look.type = "button"; look.dataset.jarVocab = "1";
  look.disabled = !o.search;
  if (!o.search) look.title = t("jar.form.vocabNone");
  fnWrap.append(fn, dl, look);
  field(t("jar.form.fn"), fnWrap);
  const cands = el("div", "jar-cands");
  cands.dataset.jarCands = "1";
  grid.appendChild(cands);
  let term: ReadAsChoice["term"] = null;
  let found: ReadAsVocabCandidate[] = [];
  const drawCands = (msg: string | null): void => {
    cands.textContent = "";
    if (msg) { cands.appendChild(el("span", "jar-cands-none", msg)); return; }
    found.forEach((c, i) => {
      const l = el("label", "jar-cand");
      const r = el("input");
      r.type = "radio"; r.name = "jar-cand"; r.value = String(i); r.dataset.jarCand = c.uri;
      r.addEventListener("change", () => {
        term = { concept: c.uri, label: fn.value.trim() || c.label, lang: c.lang, vocabulary: c.vocabulary, ...(c.version ? { version: c.version } : {}) };
        if (!fn.value.trim()) fn.value = c.label;
      });
      l.append(r, ` ${c.label}${c.lang ? ` (${c.lang})` : ""} · ${c.vocabulary}`);
      cands.appendChild(l);
    });
    const none = el("label", "jar-cand");
    const r0 = el("input");
    r0.type = "radio"; r0.name = "jar-cand"; r0.value = "-1"; r0.checked = true; r0.dataset.jarCand = "";
    r0.addEventListener("change", () => { term = null; });
    none.append(r0, ` ${t("jar.form.noTerm")}`);
    cands.appendChild(none);
  };
  look.addEventListener("click", () => {
    if (!o.search) return;
    const q = fn.value.trim();
    if (!q) { drawCands(t("jar.form.vocabEmpty")); return; }
    look.disabled = true;
    void o.search(q).then((c) => {
      found = c;
      term = null;
      drawCands(c.length ? null : t("jar.form.vocabNothing", { q }));
    }).catch(() => drawCands(t("jar.form.vocabNone"))).finally(() => { look.disabled = false; });
  });
  fn.addEventListener("input", () => { if (term) term = { ...term, label: fn.value.trim() || term.label }; });
  const epoch = el("select");
  epoch.dataset.jarEpoch = "1";
  { const op = el("option", undefined, t("jar.form.noEpoch")); op.value = ""; epoch.appendChild(op); }
  for (const e of o.epochs) { const op = el("option", undefined, e.name); op.value = e.id; epoch.appendChild(op); }
  epoch.value = o.epoch ?? "";
  field(t("jar.form.epoch"), epoch);
  const parent = el("select");
  parent.dataset.jarParent = "1";
  { const op = el("option", undefined, t("jar.form.noParent")); op.value = ""; parent.appendChild(op); }
  for (const u of o.units) { const op = el("option", undefined, u.name); op.value = u.id; parent.appendChild(op); }
  field(t("jar.form.parent"), parent);
  body.appendChild(grid);
  const note = el("p", "jar-note", t("jar.form.note"));
  body.appendChild(note);
  const sync = (): void => {
    const isNew = rNew.checked;
    sel.disabled = isNew;
    for (const x of grid.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button"))
      x.disabled = !isNew || (x === look && !o.search);
  };
  if (o.preferNew || !o.units.length) rNew.checked = true; else rEx.checked = true;
  if (!o.units.length) { rEx.disabled = true; sel.disabled = true; }
  rEx.addEventListener("change", sync);
  rNew.addEventListener("change", sync);
  sync();
  return {
    body,
    choice: () => ({
      mode: rNew.checked ? "new" : "existing",
      unit: rNew.checked ? null : sel.value || null,
      name: name.value.trim(),
      scale: scale.value,
      fn: fn.value.trim(),
      term: term ? { ...term, label: fn.value.trim() || term.label } : null,
      epoch: epoch.value || null,
      parent: parent.value || null,
    }),
  };
}
