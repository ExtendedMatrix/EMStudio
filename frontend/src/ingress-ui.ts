/**
 * MICRO-INGRESSO-ASSET-1 · the ROOM of «Fai entrare un asset»: a large dialog
 * over the Archive (V1 = A + C — the context menu is the door, this is the
 * room, never squeezed into the side panel), the five steps in a row, the
 * summary and «Fai entrare».
 *
 * What is decided lives in `ingress.ts`; this module draws it and asks. It
 * imports nothing of main.ts: the bridge, the 3D view, the documents of the
 * graph and the work itself come in as `IngressDeps`.
 */
import { t, tn } from "./i18n";
import { basename } from "./paths";
import {
  AFTERS, FRAME_MODES, MASTER_KINDS, PROVENANCES, STEPS,
  documentsOf, effective, entering, frameMissing, nextPointId, pairs, readyToEnter,
  residualText, scaleAllowed, summary,
  type ControlPoint, type IngressState, type PointsFit, type V3,
} from "./ingress";

export interface IngressViewer { dispose(): void; setMarkers?(m: Array<{ id: string; label: string; vertices: V3[]; selected?: boolean }>): void }

export interface IngressDeps {
  /** the bridge's base URL (the fit and the files of points are its) */
  bridge(): Promise<string>;
  /** an address the 3D view can load for a model file, or null (not a model) */
  modelUrl(path: string): string | null;
  /** the 3D view (embed3d-native's `mount3dViewer`) */
  mountViewer(host: HTMLElement, url: string, onPick: (p: V3) => void): IngressViewer;
  /** the documents of the open graph («existing») */
  documents(): Array<{ id: string; name: string; description: string }>;
  /** the text files beside the assets (a total station's file, markers) */
  textFiles(): Promise<Array<{ path: string; name: string }>>;
  /** every name already given in the graph */
  takenNames(): string[];
  /** the licences offered (the vocabulary of the study, or a short default) */
  licenses(): string[];
  /** «Fai entrare»: the work. Resolves with the lines to say. */
  enter(state: IngressState): Promise<{ ok: boolean; lines: string[] }>;
  /** the graph has no open document: the dialog says it and does not enter */
  hasGraph(): boolean;
  onClose(): void;
}

let openBox: HTMLElement | null = null;
let openViewer: IngressViewer | null = null;
/** the 3D view lives across the dialog's redraws: a click must not reload a
 *  model of a hundred megabytes */
let viewerStage: HTMLElement | null = null;
let viewerUrl = "";

export function ingressIsOpen(): boolean { return !!openBox; }

export function closeIngress(): void {
  openViewer?.dispose();
  openViewer = null;
  viewerStage = null;
  viewerUrl = "";
  openBox?.remove();
  openBox = null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function numInput(v: number | null | undefined, onChange: (n: number | null) => void, act: string): HTMLInputElement {
  const i = el("input");
  i.type = "text";
  i.inputMode = "decimal";
  i.className = "ingress-num";
  i.dataset.field = act;
  i.value = v == null ? "" : String(v);
  i.onchange = () => {
    const s = i.value.trim().replace(",", ".");
    const n = s === "" ? null : Number(s);
    onChange(n !== null && Number.isFinite(n) ? n : null);
  };
  return i;
}

function choiceRow<T extends string>(values: readonly T[], current: T, label: (v: T) => string,
                                     onPick: (v: T) => void, act: string, disabled?: (v: T) => string | null): HTMLElement {
  const row = el("div", "ingress-choices");
  row.dataset.choice = act;
  for (const v of values) {
    const b = el("button", "ingress-choice" + (v === current ? " on" : ""), label(v));
    b.type = "button";
    b.dataset.value = v;
    b.setAttribute("aria-pressed", String(v === current));
    const why = disabled?.(v) ?? null;
    if (why) { b.disabled = true; b.title = why; }
    b.onclick = () => onPick(v);
    row.appendChild(b);
  }
  return row;
}

/**
 * Open the procedure on a state already made (`newIngress`). The dialog
 * re-draws itself after each choice; the state is the caller's object, so a
 * probe reads exactly what the dialog shows.
 */
export function openIngress(s: IngressState, deps: IngressDeps): HTMLElement {
  closeIngress();
  const veil = el("div", "ingress-veil");
  veil.dataset.ingress = "open";
  const box = el("div", "ingress");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  veil.appendChild(box);
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) close(); });
  veil.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  for (const ev of ["wheel", "contextmenu", "dblclick"]) box.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(veil);
  openBox = veil;
  let busy = false;
  let lastLines: string[] = [];
  let fitTimer: ReturnType<typeof setTimeout> | null = null;
  let activePoint = 0;
  let files: Array<{ path: string; name: string }> | null = null;
  let worldFile = "";
  let markerFile = "";
  let fileNote = "";

  function close(): void { closeIngress(); deps.onClose(); }

  const taken = (): string[] => deps.takenNames();

  /** the world coordinates being typed, before all three are numbers */
  const typing = new WeakMap<ControlPoint, Array<number | null>>();

  function draw(): void {
    box.textContent = "";
    box.dataset.step = s.step;
    // the head: the title, what enters, the close
    const head = el("div", "ingress-head");
    const n = entering(s).length;
    head.append(el("b", "", t("ingress.title")), el("span", "ingress-what",
      n === 1 ? entering(s)[0].name : tn("ingress.assetsN", n)));
    const x = el("button", "ghost ingress-close", "✕");
    x.type = "button";
    x.title = t("ingress.close");
    x.dataset.action = "ingress-close";
    x.onclick = close;
    head.appendChild(x);
    box.appendChild(head);
    // the five steps in a row
    const steps = el("ol", "ingress-steps");
    STEPS.forEach((k, i) => {
      const li = el("li", "ingress-step" + (k === s.step ? " on" : ""));
      li.dataset.stepKey = k;
      const b = el("button", "", `${i + 1} · ${t(`ingress.step.${k}`)}`);
      b.type = "button";
      b.onclick = () => { s.step = k; draw(); };
      li.appendChild(b);
      steps.appendChild(li);
    });
    box.appendChild(steps);
    const body = el("div", "ingress-body");
    body.dataset.body = s.step;
    box.appendChild(body);
    if (s.step === "choose") drawChoose(body);
    else if (s.step === "frame") drawFrame(body);
    else if (s.step === "document") drawDocument(body);
    else if (s.step === "stamp") drawStamp(body);
    else drawAfter(body);
    // the foot: back, next, and on every step the way to enter
    const foot = el("div", "ingress-foot");
    const i = STEPS.indexOf(s.step);
    const back = el("button", "ghost", t("ingress.back"));
    back.type = "button";
    back.dataset.action = "ingress-back";
    back.disabled = i === 0;
    back.onclick = () => { s.step = STEPS[Math.max(0, i - 1)]; draw(); };
    const why = readyToEnter(s);
    const note = el("span", "ingress-why", why ? t(why) : !deps.hasGraph() ? t("ingress.why.graph") : "");
    note.dataset.why = why ?? (!deps.hasGraph() ? "ingress.why.graph" : "");
    foot.append(back, note);
    if (i < STEPS.length - 1) {
      const next = el("button", "", t("ingress.next"));
      next.type = "button";
      next.dataset.action = "ingress-next";
      next.onclick = () => { s.step = STEPS[i + 1]; draw(); };
      foot.appendChild(next);
    }
    const go = el("button", "primary", busy ? t("ingress.entering") : t("ingress.enter"));
    go.type = "button";
    go.dataset.action = "ingress-enter";
    go.disabled = busy || !!why || !deps.hasGraph();
    go.onclick = () => { void enter(); };
    foot.appendChild(go);
    box.appendChild(foot);
    if (lastLines.length) {
      const out = el("ul", "ingress-result");
      for (const l of lastLines) out.appendChild(el("li", "", l));
      box.appendChild(out);
    }
  }

  // ── 1 · Choose ─────────────────────────────────────────────────────────────
  function drawChoose(body: HTMLElement): void {
    body.appendChild(el("p", "ingress-hint", t("ingress.choose.hint")));
    if (s.assets.length > 1) {
      body.appendChild(el("h4", "", t("ingress.choose.grouping")));
      body.appendChild(choiceRow(["container", "each"] as const, s.grouping,
        (v) => t(`ingress.grouping.${v}`), (v) => { s.grouping = v; draw(); }, "grouping"));
    }
    const docs = documentsOf(s, taken());
    const nameOf = (path: string): string => docs.find((d) => d.assets.some((a) => a.path === path))?.name ?? "";
    const table = el("table", "ingress-assets");
    const hr = el("tr");
    for (const k of ["file", "doc", "provenance", "master", "frame"]) hr.appendChild(el("th", "", t(`ingress.col.${k}`)));
    table.appendChild(hr);
    for (const a of s.assets) {
      const o = (s.overrides[a.path] ??= {});
      const e = effective(s, a);
      const tr = el("tr", o.skip ? "skip" : "");
      tr.dataset.asset = a.path;
      const c0 = el("td");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = !o.skip;
      cb.dataset.action = "ingress-include";
      cb.onchange = () => { o.skip = !cb.checked; draw(); };
      c0.append(cb, el("span", "ingress-file", ` ${a.type === "datablock" ? "▲ " : ""}${a.name}`));
      if (a.blend) c0.appendChild(el("span", "ingress-sub", t("ingress.choose.fromBlend", { blend: basename(a.blend.file) })));
      const c1 = el("td");
      if (s.grouping === "each" && s.assets.length > 1 && s.doc.mode === "new") {
        const inp = el("input");
        inp.value = o.docName ?? nameOf(a.path);
        inp.dataset.field = "doc-name";
        inp.className = "ingress-docname";
        inp.onchange = () => { o.docName = inp.value.trim() || undefined; draw(); };
        c1.appendChild(inp);
      } else c1.textContent = o.skip ? "—" : nameOf(a.path);
      const sel = <T extends string>(vals: readonly T[], cur: T, key: string, set: (v: T) => void): HTMLSelectElement => {
        const sl = el("select");
        sl.dataset.field = key;
        for (const v of vals) { const op = el("option", "", t(`ingress.${key}.${v}`)); op.value = v; sl.appendChild(op); }
        sl.value = cur;
        sl.onchange = () => { set(sl.value as T); draw(); };
        return sl;
      };
      const c2 = el("td"); c2.appendChild(sel(PROVENANCES, e.provenance, "provenance", (v) => { o.provenance = v === s.doc.provenance ? undefined : v; }));
      const c3 = el("td"); c3.appendChild(sel(MASTER_KINDS, e.master, "master", (v) => { o.master = v === s.stamp.master ? undefined : v; }));
      const c4 = el("td"); c4.appendChild(sel(FRAME_MODES, e.frameMode, "frame", (v) => { o.frameMode = v === s.frame.mode ? undefined : v; }));
      tr.append(c0, c1, c2, c3, c4);
      table.appendChild(tr);
    }
    body.appendChild(table);
    if (s.assets.length > 1) body.appendChild(el("p", "ingress-hint", t("ingress.choose.perFile")));
  }

  // ── 2 · Frame ──────────────────────────────────────────────────────────────
  function drawFrame(body: HTMLElement): void {
    const f = s.frame;
    body.appendChild(el("p", "ingress-hint", t("ingress.frame.hint")));
    body.appendChild(choiceRow(FRAME_MODES, f.mode, (v) => t(`ingress.frame.${v}`), (v) => { f.mode = v; draw(); }, "frame-mode"));
    const epsgRow = (): HTMLElement => {
      const row = el("div", "ingress-row");
      const l = el("label", "", f.mode === "points" ? t("ingress.frame.epsgPoints") : t("ingress.frame.epsgCode"));
      l.appendChild(numInput(f.epsg, (n) => { f.epsg = n ? Math.round(n) : null; f.fit = null; draw(); }, "epsg"));
      row.appendChild(l);
      return row;
    };
    if (f.mode === "already") {
      body.appendChild(el("p", "ingress-note", t("ingress.frame.alreadyNote")));
    } else if (f.mode === "epsg") {
      body.appendChild(epsgRow());
      const row = el("div", "ingress-row");
      (["x", "y", "z"] as const).forEach((k, i) => {
        const l = el("label", "", t(`ingress.frame.shift${k.toUpperCase()}`));
        l.appendChild(numInput(f.shift[i], (n) => { f.shift[i] = n ?? 0; f.shiftSource = "manual"; draw(); }, `shift-${k}`));
        row.appendChild(l);
      });
      body.appendChild(row);
      body.appendChild(el("p", "ingress-note", f.shiftSource === "file"
        ? t("ingress.frame.fromFile", { file: f.shiftNote }) : f.shiftSource === "graph" ? t("ingress.frame.fromGraph") : t("ingress.frame.typed")));
      body.appendChild(el("p", "ingress-note", t("ingress.frame.masterNote")));
    } else drawPoints(body, epsgRow);
  }

  function drawPoints(body: HTMLElement, epsgRow: () => HTMLElement): void {
    const f = s.frame;
    body.appendChild(epsgRow());
    body.appendChild(choiceRow(["view", "file"] as const, f.pointsFrom, (v) => t(`ingress.points.${v}`),
      (v) => { f.pointsFrom = v; draw(); }, "points-from"));
    const cols = el("div", "ingress-points");
    const left = el("div", "ingress-points-left");
    cols.appendChild(left);
    if (f.pointsFrom === "view") {
      const model = entering(s).map((a) => deps.modelUrl(a.path)).find((u): u is string => !!u) ?? null;
      if (model && (!viewerStage || viewerUrl !== model)) {
        openViewer?.dispose();
        viewerStage = el("div", "ingress-view");
        viewerStage.dataset.view = "model";
        viewerUrl = model;
        const stage = viewerStage;
        queueMicrotask(() => {
          if (!stage.isConnected) return;
          openViewer = deps.mountViewer(stage, model, (p) => {
            const row = f.points[activePoint] ?? f.points.find((x) => !x.local);
            if (!row) return;
            row.local = p;
            f.fit = null;
            const next = f.points.findIndex((x) => !x.local);
            activePoint = next >= 0 ? next : activePoint;
            draw();
            scheduleFit();
          });
          paintMarkers();
        });
      }
      if (model && viewerStage) {
        left.appendChild(viewerStage);
        left.appendChild(el("p", "ingress-note", t("ingress.points.clickHint", { id: f.points[activePoint]?.id ?? "" })));
        paintMarkers();
      } else {
        const none = el("div", "ingress-view", t("ingress.points.noModel"));
        none.dataset.view = "none";
        left.appendChild(none);
      }
    } else drawPointFiles(left);
    const right = el("div", "ingress-points-right");
    right.appendChild(pointsTable());
    const scaleBox = el("label", "ingress-scale");
    const cb = el("input");
    cb.type = "checkbox";
    cb.dataset.field = "scale";
    const lidar = entering(s).some((a) => !scaleAllowed(effective(s, a).provenance));
    cb.checked = f.scale && !lidar;
    cb.disabled = lidar;
    cb.onchange = () => { f.scale = cb.checked; f.fit = null; draw(); scheduleFit(); };
    scaleBox.append(cb, document.createTextNode(" " + t("ingress.points.scale")));
    if (lidar) scaleBox.appendChild(el("span", "ingress-sub", t("ingress.points.lidarScale")));
    right.appendChild(scaleBox);
    const fitBtn = el("button", "", t("ingress.points.fit"));
    fitBtn.type = "button";
    fitBtn.dataset.action = "ingress-fit";
    fitBtn.disabled = pairs(f.points).filter((p) => p.use).length < 3;
    fitBtn.onclick = () => { void runFit(); };
    right.appendChild(fitBtn);
    right.appendChild(fitSummary(f.fit));
    cols.appendChild(right);
    body.appendChild(cols);
  }

  function paintMarkers(): void {
    openViewer?.setMarkers?.(s.frame.points.map((x, i) => ({ x, i })).filter(({ x }) => x.local)
      .map(({ x, i }) => ({ id: x.id, label: x.id, vertices: [x.local!], selected: i === activePoint })));
  }

  function pointsTable(): HTMLElement {
    const f = s.frame;
    const table = el("table", "ingress-ptable");
    const hr = el("tr");
    for (const k of ["id", "local", "world", "use", "residual"]) hr.appendChild(el("th", "", t(`ingress.pcol.${k}`)));
    table.appendChild(hr);
    f.points.forEach((p, i) => {
      const tr = el("tr", i === activePoint ? "on" : "");
      tr.dataset.point = p.id;
      tr.onclick = (e) => { if ((e.target as HTMLElement).tagName === "INPUT") return; activePoint = i; draw(); };
      const id = el("input");
      id.value = p.id;
      id.className = "ingress-pid";
      id.dataset.field = "point-id";
      id.onchange = () => { p.id = id.value.trim() || p.id; f.fit = null; draw(); };
      const c0 = el("td"); c0.appendChild(id);
      const c1 = el("td", "ingress-local", p.local ? p.local.map((v) => v.toFixed(3)).join(", ") : t("ingress.points.toClick"));
      const c2 = el("td", "ingress-world");
      const shown = typing.get(p) ?? (p.world ? [...p.world] : [null, null, null]);
      [0, 1, 2].forEach((k) => c2.appendChild(numInput(shown[k], (n) => {
        const w = typing.get(p) ?? (p.world ? [...p.world] : [null, null, null]);
        w[k] = n;
        typing.set(p, w);
        p.world = w.every((v) => v !== null) ? (w as V3) : null;
        f.fit = null;
        scheduleFit();
      }, `world-${k}`)));
      const c3 = el("td");
      const u = el("input");
      u.type = "checkbox";
      u.checked = p.use;
      u.dataset.field = "point-use";
      u.onchange = () => { p.use = u.checked; f.fit = null; draw(); scheduleFit(); };
      c3.appendChild(u);
      const r = f.fit?.residuals?.[p.id];
      const c4 = el("td", "ingress-res" + (r != null && f.fit?.rms != null && r > 3 * Math.max(f.fit.rms, 0.005) ? " high" : ""), residualText(r));
      c4.dataset.residual = r == null ? "" : String(r);
      const del = el("button", "ghost", "✕");
      del.type = "button";
      del.title = t("ingress.points.remove");
      del.onclick = (e) => { e.stopPropagation(); f.points.splice(i, 1); activePoint = Math.min(activePoint, f.points.length - 1); f.fit = null; draw(); scheduleFit(); };
      c4.appendChild(del);
      tr.append(c0, c1, c2, c3, c4);
      table.appendChild(tr);
    });
    const add = el("button", "ghost", t("ingress.points.add"));
    add.type = "button";
    add.dataset.action = "ingress-add-point";
    add.disabled = f.points.length >= 12;
    add.onclick = () => { f.points.push({ id: nextPointId(f.points), local: null, world: null, use: true }); activePoint = f.points.length - 1; draw(); };
    const wrap = el("div");
    wrap.append(table, add);
    return wrap;
  }

  function fitSummary(fit: PointsFit | null): HTMLElement {
    const box = el("div", "ingress-fit");
    box.dataset.fit = fit ? (fit.ok ? "ok" : "failed") : "none";
    if (!fit) { box.textContent = t("ingress.points.noFit"); return box; }
    if (!fit.ok) { box.textContent = t("ingress.points.fitFailed", { why: fit.error ?? "" }); return box; }
    box.appendChild(el("div", "", t("ingress.points.fitLine", { n: String(fit.n ?? 0), mean: residualText(fit.mean), rms: residualText(fit.rms),
      max: residualText(fit.max) })));
    if (fit.scaled) box.appendChild(el("div", "", t("ingress.points.scaleLine", { s: (fit.scale ?? 1).toFixed(5) })));
    // s3Dgraphy's warnings are said in the reader's words (its sentences are English)
    if (fit.n === 3) box.appendChild(el("div", "ingress-sub", t("ingress.points.noRedundancy")));
    if (fit.scaled && Math.abs((fit.scale ?? 1) - 1) > 0.05)
      box.appendChild(el("div", "ingress-sub", t("ingress.points.scaleFar", { pct: (Math.abs((fit.scale ?? 1) - 1) * 100).toFixed(1) })));
    return box;
  }

  function drawPointFiles(left: HTMLElement): void {
    left.appendChild(el("p", "ingress-note", t("ingress.points.fileHint")));
    if (!files) {
      left.appendChild(el("p", "ingress-note", t("ingress.points.reading")));
      void deps.textFiles().then((l) => { files = l; draw(); }, () => { files = []; draw(); });
      return;
    }
    const pick = (label: string, cur: string, set: (p: string) => void, key: string): HTMLElement => {
      const l = el("label", "ingress-row", label + " ");
      const sl = el("select");
      sl.dataset.field = key;
      const none = el("option", "", "—"); none.value = ""; sl.appendChild(none);
      for (const x of files!) { const o = el("option", "", x.name); o.value = x.path; sl.appendChild(o); }
      sl.value = cur;
      sl.onchange = () => { set(sl.value); };
      l.appendChild(sl);
      return l;
    };
    left.appendChild(pick(t("ingress.points.worldFile"), worldFile, (p) => { worldFile = p; }, "world-file"));
    left.appendChild(pick(t("ingress.points.markerFile"), markerFile, (p) => { markerFile = p; }, "marker-file"));
    const paste = el("textarea", "ingress-paste");
    paste.placeholder = t("ingress.points.pastePh");
    paste.dataset.field = "world-text";
    left.appendChild(paste);
    const read = el("button", "", t("ingress.points.read"));
    read.type = "button";
    read.dataset.action = "ingress-read-points";
    read.onclick = () => { void readPoints(paste.value); };
    left.appendChild(read);
    if (fileNote) left.appendChild(el("p", "ingress-note", fileNote));
  }

  async function post(route: string, body: unknown): Promise<Record<string, unknown>> {
    const r = await fetch(`${await deps.bridge()}${route}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body) });
    if (r.status === 404) return { ok: false, error: t("ingress.oldBridge") };
    return await r.json().catch(() => ({ ok: false, error: `bridge ${r.status}` })) as Record<string, unknown>;
  }

  /** the world points (a file or the pasted text), paired by name with the
   *  markers on the model when their file is given, else in order */
  async function readPoints(text: string): Promise<void> {
    const f = s.frame;
    try {
      let markers: Array<{ id: string; xyz: V3 }> | null = null;
      if (markerFile) {
        const m = await post("/geo/parse-points", { path: markerFile });
        markers = (m.points as Array<{ id: string; xyz: V3 }> | undefined) ?? [];
      }
      const w = await post("/geo/parse-points", text.trim() ? { text, local: markers ?? undefined }
                                                           : { path: worldFile, local: markers ?? undefined });
      if (w.ok === false) { fileNote = String(w.error ?? ""); draw(); return; }
      const world = (w.points as Array<{ id: string; xyz: V3 }> | undefined) ?? [];
      const skipped = (w.skipped as unknown[] | undefined)?.length ?? 0;
      if (markers) {
        const pr = w.pairing as { pairs: Array<{ id: string; local: V3; world: V3 }>; only_local: string[]; only_world: string[] };
        f.points = pr.pairs.map((p) => ({ id: p.id, local: p.local, world: p.world, use: true }));
        fileNote = t("ingress.points.paired", { n: String(pr.pairs.length), ol: pr.only_local.join(", ") || "—", ow: pr.only_world.join(", ") || "—" });
      } else {
        // the world coordinates by name onto the rows that have it, else in order
        const byId = new Map(f.points.map((p) => [p.id.toLowerCase(), p]));
        const rows: ControlPoint[] = [];
        world.forEach((p, i) => {
          const row = byId.get(p.id.toLowerCase()) ?? f.points[i];
          if (row) { row.id = p.id; row.world = p.xyz; typing.delete(row); rows.push(row); }
          else rows.push({ id: p.id, local: null, world: p.xyz, use: true });
        });
        f.points = rows.length ? rows : f.points;
        fileNote = t("ingress.points.read1", { n: String(world.length), s: String(skipped) });
      }
      f.fit = null;
      draw();
      scheduleFit();
    } catch {
      fileNote = t("ingress.bridgeDown");
      draw();
    }
  }

  function scheduleFit(): void {
    if (fitTimer) clearTimeout(fitTimer);
    if (pairs(s.frame.points).filter((p) => p.use).length < 3) return;
    fitTimer = setTimeout(() => { void runFit(); }, 250);
  }

  async function runFit(): Promise<void> {
    const f = s.frame;
    const ps = pairs(f.points);
    if (ps.filter((p) => p.use).length < 3) return;
    const lidar = entering(s).some((a) => !scaleAllowed(effective(s, a).provenance));
    try {
      const out = await post("/geo/fit-points", { points: ps, scale: f.scale && !lidar });
      f.fit = out as unknown as PointsFit;
      if (f.fit.ok === undefined) f.fit.ok = false;
    } catch {
      f.fit = { ok: false, error: t("ingress.bridgeDown") };
    }
    if (openBox) draw();
  }

  // ── 3 · Document ───────────────────────────────────────────────────────────
  function drawDocument(body: HTMLElement): void {
    const d = s.doc;
    body.appendChild(choiceRow(["new", "existing"] as const, d.mode, (v) => t(`ingress.doc.${v}`), (v) => { d.mode = v; draw(); }, "doc-mode"));
    const field = (label: string, input: HTMLElement): HTMLElement => { const l = el("label", "ingress-field", label); l.appendChild(input); return l; };
    if (d.mode === "existing") {
      const sl = el("select");
      sl.dataset.field = "doc-existing";
      const none = el("option", "", "—"); none.value = ""; sl.appendChild(none);
      for (const x of deps.documents()) { const o = el("option", "", `${x.name} · ${x.description.slice(0, 48)}`); o.value = x.id; sl.appendChild(o); }
      sl.value = d.existingId;
      sl.onchange = () => { d.existingId = sl.value; d.name = deps.documents().find((x) => x.id === sl.value)?.name ?? d.name; draw(); };
      body.appendChild(field(t("ingress.doc.pick"), sl));
    } else {
      const name = el("input"); name.value = d.name; name.dataset.field = "doc-name";
      name.onchange = () => { d.name = name.value.trim(); draw(); };
      body.appendChild(field(s.grouping === "each" && entering(s).length > 1 ? t("ingress.doc.firstName") : t("ingress.doc.name"), name));
      if (s.grouping === "each" && entering(s).length > 1)
        body.appendChild(el("p", "ingress-note", t("ingress.doc.names", { names: documentsOf(s, taken()).map((x) => x.name).join(", ") })));
      else if (entering(s).length > 1) body.appendChild(el("p", "ingress-note", t("ingress.doc.container", { n: String(entering(s).length) })));
      const desc = el("textarea"); desc.value = d.description; desc.dataset.field = "doc-description";
      desc.onchange = () => { d.description = desc.value; };
      body.appendChild(field(t("ingress.doc.description"), desc));
      const date = el("input"); date.type = "date"; date.value = d.date; date.dataset.field = "doc-date";
      date.onchange = () => { d.date = date.value; draw(); };
      body.appendChild(field(t("ingress.doc.date"), date));
    }
    const author = el("input"); author.value = d.author; author.dataset.field = "doc-author";
    author.onchange = () => { d.author = author.value.trim(); };
    body.appendChild(field(t("ingress.doc.author"), author));
    body.appendChild(el("h4", "", t("ingress.doc.provenance")));
    body.appendChild(choiceRow(PROVENANCES, d.provenance, (v) => t(`ingress.provenance.${v}`), (v) => { d.provenance = v; if (v === "lidar") s.frame.scale = false; draw(); }, "provenance"));
    if (d.provenance === "existing" || d.provenance === "other") {
      const tx = el("input"); tx.value = d.provenanceText; tx.dataset.field = "provenance-text";
      tx.placeholder = t(`ingress.provenancePh.${d.provenance}`);
      tx.onchange = () => { d.provenanceText = tx.value; draw(); };
      body.appendChild(field(t("ingress.doc.provenanceText"), tx));
    }
  }

  // ── 4 · Stamp ──────────────────────────────────────────────────────────────
  function drawStamp(body: HTMLElement): void {
    const st = s.stamp;
    const field = (label: string, input: HTMLElement): HTMLElement => { const l = el("label", "ingress-field", label); l.appendChild(input); return l; };
    body.appendChild(el("h4", "", t("ingress.stamp.master")));
    body.appendChild(choiceRow(MASTER_KINDS, st.master, (v) => t(`ingress.master.${v}`), (v) => { st.master = v; draw(); }, "master"));
    body.appendChild(el("p", "ingress-note", t(`ingress.masterHint.${st.master}`)));
    if (st.master === "complete") {
      const a = el("input"); a.value = st.reducedMesh; a.dataset.field = "reduced-mesh"; a.placeholder = t("ingress.stamp.reducedPh");
      a.onchange = () => { st.reducedMesh = a.value; draw(); };
      const b = el("input"); b.value = st.alignedImages; b.dataset.field = "aligned-images"; b.placeholder = t("ingress.stamp.imagesPh");
      b.onchange = () => { st.alignedImages = b.value; draw(); };
      body.append(field(t("ingress.parent.reducedMesh"), a), field(t("ingress.parent.alignedImages"), b));
    }
    const op = el("input"); op.value = st.operator.label; op.dataset.field = "operator";
    op.onchange = () => { st.operator = { ...st.operator, label: op.value.trim() }; draw(); };
    body.appendChild(field(t("ingress.stamp.operator"), op));
    if (st.operator.id) body.appendChild(el("p", "ingress-sub", st.operator.id));
    else body.appendChild(el("p", "ingress-note", t("ingress.stamp.noOrcid")));
    const lic = el("select"); lic.dataset.field = "license";
    const none = el("option", "", t("ingress.stamp.noLicense")); none.value = ""; lic.appendChild(none);
    for (const x of deps.licenses()) { const o = el("option", "", x); o.value = x; lic.appendChild(o); }
    lic.value = st.license;
    lic.onchange = () => { st.license = lic.value; draw(); };
    body.appendChild(field(t("ingress.stamp.license"), lic));
    const emb = el("input"); emb.type = "date"; emb.value = st.embargoUntil; emb.dataset.field = "embargo";
    emb.onchange = () => { st.embargoUntil = emb.value; draw(); };
    body.appendChild(field(t("ingress.stamp.embargo"), emb));
    body.appendChild(el("h4", "", t("ingress.stamp.chain")));
    body.appendChild(chainPicture());
  }

  function chainPicture(): HTMLElement {
    const box = el("div", "ingress-chains");
    for (const row of summary(s, taken()).slice(0, 6)) {
      const line = el("div", "ingress-chain");
      line.dataset.doc = row.doc;
      row.chain.forEach((c, i) => {
        if (i) line.appendChild(el("span", "ingress-arrow", "→"));
        const label = c.sign === "act" ? `${t(c.key)}: ${c.kind ?? ""}${c.label ? ` (${c.label})` : ""}`
          : c.sign === "file" ? tn("ingress.chain.filesN", Number(c.label))
          : c.sign === "parent" ? `${t(c.key)}${c.label ? `: ${c.label}` : ""}`
          : c.sign === "doc" ? `${t(c.key)} ${c.label ?? ""}` : t(c.key);
        const p = el("span", `ingress-piece ingress-${c.sign}`, label);
        p.dataset.piece = c.sign;
        line.appendChild(p);
      });
      box.appendChild(line);
    }
    return box;
  }

  // ── 5 · After ──────────────────────────────────────────────────────────────
  function drawAfter(body: HTMLElement): void {
    body.appendChild(choiceRow(AFTERS, s.after, (v) => t(`ingress.after.${v}`), (v) => { s.after = v; draw(); }, "after"));
    body.appendChild(el("p", "ingress-note", t(`ingress.afterHint.${s.after}`)));
    body.appendChild(el("h4", "", t("ingress.summary")));
    const table = el("table", "ingress-summary");
    const hr = el("tr");
    for (const k of ["doc", "files", "frame", "act"]) hr.appendChild(el("th", "", t(`ingress.scol.${k}`)));
    table.appendChild(hr);
    for (const r of summary(s, taken())) {
      const tr = el("tr");
      tr.dataset.doc = r.doc;
      tr.append(el("td", "", r.doc + (r.existing ? ` · ${t("ingress.doc.existing")}` : "")),
        el("td", "", r.files.length > 3 ? `${r.files.slice(0, 3).join(", ")} … (${r.files.length})` : r.files.join(", ")),
        el("td", "", t(`ingress.frame.${r.frame}`) + (r.frame === "points" && s.frame.fit?.ok ? ` · RMS ${residualText(s.frame.fit.rms)}` : "")),
        el("td", "", `${r.act.kind}${r.act.technique ? ` · ${r.act.technique}` : ""}`));
      table.appendChild(tr);
    }
    body.appendChild(table);
    body.appendChild(chainPicture());
    const fm = frameMissing(s.frame);
    if (fm) body.appendChild(el("p", "ingress-why", t(fm)));
  }

  async function enter(): Promise<void> {
    if (busy || readyToEnter(s) || !deps.hasGraph()) return;
    busy = true;
    draw();
    try {
      const r = await deps.enter(s);
      lastLines = r.lines;
      busy = false;
      if (r.ok) { close(); return; }
    } catch (err) {
      lastLines = [String((err as Error).message ?? err)];
    }
    busy = false;
    if (openBox) draw();
  }

  draw();
  queueMicrotask(() => box.querySelector<HTMLElement>(".ingress-step.on button")?.focus());
  return veil;
}
