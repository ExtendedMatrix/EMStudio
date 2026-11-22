/**
 * MICRO-MF07 (E.D., 22 Nov 2026: «Accetto la scrivania in tutte le sue parti,
 * sviluppala») · THE PROPOSALS — a type of area of the workspace Functional.
 *
 * EMBARGO (MICRO-SEG30): the function `functional-workspace` of the register
 * (features.ts) is under embargo. This module is reached ONLY through
 * `featureOn("functional-workspace")` / `LAB`; its texts live in the
 * `LAB_TEXTS` blocks of i18n.ts.
 *
 * Two sources, kept apart (s3Dgraphy `functional_proposals`, through the
 * bridge's lab route `POST /functional-proposals`):
 *
 *   1. FROM THE ACTIVITIES — deterministic: one brace per activity with its
 *      members, asked as soon as the area is open;
 *   2. AI — with the AI service EMStudio already uses (the AI drafts of the
 *      Narrative: provider and model of the Preferences, the key in the
 *      bridge's memory), on the selection or on the whole graph. It reads the
 *      units' descriptions, the activities, the nearness of the footprints,
 *      the Narrative's prose and the identities of the Landscape Matrix bound
 *      to the graph; it gives back units with name, scale, function,
 *      container, members (shared too) and WHY. Without an AI configured the
 *      button says so and the activities stay.
 *
 * Every proposal: Accept (its container too), Show (lights its members
 * everywhere), Rename, Discard. ONLY the accepted enters the graph — written
 * by main.ts (`accept`), one step of the store, with its paradata («proposed
 * by AI (model, date), accepted by …»: an extractor under the unit's
 * `primary_function`, `has_author` the AI author, as for the drafts).
 */
import { esc } from "./functional-matrix";

export type ProposalSource = "activity" | "ai";
export interface Proposal {
  key: string; source: ProposalSource; activity?: string | null; name: string; scale: string;
  function: string | null; epoch: string | null; lane: string | null; parent: string | null;
  members: string[]; why: string; unknown?: string[]; model?: string; date?: string | null;
}
export type ProposalStatus = "open" | "accepted";

/** What the page gives this module (main.ts binds it). */
export interface FpHost {
  bridge(): Promise<string>;
  /** the active graph: its id, a signature of its state, its em.json, its file */
  active(): null | { graphId: string; sig: string; json(): string; path: string | null; has(id: string): boolean; name(id: string): string };
  /** the lanes of the Matrix (horizons), null → the epochs */
  lanes(): Array<{ id: string; name: string; start: number | null; end: number | null }> | null;
  /** the names of the lanes / epochs */
  laneName(id: string | null): string;
  lang(): string;
  t(key: string, vars?: Record<string, string | number>): string;
  /** the selected units (the AI on the selection) */
  selection(): string[];
  /** the identities of the Landscape Matrix bound to this graph, when known */
  identities(): Array<Record<string, unknown>> | null;
  /** the AI of the Preferences: provider and model, can it answer, ask for it */
  ai: { provider(): string; model(): string; ready(): Promise<boolean>; configure(then: () => void): void };
  /** write an accepted proposal (its container first): the new unit's id */
  accept(p: Proposal, parentId: string | null): string | null;
  /** light these ids everywhere (Matrix, Space, Cube, Functional Matrix) */
  show(ids: string[]): void;
  /** the functional unit already written for a proposal key, if still there */
  exists(id: string): boolean;
  changed(): void;
}

let host: FpHost | null = null;
export function setProposalsHost(h: FpHost): void { host = h; }

type Status = "idle" | "loading" | "ok" | "off" | "missing" | "error" | "none";
interface PerGraph {
  activities: { status: Status; list: Proposal[]; error?: string; sig: string | null; seq: number };
  ai: { status: Status | "unconfigured"; list: Proposal[]; error?: string; model?: string; provider?: string;
        dropped: Array<{ key: string; name: string; why: string }>; scope?: string; sent?: Record<string, number>; seq: number };
  status: Map<string, ProposalStatus>;
  written: Map<string, string>;
  discarded: Set<string>;
  renamed: Map<string, string>;
  shown: string | null;
}
const graphs = new Map<string, PerGraph>();
function pg(gid: string): PerGraph {
  let g = graphs.get(gid);
  if (!g) {
    g = { activities: { status: "idle", list: [], sig: null, seq: 0 }, ai: { status: "idle", list: [], dropped: [], seq: 0 },
          status: new Map(), written: new Map(), discarded: new Set(), renamed: new Map(), shown: null };
    graphs.set(gid, g);
  }
  return g;
}
const lang = (): string => (host && host.lang().toLowerCase().startsWith("it") ? "it" : "en");

/** For a test or a reload: forget everything. */
export function fpReset(): void { graphs.clear(); }

async function post(body: string): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${await host!.bridge()}/functional-proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  let json: Record<string, unknown> | null = null;
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* not JSON */ }
  return { status: res.status, json };
}

/** Ask the proposals from the activities when the graph changed. */
export function fpAsk(): void {
  if (!host) return;
  const act = host.active();
  if (!act) return;
  const g = pg(act.graphId);
  const lanes = host.lanes();
  const sig = [act.sig, JSON.stringify(lanes), lang()].join("|");
  if (sig === g.activities.sig && g.activities.status !== "off") return;
  g.activities.sig = sig;
  const mine = ++g.activities.seq;
  if (g.activities.status === "idle" || g.activities.status === "off") g.activities.status = "loading";
  const body = `{"mode":"activities","doc":${act.json()},"lanes":${JSON.stringify(lanes)},"lang":"${lang()}"}`;
  void post(body).then(({ status, json }) => {
    if (mine !== g.activities.seq) return;
    if (status === 404) Object.assign(g.activities, { status: "missing", list: [] });
    else if (status !== 200 || !json?.ok) Object.assign(g.activities, { status: "error", list: [], error: String(json?.error ?? `bridge error ${status}`) });
    else Object.assign(g.activities, { status: "ok", list: (json.proposals as Proposal[]) ?? [], error: undefined });
    host?.changed();
  }).catch(() => {
    if (mine !== g.activities.seq) return;
    g.activities.status = "off";
    host?.changed();
  });
}

/** «Propose with AI» on the selection (`scope` selection) or the whole graph. */
export async function fpAskAi(scope: "selection" | "graph"): Promise<boolean> {
  if (!host) return false;
  const h = host;
  const act = h.active();
  if (!act) return false;
  const g = pg(act.graphId);
  if (!(await h.ai.ready())) {
    g.ai.status = "unconfigured";
    h.changed();
    h.ai.configure(() => { void fpAskAi(scope); });
    return false;
  }
  const units = scope === "selection" ? h.selection().filter((id) => act.has(id)) : null;
  if (scope === "selection" && !units?.length) {
    g.ai.status = "error";
    g.ai.error = h.t("fwp.ai.noSelection");
    h.changed();
    return false;
  }
  const mine = ++g.ai.seq;
  g.ai.status = "loading";
  g.ai.scope = scope;
  h.changed();
  const body = `{"mode":"ai","doc":${act.json()},"base":${JSON.stringify(act.path)},"lanes":${JSON.stringify(h.lanes())},` +
    `"units":${JSON.stringify(units)},"identities":${JSON.stringify(h.identities())},"provider":${JSON.stringify(h.ai.provider())},` +
    `"model":${JSON.stringify(h.ai.model())},"date":"${new Date().toISOString().slice(0, 10)}","lang":"${lang()}"}`;
  try {
    const { status, json } = await post(body);
    if (mine !== g.ai.seq) return false;
    if (status === 404) Object.assign(g.ai, { status: "missing", list: [], dropped: [] });
    else if (status === 501) Object.assign(g.ai, { status: "unconfigured", error: String(json?.error ?? "") });
    else if (status !== 200 || !json?.ok) Object.assign(g.ai, { status: "error", error: String(json?.error ?? `bridge error ${status}`) });
    else {
      // a second ask replaces the open AI proposals; the accepted stay accepted
      const keep = g.ai.list.filter((p) => g.status.get(p.key) === "accepted");
      const stamp = Date.now().toString(36);
      const fresh = ((json.proposals as Proposal[]) ?? []).map((p) => ({ ...p, key: `ai:${stamp}:${p.key}`,
        parent: p.parent && ((json.proposals as Proposal[]) ?? []).some((q) => q.key === p.parent) ? `ai:${stamp}:${p.parent}` : p.parent }));
      Object.assign(g.ai, { status: "ok", list: [...keep, ...fresh], error: undefined, model: String(json.model ?? ""),
                            provider: String(json.provider ?? ""), dropped: (json.dropped as PerGraph["ai"]["dropped"]) ?? [],
                            sent: json.sent as Record<string, number> });
    }
  } catch {
    if (mine !== g.ai.seq) return false;
    g.ai.status = "off";
  }
  h.changed();
  return (g.ai.status as string) === "ok";
}

/** every proposal of the active graph, with its status, discarded ones out */
export function fpList(): Array<Proposal & { status: ProposalStatus; fu: string | null }> {
  const act = host?.active();
  if (!act) return [];
  const g = pg(act.graphId);
  const all = [...g.activities.list, ...g.ai.list].filter((p) => !g.discarded.has(p.key));
  return all.map((p) => {
    const fu = g.written.get(p.key) ?? null;
    const accepted = g.status.get(p.key) === "accepted" && !!fu && host!.exists(fu);
    return { ...p, name: g.renamed.get(p.key) ?? p.name, status: accepted ? "accepted" : "open", fu: accepted ? fu : null };
  });
}
function find(key: string): (Proposal & { status: ProposalStatus; fu: string | null }) | null {
  return fpList().find((p) => p.key === key) ?? null;
}

/** Accept a proposal — its container first (accepting a room accepts its
 *  building). The new unit's id, or null. */
export function fpAccept(key: string, seen: Set<string> = new Set()): string | null {
  if (!host) return null;
  const act = host.active();
  const p = find(key);
  if (!act || !p) return null;
  if (p.status === "accepted") return p.fu;
  if (seen.has(key)) return null;
  seen.add(key);
  const g = pg(act.graphId);
  let parentId: string | null = null;
  if (p.parent) {
    const parentProposal = find(p.parent);
    parentId = parentProposal ? fpAccept(p.parent, seen) : act.has(p.parent) ? p.parent : null;
  }
  const id = host.accept({ ...p, members: p.members.filter((m) => act.has(m)) }, parentId);
  if (!id) return null;
  g.status.set(key, "accepted");
  g.written.set(key, id);
  host.changed();
  return id;
}

/** Accept every open proposal of a source. The ids written. */
export function fpAcceptAll(source: ProposalSource): string[] {
  const out: string[] = [];
  for (const p of fpList()) if (p.source === source && p.status === "open") { const id = fpAccept(p.key); if (id) out.push(id); }
  return out;
}

export function fpShow(key: string): string[] {
  if (!host) return [];
  const act = host.active();
  const p = find(key);
  if (!act || !p) return [];
  pg(act.graphId).shown = key;
  const ids = p.members.filter((m) => act.has(m));
  host.show(ids);
  host.changed();
  return ids;
}
export function fpRename(key: string, name: string): void {
  const act = host?.active();
  if (!act || !name.trim()) return;
  pg(act.graphId).renamed.set(key, name.trim().slice(0, 120));
  host?.changed();
}
export function fpDiscard(key: string): void {
  const act = host?.active();
  if (!act) return;
  pg(act.graphId).discarded.add(key);
  host?.changed();
}

/** What the area shows, for a test or a script. */
export function fpState(): null | { activities: Status; ai: string; aiError: string | null; model: string | null; dropped: number;
                                    sent: Record<string, number> | null; proposals: ReturnType<typeof fpList>; shown: string | null } {
  const act = host?.active();
  if (!act) return null;
  const g = pg(act.graphId);
  return { activities: g.activities.status, ai: g.ai.status, aiError: g.ai.error ?? null, model: g.ai.model ?? null,
           dropped: g.ai.dropped.length, sent: g.ai.sent ?? null, proposals: fpList(), shown: g.shown };
}

// ── the area ─────────────────────────────────────────────────────────────────

function btn(label: string, data: Record<string, string>, title = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "insp-btn fp-btn";
  b.textContent = label;
  if (title) b.title = title;
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  return b;
}

/** The area «Proposals». */
export function renderFunctionalProposalsInto(body: HTMLElement, _winId: string): void {
  if (!host) return;
  const h = host;
  const t = h.t;
  fpAsk();
  body.textContent = "";
  body.classList.add("fm-body", "fp-body");
  const act = h.active();
  if (!act) { const p = document.createElement("p"); p.className = "fm-note"; p.textContent = t("lc.noDoc"); body.appendChild(p); return; }
  const g = pg(act.graphId);
  const head = document.createElement("div");
  head.className = "fm-head fp-head";
  const aiSel = btn(t("fwp.ai.selection"), { fpAi: "selection" }, t("fwp.ai.selectionTitle"));
  const aiAll = btn(t("fwp.ai.graph"), { fpAi: "graph" }, t("fwp.ai.graphTitle"));
  const busy = g.ai.status === "loading";
  aiSel.disabled = busy; aiAll.disabled = busy;
  aiSel.addEventListener("click", () => { void fpAskAi("selection"); });
  aiAll.addEventListener("click", () => { void fpAskAi("graph"); });
  const allAct = btn(t("fwp.acceptAllActivities"), { fpAcceptAll: "activity" });
  allAct.addEventListener("click", () => { fpAcceptAll("activity"); });
  head.append(aiSel, aiAll, allAct);
  body.appendChild(head);
  // the AI's state: unconfigured says so (and where), the others their word
  const say = document.createElement("p");
  say.className = "fm-note fp-ai-state";
  say.dataset.fpAiState = g.ai.status;
  if (g.ai.status === "unconfigured") {
    say.textContent = t("fwp.ai.unconfigured");
    const go = btn(t("fwp.ai.configure"), { fpAiConfigure: "" });
    go.addEventListener("click", () => { h.ai.configure(() => { void fpAskAi(g.ai.scope === "selection" ? "selection" : "graph"); }); });
    say.appendChild(document.createTextNode(" "));
    say.appendChild(go);
  } else if (g.ai.status === "loading") say.textContent = t("fwp.ai.loading");
  else if (g.ai.status === "missing") say.textContent = t("fwp.ai.missing");
  else if (g.ai.status === "off") say.textContent = t("fm.off");
  else if (g.ai.status === "error") say.textContent = t("fwp.ai.error", { why: g.ai.error ?? "" });
  else if (g.ai.status === "ok") say.textContent = t("fwp.ai.done", { model: g.ai.model ?? "", n: g.ai.list.length, d: g.ai.dropped.length });
  else say.textContent = t("fwp.ai.idle");
  if (g.ai.status === "ok" && g.ai.dropped.length) say.title = g.ai.dropped.map((d) => `${d.name || d.key}: ${d.why}`).join("\n");
  body.appendChild(say);
  if (g.activities.status === "missing") { const p = document.createElement("p"); p.className = "fm-note"; p.dataset.fpState = "missing"; p.textContent = t("fwp.missing"); body.appendChild(p); }
  else if (g.activities.status === "off") { const p = document.createElement("p"); p.className = "fm-note"; p.dataset.fpState = "off"; p.textContent = t("fm.off"); body.appendChild(p); }
  else if (g.activities.status === "error") { const p = document.createElement("p"); p.className = "fm-note"; p.dataset.fpState = "error"; p.textContent = t("fm.error", { why: g.activities.error ?? "" }); body.appendChild(p); }
  const list = document.createElement("div");
  list.className = "fp-list fm-scroll";
  const all = fpList();
  if (!all.length) {
    const p = document.createElement("p");
    p.className = "fm-note";
    p.dataset.fpState = g.activities.status === "loading" ? "loading" : "empty";
    p.textContent = t(g.activities.status === "loading" ? "fm.loading" : "fwp.none");
    list.appendChild(p);
  }
  for (const p of all) {
    const card = document.createElement("div");
    card.className = `fp-card${p.status === "accepted" ? " fp-done" : ""}${g.shown === p.key ? " fp-shown" : ""}`;
    card.dataset.fpKey = p.key;
    card.dataset.fpSource = p.source;
    card.dataset.fpStatus = p.status;
    const parent = p.parent ? all.find((q) => q.key === p.parent)?.name ?? (act.has(p.parent) ? act.name(p.parent) : null) : null;
    card.innerHTML =
      `<div class="fp-t"><span class="fp-src">${esc(t(p.source === "ai" ? "fwp.src.ai" : "fwp.src.activity"))}</span>` +
      `<b class="fp-name" data-fp-name="">${esc(p.name)}</b>` +
      `<span class="fm-note">${esc([t(`fm.scale.${p.scale}`), h.laneName(p.lane), t("fwp.members", { n: p.members.length }),
        ...(p.function ? [p.function] : []), ...(parent ? [t("fwp.inside", { name: parent })] : [])].filter(Boolean).join(" · "))}</span></div>` +
      `<div class="fp-why">${esc(p.why)}</div>` +
      (p.unknown?.length ? `<div class="fm-note fp-unknown">${esc(t("fwp.unknown", { list: p.unknown.slice(0, 8).join(", ") }))}</div>` : "") +
      (p.source === "ai" ? `<div class="fm-note fp-by">${esc(t("fwp.by", { model: p.model ?? "", date: p.date ?? "" }))}</div>` : "");
    const acts = document.createElement("div");
    acts.className = "fp-acts";
    if (p.status === "accepted") {
      const s = document.createElement("span");
      s.className = "fm-note";
      s.textContent = t("fwp.accepted");
      acts.appendChild(s);
    } else {
      const a = btn(t("fwp.accept"), { fpAccept: p.key }, p.parent ? t("fwp.acceptTitleParent") : "");
      a.addEventListener("click", () => { fpAccept(p.key); });
      const s = btn(t("fwp.show"), { fpShow: p.key }, t("fwp.showTitle"));
      s.addEventListener("click", () => { fpShow(p.key); });
      const r = btn(t("fwp.rename"), { fpRename: p.key });
      r.addEventListener("click", () => {
        const nm = card.querySelector<HTMLElement>("[data-fp-name]")!;
        nm.contentEditable = "true";
        nm.focus();
        document.getSelection()?.selectAllChildren(nm);
        const done = () => { nm.contentEditable = "false"; fpRename(p.key, nm.textContent ?? ""); };
        nm.addEventListener("blur", done, { once: true });
        nm.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); nm.blur(); } if (ev.key === "Escape") { nm.textContent = p.name; nm.blur(); } });
      });
      const d = btn(t("fwp.discard"), { fpDiscard: p.key });
      d.addEventListener("click", () => { fpDiscard(p.key); });
      acts.append(a, s, r, d);
    }
    card.appendChild(acts);
    list.appendChild(card);
  }
  body.appendChild(list);
}
