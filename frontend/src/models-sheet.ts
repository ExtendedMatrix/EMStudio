/**
 * SPAZIO · the Table's computed view «Modelli e proxy» — what the graph says
 * exists in 3D, and what of it is there (scrivania v11b).
 *
 *   · RM by epoch: the model, its genre (the placement axis of its document:
 *     a survey, a source-based reconstruction…), the document that records it
 *     (its «scheda»), the state of its file;
 *   · proxy by unit: the unit's `geometry` property, what the geometry is (a glb,
 *     convex hulls or spheres in the JSON), the state of its file.
 *
 * Read-only, like every computed view: the rows come from `space.ts`. The
 * count beside the sheet's name is the rows on screen (`check-space.mjs`).
 */
import type { Space, SpaceResource } from "./space";
import { shownModelName } from "./rm-names";
import type { EmNode } from "./types";
import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";

/** MICRO-SPAZIO-COMPATTO p.10 · a stratigraphic type that is a BODY (a real or
 *  a virtual unit: its datamodel entry has a `family`), not an event of the
 *  sequence (the continuity node BR, the event SE): only a body has a proxy.
 *  Read from the datamodel; an unknown type counts as a body. */
const STRAT_SUBTYPES = ((nodeDatamodel as unknown as { stratigraphic_nodes?: { StratigraphicNode?: { subtypes?: Record<string, { family?: string }> } } })
  .stratigraphic_nodes?.StratigraphicNode?.subtypes) ?? {};
export function unitHasBody(nodeType: string | undefined): boolean {
  const e = STRAT_SUBTYPES[nodeType ?? ""];
  return !e || !!e.family;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ModelsCtx {
  node: (id: string) => EmNode | undefined;
  t: (key: string, vars?: Record<string, string>) => string;
  /** the genre's words (`space.genre.<key>`), else the key */
  genre: (key: string | null) => string;
  /** MICRO-SPAZIO-3D-3 p.11 · a model's name as the Space shows it (the level of the version drawn) */
  rmName?: (id: string) => { shown: string; technical: string; level: string | null } | null;
  /** MICRO-SPAZIO-COMPATTO p.8 · what the Space draws of a model now: its level,
   *  the weight of that file, its triangles (null: not drawn) */
  drawn?: (rmId: string) => { level: string; bytes: number | null; tris: number | null; tiles: boolean } | null;
  /** …whether the Space hides it (the Outliner's eye), and the eye's click */
  hidden?: (key: string) => boolean;
  /** p.10 · only the units with a proxy (off: all, those without at the bottom) */
  onlyWithProxy?: boolean;
  toggleEye?: (key: string) => void;
  setOnlyWithProxy?: (on: boolean) => void;
  /** the numbers and the weights in the reader's language */
  num?: (n: number) => string;
  bytes?: (n: number | null) => string;
}

export interface ModelsRows {
  rm: Array<{ epochId: string; rmId: string | null }>;
  proxy: string[];
}

/** The rows the view shows, in its order: every top epoch with its RMs (an
 *  epoch without one is a row that says so), then every unit. */
export function modelsRows(space: Space, units: string[], opts: { typeOf?: (id: string) => string | undefined; onlyWithProxy?: boolean } = {}): ModelsRows {
  const rm: ModelsRows["rm"] = [];
  for (const e of space.epochs) {
    const mine = space.rms.filter((r) => r.epochs.includes(e.id));
    if (!mine.length) rm.push({ epochId: e.id, rmId: null });
    for (const r of mine) rm.push({ epochId: e.id, rmId: r.id });
  }
  // MICRO-SPAZIO-COMPATTO p.10 · the events of the sequence out (a BR has no
  // proxy); the units without a proxy at the bottom, or out with the switch
  const bodies = opts.typeOf ? units.filter((u) => space.proxies.has(u) || unitHasBody(opts.typeOf!(u))) : units;
  const withPx = bodies.filter((u) => space.proxies.has(u));
  const proxy = opts.onlyWithProxy ? withPx : [...withPx, ...bodies.filter((u) => !space.proxies.has(u))];
  return { rm, proxy };
}

export function fileState(r: SpaceResource | null, t: ModelsCtx["t"]): string {
  if (!r) return `<span class="st none">${esc(t("space.st.none"))}</span>`;
  return `<span class="st ${r.state}" title="${esc(r.url)}">${esc(t(`space.st.${r.state}`))}</span>`
    // MICRO-SPAZIO-3D-3 p.15 · on the same line: a row is one line high
    + ` <span class="num d mdl-file" title="${esc(r.name)}">${esc(r.name)}</span>`;
}

export function modelsTableHtml(space: Space, units: string[], ctx: ModelsCtx,
                                passes: (id: string, text: string) => boolean): { html: string; count: number } {
  const { t } = ctx;
  const name = (id: string | null) => (id ? String(ctx.node(id)?.name || id) : "");
  const rows = modelsRows(space, units, { typeOf: (id) => ctx.node(id)?.node_type, onlyWithProxy: ctx.onlyWithProxy });
  const num = ctx.num ?? ((n: number) => String(n));
  const bytes = ctx.bytes ?? ((n: number | null) => (n == null ? "" : `${(n / 1048576).toFixed(1)} MB`));
  const rmRows = rows.rm.filter((r) => passes(r.rmId ?? r.epochId, `${name(r.epochId)} ${name(r.rmId)}`));
  const pxRows = rows.proxy.filter((u) => passes(u, name(u)));
  const withRm = space.epochs.filter((e) => space.rms.some((r) => r.epochs.includes(e.id))).length;
  const pxs = units.filter((u) => space.proxies.has(u));
  const miss = pxs.filter((u) => space.proxies.get(u)?.resource?.state === "missing").length;
  const refused = pxs.filter((u) => space.proxies.get(u)?.resource?.state === "refused").length;
  const refs = pxs.filter((u) => space.proxies.get(u)?.resource?.state === "reference").length;
  const json = pxs.filter((u) => !space.proxies.get(u)?.resource).length;
  const chip = (k: string, v: string, id: string) => `<span class="chip" data-count="${id}">${esc(t(k))} <b>${v}</b></span>`;
  let h = `<div class="mdl"><div class="sum">`
    + chip("space.sumEpochs", `${withRm}/${space.epochs.length}`, "epochs")
    + chip("space.sumUnits", `${pxs.length}/${units.length}`, "units")
    + (miss ? chip("space.sumMissing", String(miss), "missing") : "")
    + (refused ? chip("space.sumRefused", String(refused), "refused") : "")
    + (refs ? chip("space.sumReference", String(refs), "reference") : "")
    + (json ? chip("space.sumJson", String(json), "json") : "")
    // p.10 · «only with a proxy»: off, every unit (those without at the bottom)
    + `<label class="chip mdl-only" title="${esc(t("space.onlyWithProxyTitle"))}"><input type="checkbox" data-only-proxy${ctx.onlyWithProxy ? " checked" : ""}> ${esc(t("space.onlyWithProxy"))}</label>`
    + `</div>`;
  // MICRO-SPAZIO-COMPATTO p.7 · no title over the tables (the sheet's name says
  // it): one head row, its filters in the headings; p.8 · what the Space draws
  // of each model (level, weight, triangles) and its eye
  h += `<table class="mdl-rm" aria-label="${esc(t("space.rmByEpoch"))}"><thead><tr><th>${esc(t("space.col.epoch"))}</th><th>RM</th>`
    + `<th>${esc(t("space.col.container"))}</th><th>${esc(t("space.col.genre"))}</th><th>${esc(t("space.col.record"))}</th>`
    + `<th>${esc(t("space.col.loaded"))}</th><th>${esc(t("space.col.weight"))}</th><th>${esc(t("space.col.tris"))}</th><th data-tt-label="👁" title="${esc(t("space.col.eyeTitle"))}">👁</th>`
    + `<th>${esc(t("space.col.file"))}</th><th></th></tr></thead><tbody>`;
  for (const r of rmRows) {
    const e = space.epochs.find((x) => x.id === r.epochId);
    // MICRO-SPAZIO-3D-3 p.15 · the dates on the name's line («XX sec 1801–2013»), cut with a tooltip
    const span = e && (e.start != null || e.end != null) ? ` <span class="num d">${e.start ?? "…"}–${e.end ?? "…"}</span>` : "";
    const epTitle = e ? `${name(r.epochId)}${e.start != null || e.end != null ? ` ${e.start ?? "…"}–${e.end ?? "…"}` : ""}` : "";
    if (!r.rmId) {
      h += `<tr data-row="${esc(r.epochId)}"><td class="mdl-ep" title="${esc(epTitle)}">${esc(name(r.epochId))}${span}</td><td colspan="9"><span class="st none">${esc(t("space.noRm"))}</span></td><td></td></tr>`;
      continue;
    }
    const rm = space.rms.find((x) => x.id === r.rmId)!;
    h += `<tr data-row="${esc(rm.id)}"><td class="mdl-ep" title="${esc(epTitle)}">${esc(name(r.epochId))}${span}</td>`
      // MICRO-SPAZIO-3D-3 p.11 · without the level suffix when it has versions
      + `<td>${((n) => `<button class="link" data-go="${esc(rm.id)}" title="${esc(n.technical)}"><b>${esc(n.shown)}</b></button>${n.level ? ` <span class="sol-chip">${esc(n.level)}</span>` : ""}`)(ctx.rmName?.(rm.id) ?? shownModelName(rm.name, (rm.versions?.length ?? 0) > 1))}</td>`
      // MICRO-SPAZIO-3D-3 p.7 · the RM container it is in (EM Tools')
      + `<td data-col="container">${rm.group && space.rmGroups?.get(rm.group) ? `<button class="link" data-go="${esc(rm.group)}">${esc(space.rmGroups.get(rm.group)!.name)}</button>` : ""}</td>`
      + `<td>${esc(ctx.genre(rm.genre))}</td>`
      + `<td>${rm.documentId ? `<button class="link" data-go="${esc(rm.documentId)}">${esc(name(rm.documentId))}</button>`
          : `<span class="st missing">${esc(t("space.notRecorded"))}</span>`}</td>`
      + ((d) => `<td class="num" data-col="loaded">${d ? esc(d.level) : ""}</td>`
        + `<td class="num" data-col="weight">${d && d.bytes != null ? esc(bytes(d.bytes)) : ""}</td>`
        + `<td class="num" data-col="tris">${d && d.tris != null ? esc(num(d.tris)) : ""}</td>`)(ctx.drawn?.(rm.id) ?? null)
      + ((hid) => `<td class="mdl-eye-c"><button type="button" class="mdl-eye${hid ? " off" : ""}" data-mdl-eye="rm:${esc(rm.id)}" aria-pressed="${!hid}" title="${esc(t("space.col.eyeTitle"))}">${hid ? "◌" : "👁"}</button></td>`)(ctx.hidden?.(`rm:${rm.id}`) ?? false)
      + `<td>${fileState(rm.resource, t)}</td>`
      + `<td>${rm.documentId ? `<button class="btn sm" type="button" data-open-doc="${esc(rm.documentId)}">${esc(t("space.open"))}</button>` : ""}</td></tr>`;
  }
  h += `</tbody></table><table class="mdl-px" aria-label="${esc(t("space.proxyByUnit"))}"><thead><tr><th>${esc(t("space.col.unit"))}</th>`
    + `<th>${esc(t("space.col.epoch"))}</th><th>${esc(t("space.col.property"))}</th><th>${esc(t("space.col.file"))}</th></tr></thead><tbody>`;
  // the epochs of each unit, from one summary per epoch (asked per unit, it was
  // every epoch's summary for every row)
  const epochsOf = new Map<string, string[]>();
  for (const e of space.epochs)
    for (const u of space.summary(e.id)?.units ?? []) (epochsOf.get(u) ?? epochsOf.set(u, []).get(u)!).push(e.name);
  for (const u of pxRows) {
    const px = space.proxies.get(u);
    const eps = (epochsOf.get(u) ?? []).join(", ");
    const geo = px ? (px.geometry === "glb" ? "glb" : t(`space.geo.${px.geometry}`)) : "";
    h += `<tr data-row="${esc(u)}"><td><button class="link" data-go="${esc(u)}">${esc(name(u))}</button></td><td>${esc(eps)}</td>`
      + `<td>${px ? `<button class="link d" data-go="${esc(px.propertyId)}">${esc(name(px.propertyId) || "proxy")}</button> · ${esc(geo)}`
          : `<span class="st none">${esc(t("space.noProxy"))}</span>`}</td>`
      + `<td>${px ? (px.resource ? fileState(px.resource, t) : `<span class="st json">${esc(t("space.st.json"))}</span>`) : ""}</td></tr>`;
  }
  h += `</tbody></table><p class="note2">${esc(t("space.proxyNote"))}</p></div>`;
  // the count is the rows on screen: an epoch with no RM is a row that says so
  return { html: h, count: rmRows.length + pxRows.length };
}
