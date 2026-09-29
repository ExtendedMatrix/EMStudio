/**
 * CATENA · the document's own window: you READ it, TRACE on it, DESCRIBE.
 *
 * The medium decides the tool (read off the file, `mediumOf`):
 *   · image — drag a rectangle: an AnnotationRegion (normalised, like A2's)
 *             becomes the reading's geometry;
 *   · text  — select a passage: start, end and the words become the geometry;
 *             «Proponi con AI» asks the provider which passage states the
 *             property (the proposal enters `ai_assisted`, signed by the person);
 *   · 3D    — on the model (`embed3d-native`, raycast), three tools: a POINT
 *             (one click), a LINE (two clicks: a measure), a POLYLINE (clicks,
 *             Enter or a double click closes the open path, Esc cancels it: an
 *             articulated measure). A status line says what is being traced and
 *             how many vertices; the running measure sits by the last vertex.
 *             The place's vertices go to its glb; the markers read them back.
 * The reading's DESCRIPTION is written here, next to its geometry — this is its
 * main place (the inspector is the secondary one). Below, the readings of the
 * document with their geometry; the selected one is highlighted on the source.
 *
 * DOM only; every change goes through `paradata-chain.ts` via the callbacks.
 */
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import {
  geometryOf,
  isGlbKind,
  propertyOfExtractor,
  readingsOfDocument,
  resultOf,
  setReadingDescription,
  type Geometry,
  type TraceGeometry,
} from "./paradata-chain";
import { polylineLength, pyFixed, type GlbKind, type Vec3 } from "./reading-glb";
import { measureText } from "./paradata-chain";
import { geometryBadge } from "./paradata-inspector";
import { mount3dViewer, type ViewerHandle } from "./embed3d-native";
import { ViewerKeeper } from "./viewer-keep";
import type { Medium } from "./doc-form";

export type { TraceGeometry };

export interface ReadingStageCtx {
  store: DocumentStore;
  docId: string;
  medium: Medium | null;
  /** the reading the next trace belongs to (armed from «Leggi»/«+ lettura») */
  armed: string | null;
  /** the reading shown in the description box (armed, else the selected one) */
  current: string | null;
  imageUrl: string | null;
  modelUrl: string | null;
  /** the text, inline or fetched; null = not readable here (a PDF) */
  text: () => Promise<string | null>;
  onTrace: (extractorId: string, g: TraceGeometry) => void;
  /** the vertices of a 3D place — FROM ITS GLB (the node has only the count);
   *  null while the file is being read (the stage is repainted when it is) */
  vertices: (g: Geometry) => Vec3[] | null;
  onSelect: (extractorId: string) => void;
  onDisarm: () => void;
  onUseValue: (extractorId: string) => void;
  /** «Proponi con AI» on the text; absent = no AI in this build */
  onPropose?: (extractorId: string, text: string) => void;
  onVerify?: (extractorId: string) => void;
  aiChip?: (id: string) => HTMLElement | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** RIFINITURE · one 3D viewer per window, KEPT across repaints while the window
 *  shows the same model (`viewer-keep.ts`): a repaint must not reframe it. The
 *  extra is the viewer's element and the ctx its callbacks read (the latest). */
const viewers = new ViewerKeeper<HTMLElement, ViewerHandle, {
  el: HTMLElement; ctx: { cur: ReadingStageCtx };
  hooks: { add: (p: Vec3) => void; dbl: () => void };
}>();

/** Draw the stage into `host` (the Doc window's detail, above the fields). */
export function renderReadingStage(host: HTMLElement, ctx: ReadingStageCtx): void {
  // another medium, or no model: the kept viewer goes (one WebGL context each)
  if (ctx.medium !== "3d" || !ctx.modelUrl) viewers.drop(host);
  const { store, docId } = ctx;
  const doc = store.doc;
  const stage = el("div", "rd-stage");
  stage.dataset.doc = docId;
  const armed = ctx.armed ? store.node(ctx.armed) : undefined;
  if (armed) {
    const bar = el("div", "rd-armed");
    const how = ctx.medium === "3d" ? t("rd.pick3d") : ctx.medium === "image" ? t("rd.dragImage") : t("rd.selectText");
    bar.append(el("b", "", String(armed.name ?? "")), ` · ${how} `, el("span", "rd-dim", t("rd.escCancel")));
    const x = el("button", "tv-link", "×");
    x.type = "button";
    x.title = t("rd.escCancel");
    x.addEventListener("click", () => ctx.onDisarm());
    bar.appendChild(x);
    stage.appendChild(bar);
  }
  const reads = readingsOfDocument(doc, docId);
  if (ctx.medium === "image") stage.appendChild(imageStage(ctx, reads));
  else if (ctx.medium === "3d") stage.appendChild(modelStage(ctx, reads, host));
  else stage.appendChild(textStage(ctx, reads));

  // the description of the current reading, next to its geometry — its main place
  const cur = ctx.current ? store.node(ctx.current) : undefined;
  if (cur && reads.includes(cur.id)) {
    const box = el("div", "rd-edit");
    const eb = el("div", "rd-eyebrow");
    eb.append(`${String(cur.name ?? "")} · ${t("rd.description")} `);
    eb.appendChild(geometryBadge(geometryOf(doc, cur.id)));
    const chip = ctx.aiChip?.(cur.id);
    if (chip) eb.appendChild(chip);
    box.appendChild(eb);
    const ta = el("textarea", "rd-desc");
    ta.dataset.xdesc = cur.id;
    ta.placeholder = t("chain.descPh");
    ta.value = String(cur.description ?? "");
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    ta.addEventListener("change", () => setReadingDescription(store, cur.id, ta.value.trim()));
    box.appendChild(ta);
    const acts = el("div", "rd-acts");
    const res = resultOf(doc, cur.id, (rid) => { const g = geometryOf(doc, cur.id); return g && g.regionId === rid ? ctx.vertices(g) : null; });
    if (res) acts.appendChild(el("span", "rd-dim", `${t("rd.result")}: `)).after(el("b", "", res.length > 90 ? `${res.slice(0, 90)}…` : res));
    acts.appendChild(el("span", "rd-grow"));
    if (res && propertyOfExtractor(doc, cur.id)) {
      const u = el("button", "tv-act", t("chain.useValue"));
      u.type = "button";
      u.addEventListener("click", () => ctx.onUseValue(cur.id));
      acts.appendChild(u);
    }
    if (ctx.onVerify && chip?.classList.contains("pending")) {
      const v = el("button", "tv-act", t("ai.verify"));
      v.type = "button";
      v.dataset.verify = cur.id;
      v.addEventListener("click", () => ctx.onVerify!(cur.id));
      acts.appendChild(v);
    }
    box.appendChild(acts);
    stage.appendChild(box);
  }

  // the readings of this document
  const list = el("div", "rd-list");
  list.appendChild(el("div", "rd-eyebrow", t("chain.readingsOf", { n: String(reads.length) })));
  if (!reads.length) list.appendChild(el("p", "chain-note", t("rd.noReading")));
  for (const x of reads) {
    const b = el("button", "rd-item" + (x === ctx.current ? " sel" : "") + (x === ctx.armed ? " on" : ""));
    b.type = "button";
    b.dataset.reading = x;
    b.appendChild(el("b", "", String(store.node(x)?.name ?? x)));
    b.appendChild(geometryBadge(geometryOf(doc, x)));
    const chip = ctx.aiChip?.(x);
    if (chip) b.appendChild(chip);
    b.appendChild(el("span", "rd-dim", String(store.node(x)?.description ?? "")));
    const p = propertyOfExtractor(doc, x);
    if (p) b.appendChild(el("span", "", `→ ${String(store.node(p)?.name ?? p)}`));
    b.addEventListener("click", () => ctx.onSelect(x));
    list.appendChild(b);
  }
  stage.appendChild(list);
  host.prepend(stage);
}

// ── image: drag a region ─────────────────────────────────────────────────────
function imageStage(ctx: ReadingStageCtx, reads: string[]): HTMLElement {
  const wrap = el("div", "rd-img" + (ctx.armed ? " armed" : ""));
  if (!ctx.imageUrl) {
    wrap.appendChild(el("p", "chain-note", t("rd.noImage")));
    return wrap;
  }
  const img = el("img");
  img.src = ctx.imageUrl;
  img.alt = "";
  img.draggable = false;
  wrap.appendChild(img);
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 1 1");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("rd-overlay");
  for (const x of reads) {
    const g = geometryOf(ctx.store.doc, x);
    if (g?.kind !== "region2d" || !g.rect) continue;
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", String(g.rect[0]));
    r.setAttribute("y", String(g.rect[1]));
    r.setAttribute("width", String(g.rect[2]));
    r.setAttribute("height", String(g.rect[3]));
    r.setAttribute("class", "rd-region" + (x === ctx.current ? " sel" : ""));
    r.setAttribute("vector-effect", "non-scaling-stroke");
    r.dataset.reading = x;
    r.addEventListener("click", (e) => { if (!ctx.armed) { e.stopPropagation(); ctx.onSelect(x); } });
    svg.appendChild(r);
  }
  const drag = document.createElementNS(NS, "rect");
  drag.setAttribute("class", "rd-drag");
  drag.setAttribute("vector-effect", "non-scaling-stroke");
  drag.setAttribute("width", "0");
  drag.setAttribute("height", "0");
  svg.appendChild(drag);
  wrap.appendChild(svg);
  // labels of the regions, as HTML over the picture (they read at any size)
  for (const x of reads) {
    const g = geometryOf(ctx.store.doc, x);
    if (g?.kind !== "region2d" || !g.rect) continue;
    const l = el("span", "rd-region-label" + (x === ctx.current ? " sel" : ""), String(ctx.store.node(x)?.name ?? ""));
    l.style.left = `${g.rect[0] * 100}%`;
    l.style.top = `${g.rect[1] * 100}%`;
    wrap.appendChild(l);
  }
  const pt = (e: PointerEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  svg.addEventListener("pointerdown", (e) => {
    if (!ctx.armed) return;
    e.preventDefault();
    const a = pt(e);
    let b = a;
    svg.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      b = pt(ev);
      drag.setAttribute("x", String(Math.min(a[0], b[0])));
      drag.setAttribute("y", String(Math.min(a[1], b[1])));
      drag.setAttribute("width", String(Math.abs(b[0] - a[0])));
      drag.setAttribute("height", String(Math.abs(b[1] - a[1])));
    };
    const up = () => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      const w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      if (w < 0.005 || h < 0.005 || !ctx.armed) return;   // a click, not a region
      const q = (v: number) => Math.round(v * 10000) / 10000;
      ctx.onTrace(ctx.armed, { kind: "region2d", shape_kind: "rect",
        rect: [q(Math.min(a[0], b[0])), q(Math.min(a[1], b[1])), q(w), q(h)] });
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
  });
  return wrap;
}

// ── text: select a passage ───────────────────────────────────────────────────
function textStage(ctx: ReadingStageCtx, reads: string[]): HTMLElement {
  const wrap = el("div", "rd-text-wrap");
  const box = el("div", "rd-text" + (ctx.armed ? " armed" : ""));
  box.textContent = t("rd.loadingText");
  wrap.appendChild(box);
  const bar = el("div", "rd-textbar");
  void ctx.text().then((text) => {
    box.textContent = "";
    if (text == null) {
      box.appendChild(el("p", "chain-note", t("rd.noText")));
      return;
    }
    // the passages of the readings, marked on the text (offsets into THIS text)
    const marks = reads.map((x) => [x, geometryOf(ctx.store.doc, x)] as const)
      .filter((m): m is readonly [string, Extract<Geometry, { kind: "passage" }>] => m[1]?.kind === "passage")
      .map(([x, g]) => {
        // the quote survives an edit that moved the offsets: find it again
        const at = text.slice(g.start, g.end) === g.text ? g.start : text.indexOf(g.text);
        return { x, start: at, end: at + g.text.length };
      }).filter((m) => m.start >= 0).sort((a, b) => a.start - b.start);
    let pos = 0;
    const push = (s: string) => { if (s) box.appendChild(document.createTextNode(s)); };
    for (const m of marks) {
      if (m.start < pos) continue;
      push(text.slice(pos, m.start));
      const mk = el("mark", "rd-passage" + (m.x === ctx.current ? " sel" : ""));
      mk.dataset.reading = m.x;
      const tag = el("button", "rd-pmk", String(ctx.store.node(m.x)?.name ?? ""));
      tag.type = "button";
      tag.addEventListener("click", () => ctx.onSelect(m.x));
      mk.append(tag, text.slice(m.start, m.end));
      box.appendChild(mk);
      pos = m.end;
    }
    push(text.slice(pos));
    if (!ctx.armed) return;
    // offsets of the DOM selection into the text: count the characters of the
    // text nodes before it (the name tags are buttons, not text of the source)
    const offsetOf = (node: Node, off: number): number => {
      let n = 0;
      const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let cur = walk.nextNode(); cur; cur = walk.nextNode()) {
        if ((cur.parentElement as HTMLElement | null)?.classList.contains("rd-pmk")) continue;
        if (cur === node) return n + off;
        n += cur.textContent?.length ?? 0;
      }
      return -1;
    };
    const use = el("button", "insp-btn", t("rd.useSelection"));
    use.type = "button";
    use.dataset.usesel = "1";
    use.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
    use.addEventListener("click", () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !ctx.armed || !box.contains(sel.anchorNode)) {
        use.title = t("rd.selectFirst");
        return;
      }
      let a = offsetOf(sel.anchorNode!, sel.anchorOffset);
      let b = offsetOf(sel.focusNode!, sel.focusOffset);
      if (a < 0 || b < 0) return;
      if (a > b) [a, b] = [b, a];
      const quoted = text.slice(a, b);
      const lead = quoted.length - quoted.trimStart().length;
      const words = quoted.trim();
      if (!words) return;
      ctx.onTrace(ctx.armed, { kind: "passage", start: a + lead, end: a + lead + words.length, text: words });
    });
    bar.appendChild(use);
    if (ctx.onPropose) {
      const ai = el("button", "insp-btn ai", t("rd.proposeAi"));
      ai.type = "button";
      ai.dataset.propose = "1";
      ai.title = t("rd.proposeAiHint");
      ai.addEventListener("click", () => ctx.onPropose!(ctx.armed!, text));
      bar.appendChild(ai);
    }
  });
  wrap.appendChild(bar);
  return wrap;
}

// ── 3D: a point, a line, a polyline on the model ─────────────────────────────

/** LUOGO · the trace in progress, per window (kept across repaints like the
 *  viewer): which reading, which tool, the vertices clicked so far. */
interface Trace3D { reading: string | null; tool: GlbKind; vertices: Vec3[] }
const traces = new WeakMap<HTMLElement, Trace3D>();
/** the stage whose trace Enter and Esc speak to: the last one painted armed */
let keyTarget: { trace: Trace3D; finish: () => void; cancel: () => void } | null = null;

const measureOfVertices = (vs: Vec3[]): string => (vs.length > 1 ? `${pyFixed(polylineLength(vs), 3)} m` : "");
const sameVertex = (a: Vec3 | undefined, b: Vec3) =>
  !!a && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;

// Enter closes a polyline, Esc cancels the vertices of a trace — BEFORE the app's
// Esc (which disarms the reading): capture phase, and only when there is a trace
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    const k = keyTarget;
    if (!k || !k.trace.reading) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
    if (e.key === "Enter" && k.trace.tool === "polyline" && k.trace.vertices.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      k.finish();
    } else if (e.key === "Escape" && k.trace.vertices.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      k.cancel();
    }
  }, true);
}

function modelStage(ctx: ReadingStageCtx, reads: string[], owner: HTMLElement): HTMLElement {
  const wrap = el("div", "rd-3d" + (ctx.armed ? " armed" : ""));
  if (!ctx.modelUrl) {
    wrap.appendChild(el("p", "chain-note", t("rd.no3d")));
    return wrap;
  }
  // the markers read their vertices from the glb, not from the node
  const markers = reads.flatMap((x) => {
    const g = geometryOf(ctx.store.doc, x);
    if (!g || !isGlbKind(g.kind)) return [];
    const v = ctx.vertices(g);
    return v?.length ? [{ id: x, label: String(ctx.store.node(x)?.name ?? ""), kind: g.kind, vertices: v,
                          note: measureText(g) || undefined, selected: x === ctx.current }] : [];
  });
  let trace = traces.get(owner);
  if (!trace) { trace = { reading: null, tool: "point", vertices: [] }; traces.set(owner, trace); }
  if (trace.reading !== ctx.armed) { trace.reading = ctx.armed; trace.vertices = []; }
  const tr = trace;

  // the tools and the status line, while a reading waits for its place
  const status = el("div", "rd-3d-status");
  status.dataset.trace = tr.tool;
  const say = () => {
    const n = tr.vertices.length;
    status.dataset.vertices = String(n);
    const what = t(`rd.tracing.${tr.tool}`);
    const hint = t(`rd.hint3d.${tr.tool}`);
    const m = measureOfVertices(tr.vertices);
    status.textContent = n
      ? `${what} · ${t("rd.vertices", { n: String(n) })}${m ? ` · ${m}` : ""} — ${hint}`
      : `${what} — ${hint}`;
  };
  if (ctx.armed) {
    const tools = el("div", "rd-3d-tools");
    for (const k of ["point", "line", "polyline"] as GlbKind[]) {
      const b = el("button", "tv-act" + (tr.tool === k ? " on" : ""), t(`rd.tool.${k}`));
      b.type = "button";
      b.dataset.tool = k;
      b.setAttribute("aria-pressed", String(tr.tool === k));
      b.addEventListener("click", () => {
        tr.tool = k;
        tr.vertices = [];
        status.dataset.trace = k;
        for (const o of tools.querySelectorAll("button")) {
          const on = (o as HTMLElement).dataset.tool === k;
          o.classList.toggle("on", on);
          o.setAttribute("aria-pressed", String(on));
        }
        kept.v.setDraft?.(null);
        say();
      });
      tools.appendChild(b);
    }
    wrap.appendChild(tools);
    say();
    wrap.appendChild(status);
  }

  const finish = () => {
    const c = ctxRef.cur;
    if (!c.armed) return;
    if (tr.tool === "polyline" && tr.vertices.length < 2) {
      status.textContent = `${t("rd.tracing.polyline")} — ${t("rd.needTwo")}`;
      return;
    }
    const vertices = tr.vertices.slice();
    tr.vertices = [];
    kept.v.setDraft?.(null);
    c.onTrace(c.armed, { kind: tr.tool, vertices });
  };
  const cancel = () => {
    tr.vertices = [];
    kept.v.setDraft?.(null);
    say();
  };
  const addVertex = (p: Vec3) => {
    if (!ctxRef.cur.armed) return;
    if (tr.tool === "point") { tr.vertices = [p]; finish(); return; }
    // the second click of a double click lands on the same point: not a vertex
    if (sameVertex(tr.vertices[tr.vertices.length - 1], p)) return;
    tr.vertices.push(p);
    if (tr.tool === "line" && tr.vertices.length === 2) { finish(); return; }
    kept.v.setDraft?.(tr.vertices.slice(), measureOfVertices(tr.vertices));
    say();
  };

  // the SAME model as the last paint → the same viewer, moved into this paint,
  // its camera where the reader left it; only a new model is mounted (and framed)
  const url = ctx.modelUrl;
  const kept = viewers.keep(owner, `${ctx.docId}\u0000${url}`, () => {
    const host = el("div", "rd-3d-host");
    const ref = { cur: ctx };
    const hooks = { add: (_p: Vec3) => {}, dbl: () => {} };
    const v = mount3dViewer(host, url, {
      label: String(ctx.store.node(ctx.docId)?.name ?? ""),
      markers,
      onMarker: (id) => ref.cur.onSelect(id),
      onPick: (p) => hooks.add(p),
      onDoubleClick: () => hooks.dbl(),
      tracing: () => !!ref.cur.armed,
    });
    return { v, extra: { el: host, ctx: ref, hooks } };
  });
  const ctxRef = kept.extra.ctx;
  ctxRef.cur = ctx;
  // the viewer outlives this paint: its callbacks reach the latest closures
  kept.extra.hooks.add = addVertex;
  kept.extra.hooks.dbl = () => { if (tr.tool === "polyline" && tr.vertices.length) finish(); };
  if (!kept.fresh) kept.v.setMarkers?.(markers);
  kept.v.setDraft?.(tr.vertices.length ? tr.vertices.slice() : null, measureOfVertices(tr.vertices));
  keyTarget = ctx.armed ? { trace: tr, finish, cancel } : keyTarget?.trace === tr ? null : keyTarget;
  wrap.appendChild(kept.extra.el);
  // ⤢ · the explicit reframe — the only one besides the model's opening
  const fit = el("button", "rd-3d-fit", "⤢");
  fit.type = "button";
  fit.title = t("rd.fit3d");
  fit.addEventListener("click", () => kept.v.frame?.());
  wrap.appendChild(fit);
  return wrap;
}
