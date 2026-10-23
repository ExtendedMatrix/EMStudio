/**
 * MICRO-GEOREF-GRAFO p.2 · the «Georeferencing» section of the graph's
 * Inspector: the GeoPositionNode, edited where the graph's other properties are
 * (author, licence, embargo, the site's position), every change one undo step
 * of the store (`setGeoreference`). ONE renderer, called by the graph node's
 * Inspector and by the Study panel; ONE source, the node.
 *
 * What it shows: the CRS (its code, and its name as PROJ's database says it),
 * the shift X/Y/Z, the azimuth (from the grid north), the vertical reference;
 * the operation PROJ uses to WGS 84 at the shift and its accuracy; a deprecated
 * code or a «ballpark» operation said plainly, with «Convert to EPSG:NNNN» (the
 * replacement PROJ's database gives, never a table written here) — the code only
 * on the same grid, the shift reprojected on another; SHIFT.txt in and out.
 *
 * PROJ is the bridge's (`/geo/crs-info`, `/geo/convert-shift`); without a bridge
 * the fields still work and the section says what it could not read.
 */
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import {
  conversionPatch, crsWarning, epsgOf, fmtCoord, formatShiftTxt, verticalOf, VERTICAL_REFERENCES, type CrsInfo,
} from "./georef";

export interface GeorefDeps {
  /** the bridge's base URL, or null when none answers */
  bridge: () => Promise<string | null>;
  /** «Import shift.txt»: the file chooser and the bridge's reading (`readShiftInto`) */
  importShift: () => void;
  /** a text file handed to the person (the browser's download, the desktop's save) */
  download: (name: string, text: string) => void;
  /** the section must be drawn again (an answer of the bridge came) */
  redraw: () => void;
  /** a line in the Log; a toast with «Undo» (a step was written); a toast (nothing was) */
  log: (msg: string, ids: string[]) => void;
  done: (msg: string) => void;
  say: (msg: string) => void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── PROJ's answers, kept by (code, shift): asked once, drawn when they come ──
const infos = new Map<string, CrsInfo | "pending" | { error: string }>();
const keyOf = (epsg: number, x: number, y: number) => `${epsg}|${x}|${y}`;

/** what the bridge says of a CRS at a point (cached); null while asked */
export function crsInfoOf(epsg: number, x: number, y: number, deps: Pick<GeorefDeps, "bridge" | "redraw">):
    CrsInfo | { error: string } | null {
  const k = keyOf(epsg, x, y);
  const have = infos.get(k);
  if (have && have !== "pending") return have;
  if (!have) {
    infos.set(k, "pending");
    void (async () => {
      const base = await deps.bridge().catch(() => null);
      let out: CrsInfo | { error: string };
      if (!base) out = { error: t("georef.noBridge") };
      else {
        try {
          const r = await fetch(`${base}/geo/crs-info?epsg=${epsg}&x=${x}&y=${y}`);
          const j = await r.json().catch(() => null);
          out = r.status === 404 ? { error: t("georef.oldBridge") } : j?.ok ? (j as CrsInfo) : { error: String(j?.error ?? `HTTP ${r.status}`) };
        } catch {
          out = { error: t("georef.noBridge") };
        }
      }
      infos.set(k, out);
      deps.redraw();
    })();
  }
  return null;
}

/** what the bridge says of the graph's CRS now (for the proposal at the opening
 *  and after a SHIFT.txt), or null: no node, no CRS, no bridge, no answer */
export async function crsInfoNow(store: DocumentStore, bridge: () => Promise<string | null>): Promise<CrsInfo | null> {
  const g = store.geoPositionNode();
  const d = (g?.data ?? {}) as Record<string, unknown>;
  const epsg = epsgOf(d);
  if (!g || epsg === null) return null;
  const x = Number(d.shift_x) || 0, y = Number(d.shift_y) || 0;
  const base = await bridge().catch(() => null);
  if (!base) return null;
  const j = await fetch(`${base}/geo/crs-info?epsg=${epsg}&x=${x}&y=${y}`).then((r) => r.json()).catch(() => null);
  if (!j?.ok) return null;
  infos.set(keyOf(epsg, x, y), j as CrsInfo);
  return j as CrsInfo;
}

/** The proposal from what the bridge already said (no request): the Warnings
 *  view's row, kept while the CRS is the one PROJ warned about */
export function proposalNow(store: DocumentStore, deps: Pick<GeorefDeps, "bridge" | "log" | "done" | "say">):
    { node: string; txt: string; label: string; run: () => void } | null {
  const g = store.geoPositionNode();
  const d = (g?.data ?? {}) as Record<string, unknown>;
  const epsg = epsgOf(d);
  if (!g || epsg === null) return null;
  const ci = infos.get(keyOf(epsg, Number(d.shift_x) || 0, Number(d.shift_y) || 0));
  if (!ci || ci === "pending" || !("ok" in ci)) return null;
  const w = crsWarning(ci);
  const r = w?.to?.[0];
  if (!w || !r) return null;
  const why = t(w.why === "deprecated" ? "georef.whyDeprecated" : "georef.whyBallpark",
    { from: String(ci.epsg), was: accWords(ci.to_wgs84?.accuracy), now: accWords(r.to_wgs84?.accuracy) });
  return { node: g.id, txt: t("georef.propose", { why, to: String(r.epsg), kind: t(r.same_grid ? "georef.proposeSame" : "georef.proposeOther") }),
           label: t("georef.convert", { epsg: String(r.epsg) }), run: () => { void convertGeoreference(store, r.epsg, r.same_grid, deps, why); } };
}

/**
 * At the opening of a graph and after a SHIFT.txt: a deprecated CRS or a
 * «ballpark» operation is said once in the Log, with «Convert to EPSG:NNNN» —
 * one click, one undo step — the reason and the accuracy before and after.
 * Never converted in silence; left alone, nothing changes.
 */
export async function proposeConversion(store: DocumentStore, deps: Pick<GeorefDeps, "bridge" | "log" | "done" | "say">,
                                        ask: (msg: string, answers: { label: string; run: () => void }[]) => void): Promise<string | null> {
  const ci = await crsInfoNow(store, deps.bridge);
  const w = crsWarning(ci);
  const r = w?.to?.[0];
  if (!ci || !w || !r) return null;
  const why = t(w.why === "deprecated" ? "georef.whyDeprecated" : "georef.whyBallpark",
    { from: String(ci.epsg), was: accWords(ci.to_wgs84?.accuracy), now: accWords(r.to_wgs84?.accuracy) });
  const msg = t("georef.propose", { why, to: String(r.epsg), kind: t(r.same_grid ? "georef.proposeSame" : "georef.proposeOther") });
  const g = store.geoPositionNode();
  deps.log(msg, g ? [g.id] : []);
  ask(msg, [{ label: t("georef.convert", { epsg: String(r.epsg) }), run: () => { void convertGeoreference(store, r.epsg, r.same_grid, deps, why); } }]);
  return msg;
}

/** the accuracy in words: «±3 m», or «accuracy unknown» */
const accWords = (a: number | null | undefined): string => (a == null ? t("georef.accUnknown") : t("georef.acc", { m: fmtCoord(a) }));

/**
 * Convert the georeference to `to` — the same grid: the code only; another grid:
 * the shift reprojected by the bridge — in ONE undo step; the Log says what and why.
 */
export async function convertGeoreference(store: DocumentStore, to: number, sameGrid: boolean,
                                           deps: Pick<GeorefDeps, "bridge" | "log" | "done" | "say">,
                                           why: string): Promise<boolean> {
  const g = store.geoPositionNode();
  if (!g) return false;
  const d = (g.data ?? {}) as Record<string, unknown>;
  const from = epsgOf(d);
  if (from === null) return false;
  let patch: Record<string, unknown> | null = null;
  let op: { name: string; accuracy: number | null } | null = null;
  if (sameGrid) patch = conversionPatch(true, to);
  else {
    const base = await deps.bridge().catch(() => null);
    if (!base) { deps.say(t("georef.noBridge")); return false; }
    const r = await fetch(`${base}/geo/convert-shift`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, x: Number(d.shift_x) || 0, y: Number(d.shift_y) || 0 }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!j?.ok) { deps.say(t("georef.convertFailed", { why: String(j?.error ?? r?.status ?? "?") })); return false; }
    patch = conversionPatch(false, to, { x: j.x, y: j.y });
    op = j.op ?? null;
  }
  if (!patch) return false;
  store.setGeoreference(patch);
  const msg = sameGrid
    ? t("georef.convertedSame", { from: String(from), to: String(to), why })
    : t("georef.convertedOther", { from: String(from), to: String(to), x: fmtCoord(Number(patch.shift_x)), y: fmtCoord(Number(patch.shift_y)),
        op: op?.name ?? "?", acc: accWords(op?.accuracy), why });
  deps.log(msg, [g.id]);
  deps.done(msg);
  return true;
}

/** The section, drawn into `host` (the Inspector of the graph, the Study panel) */
export function renderGeorefSection(host: HTMLElement, store: DocumentStore, deps: GeorefDeps): void {
  const sec = el("div", "georef-sec");
  sec.dataset.section = "georef";
  sec.appendChild(el("h3", "insp-sect", t("georef.section")));
  host.appendChild(sec);
  const g = store.geoPositionNode();
  if (!g) {
    sec.appendChild(el("div", "insp-hint", t("georef.none")));
    const row = el("div", "georef-acts");
    const make = el("button", "insp-btn", t("georef.create")) as HTMLButtonElement;
    make.dataset.georef = "create";
    make.title = t("georef.createHint");
    make.addEventListener("click", () => {
      store.setGeoreference({});
      deps.done(t("georef.created"));
    });
    const imp = el("button", "insp-btn", t("georef.import")) as HTMLButtonElement;
    imp.dataset.georef = "import";
    imp.addEventListener("click", () => deps.importShift());
    row.append(make, imp);
    sec.appendChild(row);
    sec.appendChild(el("div", "insp-hint", t("georef.shiftNotPin")));
    return;
  }
  const d = (g.data ?? {}) as Record<string, unknown>;
  const epsg = epsgOf(d);
  const sx = Number(d.shift_x) || 0, sy = Number(d.shift_y) || 0, sz = Number(d.shift_z) || 0;
  // one undo step, and the section drawn again (the Inspector shows the graph's node, not this one)
  const write = (patch: Record<string, unknown>) => { store.setGeoreference(patch); deps.redraw(); };

  const grid = el("div", "georef-grid");
  sec.appendChild(grid);
  const field = (label: string, key: string, value: string, hint: string, parse: (v: string) => unknown | undefined) => {
    const l = el("label", "georef-f");
    l.appendChild(el("span", "insp-field-label", label));
    const i = document.createElement("input");
    i.className = "insp-name-input";
    i.inputMode = "decimal";
    i.value = value;
    i.dataset.georefField = key;
    i.title = hint;
    i.addEventListener("change", () => {
      const v = parse(i.value.trim());
      if (v === undefined) { i.value = value; i.classList.add("georef-bad"); return; }
      write({ [key]: v });
    });
    l.appendChild(i);
    grid.appendChild(l);
    return i;
  };
  const numOrUndef = (s: string) => { if (s === "") return 0; const n = Number(s.replace(",", ".")); return Number.isFinite(n) ? n : undefined; };
  field("EPSG", "epsg", epsg === null ? "" : String(epsg), t("georef.epsgHint"), (s) => {
    if (s === "") return null;
    const n = Number(s.replace(/^EPSG:+/i, ""));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  });
  // the CRS's name, read from PROJ
  const nameRow = el("div", "georef-crs");
  nameRow.dataset.georef = "crs";
  sec.insertBefore(nameRow, grid.nextSibling);
  field(t("georef.x"), "shift_x", fmtCoord(sx), t("georef.shiftHint"), numOrUndef);
  field(t("georef.y"), "shift_y", fmtCoord(sy), t("georef.shiftHint"), numOrUndef);
  const zi = field(t("georef.z"), "shift_z", fmtCoord(sz), t("georef.zHint"), numOrUndef);
  field(t("georef.azimuth"), "rotation", fmtCoord(Number(d.rotation) || 0), t("georef.azimuthHint"), numOrUndef);
  // the vertical reference
  const vl = el("label", "georef-f");
  vl.appendChild(el("span", "insp-field-label", t("georef.vertical")));
  const vs = document.createElement("select");
  vs.dataset.georefField = "vertical_reference";
  vs.title = t("georef.verticalHint");
  for (const v of VERTICAL_REFERENCES) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t(`georef.vertical.${v}`);
    o.selected = verticalOf(d) === v;
    vs.appendChild(o);
  }
  vs.addEventListener("change", () => write({ vertical_reference: vs.value === "orthometric" ? null : vs.value }));
  vl.appendChild(vs);
  grid.appendChild(vl);
  // E.D.'s rule: the heights are in the models, the shift's z is 0; another z is a choice, said
  if (sz !== 0) {
    zi.classList.add("georef-zchoice");
    const z = el("div", "georef-warn", t("georef.zChoice", { z: fmtCoord(sz) }));
    z.dataset.georef = "z-choice";
    sec.appendChild(z);
  }
  // PROJ: the name, the operation to WGS 84 at the shift, a deprecated or ballpark CRS
  if (epsg !== null) {
    const info = crsInfoOf(epsg, sx, sy, deps);
    if (!info) nameRow.textContent = t("georef.reading");
    else if ("error" in info && !("ok" in info)) { nameRow.textContent = t("georef.unread", { why: info.error }); nameRow.dataset.georef = "crs-unread"; }
    else {
      const ci = info as CrsInfo;
      nameRow.textContent = ci.ok ? `${ci.name ?? ""}${ci.kind === "projected" || ci.kind === "geographic" ? ` · ${t(`georef.kind.${ci.kind}`)}` : ""}` : t("georef.unread", { why: ci.error ?? "?" });
      if (ci.ok && ci.to_wgs84) {
        const a = el("div", "insp-hint georef-acc", t("georef.op", { op: ci.to_wgs84.name, acc: accWords(ci.to_wgs84.accuracy) }));
        a.dataset.georef = "accuracy";
        a.dataset.accuracy = ci.to_wgs84.accuracy == null ? "unknown" : String(ci.to_wgs84.accuracy);
        sec.appendChild(a);
      }
      const w = crsWarning(ci);
      if (w) {
        const box = el("div", "georef-warn");
        box.dataset.georef = `warn-${w.why}`;
        box.appendChild(el("div", "", w.why === "deprecated"
          ? t("georef.deprecated", { epsg: String(epsg), acc: accWords(ci.to_wgs84?.accuracy) })
          : t("georef.ballpark", { epsg: String(epsg) })));
        if (!w.to?.length) box.appendChild(el("div", "insp-hint", t("georef.noReplacement")));
        for (const r of w.to ?? []) {
          const line = el("div", "georef-repl");
          line.appendChild(el("span", "", t(r.same_grid ? "georef.replSame" : "georef.replOther",
            { epsg: String(r.epsg), name: r.name, acc: accWords(r.to_wgs84?.accuracy), was: accWords(ci.to_wgs84?.accuracy) })));
          const b = el("button", "insp-btn primary", t("georef.convert", { epsg: String(r.epsg) })) as HTMLButtonElement;
          b.dataset.georef = "convert";
          b.dataset.to = String(r.epsg);
          b.addEventListener("click", () => {
            b.disabled = true;
            void convertGeoreference(store, r.epsg, r.same_grid, deps,
              t(w.why === "deprecated" ? "georef.whyDeprecated" : "georef.whyBallpark", { from: String(epsg), was: accWords(ci.to_wgs84?.accuracy), now: accWords(r.to_wgs84?.accuracy) }))
              .finally(() => { b.disabled = false; });
          });
          line.appendChild(b);
          box.appendChild(line);
        }
        sec.appendChild(box);
      }
    }
  } else nameRow.textContent = t("georef.noEpsg");
  // SHIFT.txt in and out
  const acts = el("div", "georef-acts");
  const imp = el("button", "insp-btn", t("georef.import")) as HTMLButtonElement;
  imp.dataset.georef = "import";
  imp.title = t("georef.importHint");
  imp.addEventListener("click", () => deps.importShift());
  const exp = el("button", "insp-btn", t("georef.export")) as HTMLButtonElement;
  exp.dataset.georef = "export";
  exp.title = t("georef.exportHint");
  const line = formatShiftTxt(d);
  exp.disabled = !line;
  exp.addEventListener("click", () => { if (line) deps.download("SHIFT.txt", line); });
  acts.append(imp, exp);
  sec.appendChild(acts);
  // the shift is not the pin
  sec.appendChild(el("div", "insp-hint", t("georef.shiftNotPin")));
}
