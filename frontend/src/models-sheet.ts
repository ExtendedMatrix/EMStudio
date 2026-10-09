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
import type { EmNode } from "./types";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ModelsCtx {
  node: (id: string) => EmNode | undefined;
  t: (key: string, vars?: Record<string, string>) => string;
  /** the genre's words (`space.genre.<key>`), else the key */
  genre: (key: string | null) => string;
}

export interface ModelsRows {
  rm: Array<{ epochId: string; rmId: string | null }>;
  proxy: string[];
}

/** The rows the view shows, in its order: every top epoch with its RMs (an
 *  epoch without one is a row that says so), then every unit. */
export function modelsRows(space: Space, units: string[]): ModelsRows {
  const rm: ModelsRows["rm"] = [];
  for (const e of space.epochs) {
    const mine = space.rms.filter((r) => r.epochs.includes(e.id));
    if (!mine.length) rm.push({ epochId: e.id, rmId: null });
    for (const r of mine) rm.push({ epochId: e.id, rmId: r.id });
  }
  return { rm, proxy: units };
}

export function fileState(r: SpaceResource | null, t: ModelsCtx["t"]): string {
  if (!r) return `<span class="st none">${esc(t("space.st.none"))}</span>`;
  return `<span class="st ${r.state}" title="${esc(r.url)}">${esc(t(`space.st.${r.state}`))}</span>`
    + `<br><span class="num d">${esc(r.name)}</span>`;
}

export function modelsTableHtml(space: Space, units: string[], ctx: ModelsCtx,
                                passes: (id: string, text: string) => boolean): { html: string; count: number } {
  const { t } = ctx;
  const name = (id: string | null) => (id ? String(ctx.node(id)?.name || id) : "");
  const rows = modelsRows(space, units);
  const rmRows = rows.rm.filter((r) => passes(r.rmId ?? r.epochId, `${name(r.epochId)} ${name(r.rmId)}`));
  const pxRows = rows.proxy.filter((u) => passes(u, name(u)));
  const withRm = space.epochs.filter((e) => space.rms.some((r) => r.epochs.includes(e.id))).length;
  const pxs = units.filter((u) => space.proxies.has(u));
  const miss = pxs.filter((u) => space.proxies.get(u)?.resource?.state === "missing").length;
  const refs = pxs.filter((u) => space.proxies.get(u)?.resource?.state === "reference").length;
  const json = pxs.filter((u) => !space.proxies.get(u)?.resource).length;
  const chip = (k: string, v: string, id: string) => `<span class="chip" data-count="${id}">${esc(t(k))} <b>${v}</b></span>`;
  let h = `<div class="mdl"><div class="sum">`
    + chip("space.sumEpochs", `${withRm}/${space.epochs.length}`, "epochs")
    + chip("space.sumUnits", `${pxs.length}/${units.length}`, "units")
    + (miss ? chip("space.sumMissing", String(miss), "missing") : "")
    + (refs ? chip("space.sumReference", String(refs), "reference") : "")
    + (json ? chip("space.sumJson", String(json), "json") : "")
    + `</div>`;
  h += `<h4>${esc(t("space.rmByEpoch"))}</h4><table class="mdl-rm"><thead><tr><th>${esc(t("space.col.epoch"))}</th><th>RM</th>`
    + `<th>${esc(t("space.col.genre"))}</th><th>${esc(t("space.col.record"))}</th><th>${esc(t("space.col.file"))}</th><th></th></tr></thead><tbody>`;
  for (const r of rmRows) {
    const e = space.epochs.find((x) => x.id === r.epochId);
    const span = e && (e.start != null || e.end != null) ? ` <span class="num d">${e.start ?? "…"}–${e.end ?? "…"}</span>` : "";
    if (!r.rmId) {
      h += `<tr data-row="${esc(r.epochId)}"><td>${esc(name(r.epochId))}${span}</td><td colspan="4"><span class="st none">${esc(t("space.noRm"))}</span></td><td></td></tr>`;
      continue;
    }
    const rm = space.rms.find((x) => x.id === r.rmId)!;
    h += `<tr data-row="${esc(rm.id)}"><td>${esc(name(r.epochId))}${span}</td>`
      + `<td><button class="link" data-go="${esc(rm.id)}"><b>${esc(rm.name)}</b></button></td>`
      + `<td>${esc(ctx.genre(rm.genre))}</td>`
      + `<td>${rm.documentId ? `<button class="link" data-go="${esc(rm.documentId)}">${esc(name(rm.documentId))}</button>`
          : `<span class="st missing">${esc(t("space.notRecorded"))}</span>`}</td>`
      + `<td>${fileState(rm.resource, t)}</td>`
      + `<td>${rm.documentId ? `<button class="btn sm" type="button" data-open-doc="${esc(rm.documentId)}">${esc(t("space.open"))}</button>` : ""}</td></tr>`;
  }
  h += `</tbody></table><h4>${esc(t("space.proxyByUnit"))}</h4><table class="mdl-px"><thead><tr><th>${esc(t("space.col.unit"))}</th>`
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
