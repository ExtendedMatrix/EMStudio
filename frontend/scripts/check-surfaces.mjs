// SURFACE-AUDIT · executable check of the shell: `src/shell/layout.ts` (the
// arrangement as arithmetic) and `src/surface-scroll.ts` (the discipline that
// keeps a window's CONTENT and its PLACE).
//
//   node scripts/check-surfaces.mjs
//
// WHAT CHANGED (12 set 2026), because half of this file existed for a reason
// that is gone.
//
// It used to open by saying: «the DOM here is a small stand-in with real numbers
// (linkedom has no layout, so `scrollTop` would always be 0 and nothing could be
// measured)». That is still true of scrolling — a headless DOM has no layout —
// but it was ALSO true of the arrangement, and the arrangement was modelled by
// hand here because the geometry lived inside nested flex boxes that only a
// browser could resolve.
//
// It does not any more. `shell/layout.ts` computes every area's rectangle from
// the split tree with plain arithmetic, so §0 below runs the REAL function on
// REAL trees and checks real numbers — no model, no simulation.
//
// And the two mechanisms this file used to reproduce are one:
//
//   · GONE · `renderTiles` DETACHED `#canvas-wrap` and re-attached it, zeroing
//     every `scrollTop` inside (measured in a browser: 900 → 0). Nothing is
//     detached now, so `rememberScrollsIn`/`restoreScrollsIn` are deleted and
//     the cases that exercised them with them.
//   · LEFT · a surface MIGRATES: the same window's content is a singleton
//     element while it has the focus and a box built into an area when it does
//     not. Two types still do this — the narrative and the annotator — and for
//     them the machine below is still what carries the reader across.
//
// Frames are modelled, because the clamp is the whole reason the module writes
// twice: `requestAnimationFrame` here collects callbacks, and `frame()` settles
// the heights (what a browser's layout pass does) and then runs them.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}surface-scroll.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const S = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
/** …and the arrangement, which is now pure arithmetic and therefore RUNNABLE. */
const load = async (entry) => {
  const built = await esbuild.build({
    entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
  });
  return import("data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64"));
};
const L = await load("shell/layout.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── a box that behaves like a scroller ──────────────────────────────────────
//
// `scrollTop` clamps to `scrollHeight - clientHeight`, which is the whole reason
// the module writes twice. `content` stands in for what a rebuild throws away.
const frameQueue = [];
globalThis.requestAnimationFrame = (fn) => { frameQueue.push(fn); return frameQueue.length; };
/** a layout pass: the boxes reach their real height, THEN the callbacks run */
function frame() {
  for (const box of settling.splice(0)) box.settle();
  for (const fn of frameQueue.splice(0)) fn();
}
const settling = [];

function makeBox(id, { clientHeight = 100, scrollHeight = 1000 } = {}) {
  let top = 0;
  const box = {
    id,
    content: "",
    clientHeight,
    scrollHeight,
    isConnected: true,
    children: [],
    get scrollTop() { return top; },
    set scrollTop(v) {
      top = Math.max(0, Math.min(Number(v) || 0, this.scrollHeight - this.clientHeight));
    },
    // what `rememberScrollsIn` walks
    querySelectorAll: () => box.children,
    /** a rebuild: the content goes, and until the next layout pass the box is
     *  SHORT — so a `scrollTop` written now clamps, exactly as it does in a
     *  browser. `frame()` is what makes it tall again. */
    rebuild(newContent, heightWhileBuilding = 0) {
      const full = box.scrollHeight;
      box.scrollHeight = box.clientHeight + heightWhileBuilding;
      top = Math.min(top, Math.max(0, box.scrollHeight - box.clientHeight));
      box.content = newContent;
      box.settle = () => { box.scrollHeight = full; };
      settling.push(box);
    },
    settle() {},
    /** a re-parenting (or a detach): every browser resets the position */
    reparent() { top = 0; },
  };
  return box;
}

const win = (id, type) => ({ id, type });

ok(typeof globalThis.requestAnimationFrame === "function",
   "frames · a layout pass is modelled, so the second write can be measured");

// ── 0 · THE ARRANGEMENT, with real numbers and no model ────────────────────
//
// This is the part that used to be impossible here. `layoutRects` is the very
// function the app runs, given the very trees `workspace.ts` builds, and the
// rectangles are checked as numbers.
{
  const leaf = (winId) => ({ kind: "leaf", winId });
  const row = (a, b, ratio = 0.5) => ({ kind: "split", dir: "row", ratio, a, b });
  const col = (a, b, ratio = 0.5) => ({ kind: "split", dir: "col", ratio, a, b });
  const ROOT = { x: 0, y: 0, w: 1000, h: 600 };
  const D = L.DIVIDER;

  // one window: the whole box, and no divider to grab
  {
    const { areas, dividers } = L.layoutRects(leaf("a"), ROOT);
    eq([...areas.keys()], ["a"], "layout · one window is placed once");
    eq(areas.get("a"), ROOT, "layout · …and it takes the whole shell");
    eq(dividers.length, 0, "layout · with nothing to divide there is no handle");
  }

  // two side by side: the handle takes its width OUT of the content, so the two
  // areas plus the divider are exactly the box — no overlap, no gap
  {
    const { areas, dividers } = L.layoutRects(row(leaf("a"), leaf("b")), ROOT);
    const a = areas.get("a"), b = areas.get("b");
    eq(a.w + D + b.w, ROOT.w, "layout · the two areas and the handle tile the box");
    eq(a.x, 0, "layout · the first starts at the edge");
    eq(b.x, a.w + D, "layout · …and the second after the handle");
    eq([a.h, b.h], [ROOT.h, ROOT.h], "layout · a row split leaves the height alone");
    eq(dividers[0].rect, { x: a.w, y: 0, w: D, h: ROOT.h },
       "layout · the handle is exactly the gap it reserved");
    eq(dividers[0].firstId, "a",
       "layout · …and the ratio is filed under the first leaf of the a side, " +
       "which is the name `setSplitRatio` has always used");
  }

  // a ratio is honoured, and the two sides still tile exactly
  {
    const { areas } = L.layoutRects(row(leaf("a"), leaf("b"), 0.3), ROOT);
    eq(areas.get("a").w, Math.round((ROOT.w - D) * 0.3),
       "layout · the ratio decides the first side");
    eq(areas.get("a").w + D + areas.get("b").w, ROOT.w,
       "layout · …and the rounding is absorbed by the second, never lost");
  }

  // a column split, and a nested tree: every leaf placed exactly once, every
  // rectangle inside the box, and no two of them overlapping
  {
    const tree = col(row(leaf("a"), leaf("b")), row(leaf("c"), col(leaf("d"), leaf("e"))));
    const { areas, dividers } = L.layoutRects(tree, ROOT);
    eq([...areas.keys()].sort(), ["a", "b", "c", "d", "e"],
       "layout · every leaf of a nested tree is placed, once");
    eq(dividers.length, 4, "layout · one handle per split");
    for (const [id, r] of areas) {
      ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= ROOT.w && r.y + r.h <= ROOT.h,
         `layout · ${id} is inside the shell`);
      ok(r.w >= 0 && r.h >= 0, `layout · ${id} has no negative extent`);
    }
    const list = [...areas.entries()];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [ia, ra] = list[i], [ib, rb] = list[j];
        const over = ra.x < rb.x + rb.w && rb.x < ra.x + ra.w &&
                     ra.y < rb.y + rb.h && rb.y < ra.y + ra.h;
        ok(!over, `layout · ${ia} and ${ib} do not overlap`);
      }
  }

  // a shell narrower than its own handle: the clamp, so no caller has to defend
  {
    const { areas } = L.layoutRects(row(leaf("a"), leaf("b")),
                                    { x: 0, y: 0, w: 4, h: 10 });
    ok(areas.get("a").w >= 0 && areas.get("b").w >= 0,
       "layout · a box too small for its handle still yields real rectangles");
  }

  // DETERMINISM · the same tree gives the same numbers, which is what lets
  // `positionAreas` write nothing when nothing moved
  {
    const tree = col(leaf("a"), row(leaf("b"), leaf("c"), 0.42));
    const one = L.layoutRects(tree, ROOT);
    const two = L.layoutRects(tree, ROOT);
    for (const id of one.areas.keys())
      ok(L.sameRect(one.areas.get(id), two.areas.get(id)),
         `layout · ${id} lands in the same place twice`);
    // …and a shell one pixel narrower really does move something. `c` and not
    // `b`: at this ratio `b` rounds to the same 417 either way — measured, and
    // worth keeping as the reminder that "nothing moved" is a claim about a
    // particular rectangle, not about the tree.
    ok(!L.sameRect(one.areas.get("c"),
                   L.layoutRects(tree, { ...ROOT, w: 999 }).areas.get("c")),
       "layout · …and a shell one pixel narrower moves an area, or `sameRect` " +
       "would be answering yes to everything");
  }
}

// ── 1 · a rebuilt surface keeps its place ───────────────────────────────────
{
  const w = win("canvas:1", "narrative");
  const box = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  box.scrollTop = 900;
  S.paintSurface(w, box, () => box.rebuild("the story, again", 4000));
  eq(box.scrollTop, 900, "surface · a rebuild keeps the reader's place");
  eq(box.content, "the story, again", "surface · …and the content is the new one");
}

// ── 2 · …even when the rebuilt box is momentarily SHORTER ───────────────────
{
  const w = win("canvas:1", "narrative");
  const box = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  box.scrollTop = 900;
  // the box is no taller than its viewport while the new tree is going in: a
  // write against that clamps to 0, which is the bug the second write answers
  S.paintSurface(w, box, () => box.rebuild("short then long", 0));
  eq(box.scrollTop, 0,
     "surface · …a write against a box that is still short lands at 0");
  frame();                                    // the layout settles, and then
  eq(box.scrollTop, 900,
     "surface · the second write is what puts a short-rebuilt box back");
}

// ── 3 · THE MIGRATION · focused element → secondary box ────────────────────
{
  const w = win("canvas:2", "narrative");
  const focused = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  focused.scrollTop = 951;
  // the teardown reads the focused surface…
  S.surfaceScroll.set(S.surfaceKey(w, ""), focused.scrollTop);
  focused.reparent();                                  // the detach zeroes it
  eq(focused.scrollTop, 0, "surface · a detach really does reset the position");
  // …and the area's box, a DIFFERENT element, opens where the reader was
  const secondary = makeBox("tile-narrative", { clientHeight: 400, scrollHeight: 2500 });
  const at = S.rememberSurfaceScroll(w, secondary);
  secondary.scrollTop = 0;
  S.restoreSurfaceScroll(w, secondary, at);
  eq(secondary.scrollTop, 951,
     "surface · the place travels from the focused surface to the area's box");
}

// ── 4 · …and back again ────────────────────────────────────────────────────
{
  const w = win("canvas:2", "narrative");
  const secondary = makeBox("tile-narrative", { clientHeight: 400, scrollHeight: 2500 });
  secondary.scrollTop = 1200;                          // scrolled while unfocused
  S.rememberSurfaceScroll(w, secondary);               // read at the teardown
  const focused = makeBox("narrative-view", { clientHeight: 600, scrollHeight: 2500 });
  S.restoreSurfaceScroll(w, focused,
                         S.surfaceScroll.get(S.surfaceKey(w, "")) ?? 0);
  eq(focused.scrollTop, 1200,
     "surface · …and back into the focused surface when the window is entered");
}

// ── 5 · two windows of the SAME type do not share a place ──────────────────
{
  const a = win("canvas:3", "table");
  const b = win("canvas:4", "table");
  const boxA = makeBox("a", { clientHeight: 300, scrollHeight: 3000 });
  const boxB = makeBox("b", { clientHeight: 300, scrollHeight: 3000 });
  boxA.scrollTop = 700;
  boxB.scrollTop = 100;
  S.rememberSurfaceScroll(a, boxA);
  S.rememberSurfaceScroll(b, boxB);
  const freshA = makeBox("a2", { clientHeight: 300, scrollHeight: 3000 });
  const freshB = makeBox("b2", { clientHeight: 300, scrollHeight: 3000 });
  S.restoreSurfaceScroll(a, freshA, S.surfaceScroll.get(S.surfaceKey(a, "")));
  S.restoreSurfaceScroll(b, freshB, S.surfaceScroll.get(S.surfaceKey(b, "")));
  eq([freshA.scrollTop, freshB.scrollTop], [700, 100],
     "surface · each window keeps its own place (two tables, two rows)");
}

// ── 6 · a window whose surface is TWO boxes keeps both ─────────────────────
{
  const w = win("canvas:5", "doc");
  const list = makeBox("doc-view-list", { clientHeight: 300, scrollHeight: 2000 });
  const detail = makeBox("doc-view-detail", { clientHeight: 300, scrollHeight: 4000 });
  list.scrollTop = 500;
  detail.scrollTop = 1700;
  const atList = S.rememberSurfaceScroll(w, list, "doc-list");
  const atDetail = S.rememberSurfaceScroll(w, detail, "doc-detail");
  const list2 = makeBox("doc-list", { clientHeight: 300, scrollHeight: 2000 });
  const detail2 = makeBox("doc-detail", { clientHeight: 300, scrollHeight: 4000 });
  S.restoreSurfaceScroll(w, list2, atList, "doc-list");
  S.restoreSurfaceScroll(w, detail2, atDetail, "doc-detail");
  eq([list2.scrollTop, detail2.scrollTop], [500, 1700],
     "surface · the list you scrolled and the source you were reading, both");
  ok(S.surfaceKey(w, "doc-list") !== S.surfaceKey(w, "doc-detail"),
     "surface · …because a slot makes them two places, not one");
}

// ── 7 · GONE · the WRAP detach ─────────────────────────────────────────────
//
// This case remembered every scrolled box inside `#canvas-wrap` by element id,
// detached them all, and checked they came back — because `renderTiles` really
// did detach the wrap on every focus change and a detach zeroes `scrollTop` in
// every browser.
//
// `#canvas-wrap` is an AREA now: it is positioned by coordinates
// (`shell/layout.ts`) and never leaves the document, so there is nothing to
// remember and nothing to put back. The case is deleted with the functions it
// exercised rather than left passing on a stub, which would say the machine is
// still there.
//
// What replaced it as a fact anybody can check: `check-focus-parity.mjs` asserts
// that `selectWindow()` does not call `renderTiles()`, and the browser pass on
// 12 September measured a focus change at 0 nodes added and 0 removed (against
// 124–128 added and 63–66 removed before).

// ── 8 · the table's `place`: a foreign module can hold the same key ────────
{
  const w = win("canvas:6", "table");
  const place = S.surfacePlace(w);
  place.remember(1016);
  eq(place.recall(), 1016, "place · emdata.ts can keep a row without knowing windows");
  eq(S.surfaceScroll.get(S.surfaceKey(w, "")), 1016,
     "place · …in the very same register the window's own surface reads");
}

// ── 9 · GONE · the table of migrating surfaces ────────────────────────────
//
// It declared the types whose surface existed in TWO mounts, so that a reader's
// position could be carried across the crossing between them. Seven rows on
// 12 September, two on the 13th, none on the 14th: every type builds its surface
// in its own area and no area is ever detached, so there is no crossing.
//
// `check-focus-parity.mjs` asserts its ABSENCE (clause A3) — including that it
// is absent rather than empty, because an empty table is an invitation to add a
// row. What is checked here instead is what the module still does, which is a
// different and still-true thing: a surface rebuilt IN PLACE loses its scroll.
{
  ok(S.FOCUSED_SURFACE_BOXES === undefined,
     "types · the migrating-surfaces table is gone, not emptied");
  ok(typeof S.paintSurface === "function",
     "types · …and the discipline that survives it is the one that is still " +
     "true: a rebuild in place still loses the reader's place");
}

// ── 10 · a place that was never set restores nothing (and breaks nothing) ──
{
  const w = win("canvas:7", "shelf");
  const box = makeBox("shelf-body", { clientHeight: 300, scrollHeight: 900 });
  S.paintSurface(w, box, () => box.rebuild("an empty shelf"));
  eq(box.scrollTop, 0, "surface · a surface nobody scrolled opens at the top");
  eq(box.content, "an empty shelf", "surface · …and still gets its content");
}

// ── 11 · GONE · the full migration cycle ──────────────────────────────────
//
// This ran a type through a whole hand-over of `#canvas-wrap`: remember the
// singleton's position, let the wrap change owner, build the area's box, paint,
// and back again. It covered six types on 12 September and two on the 13th.
//
// On the 14th the narrative stopped being a MODE and the annotator's frame
// became something its own instance builds, so no type has a singleton to be
// handed over — and a cycle over an empty list is not a passing test, it is a
// test that has stopped asking anything. The one thing it really proved is
// asserted where it now belongs: §12 below, on a surface rebuilt in place.

// ── 12 · a surface REBUILT IN PLACE still keeps the reader's place ─────────
//
// The half of the old cycle that is still true, and the only half. Nothing moves
// between elements any more, but a `refresh()` throws the content away and
// builds it again — and a `scrollTop` written against a box that is momentarily
// shorter than it will be clamps to 0. That is what `paintSurface` answers, and
// what the second write inside it is for.
{
  const w = win("rebuild:narrative", "narrative");
  const box = makeBox("nv-view", { clientHeight: 300, scrollHeight: 4000 });
  box.scrollTop = 951;
  S.paintSurface(w, box, () => box.rebuild("the story, again", 0));
  eq(box.scrollTop, 0,
     "rebuild · a write against a box that is still short lands at 0");
  frame();
  eq(box.scrollTop, 951,
     "rebuild · …and the second write is what puts it back");
  eq(box.content, "the story, again", "rebuild · …with the new content in it");
}

// ── 12b/12c · the ANNOTATOR · GONE (MICRO-UN-POSTO, 30 set 2026) ───────────
//
// Two annotators, one constructor, and the declared single-instance limit were
// asserted here. The Doc window became the one tracer (AUDIT N4), nothing could
// reach an Annotator any more, and its surface went with its code. What stays
// is the ALIAS: an `annotator` window in a saved arrangement opens as a Doc.
{
  const M = await load("shell/types.ts");
  M.registerBuiltinSurfaces(new Proxy({}, { get: () => () => undefined }));
  ok(!M.surfaceTypeOf("annotator"), "annotator · no surface of its own any more");
  ok(!("ANNOTATOR_CAPABILITIES" in M), "annotator · …nor a declared limit for one");
  const W = await load("workspace.ts");
  eq(W.migrateWin({ id: "x:annotator", type: "annotator", state: { "mode.annotator": "annotate" } }),
     { id: "x:annotator", type: "doc", state: {} },
     "annotator · the ALIAS stays: a saved Annotator opens as a Doc, its mode dropped");
}

// ── 13 · …and every surface really DRAWS, rather than announcing itself ────
//
// Cases 11 and 12 exercise the machine. This one asserts the surfaces exist and
// paint, because a type can be perfectly wired and still show a placeholder —
// which is exactly what four of them did before the August audit (`tileNote`:
// "step in to read and write here" instead of the story), and what the STUDY
// window still did yesterday.
//
// The six converted types are asked of the REGISTRY, not of a source read as
// text: each one is created, mounted into a stand-in element, and its renderer
// has to have been called. A type that is registered but paints nothing fails
// here rather than in a trench.
{
  const M = await load("shell/types.ts");
  const called = new Set();
  const deps = new Proxy({}, {
    get: (_, name) => (...args) => {
      called.add(name);
      // the table and the storage register a HOST and are painted through it
      if (name === "addEmDataHost" || name === "addStorageHost")
        called.add(`${name}:${args[0] && typeof args[0] === "object"}`);
      // the two HOSTED types ask two questions of `main.ts`: which tab this
      // window is on, and how a panel is built into a host. Answered for real
      // here — a stub returning `undefined` would let a surface that never
      // mounts a panel pass.
      if (name === "panelIdOf") return "inspector";
      if (name === "mountPanel") {
        called.add(`mountPanel:${args[0]}`);
        return { refresh: () => called.add("panel.refresh") };
      }
      return undefined;
    },
  });
  M.registerBuiltinSurfaces(deps);
  /** the least DOM a surface needs to be mounted into */
  const makeEl = () => {
    const el = {
      className: "", dataset: {}, isConnected: true, children: [],
      scrollTop: 0, scrollHeight: 0, clientHeight: 0,
      classList: { toggle() {}, add() {}, contains: () => false },
      parentElement: null,
      appendChild(c) { el.children.push(c); c.parentElement = el; return c; },
      append(...cs) { cs.forEach((c) => el.appendChild(c)); },
      remove() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    return el;
  };
  globalThis.document = { createElement: makeEl };
  const PAINTS = {
    table:   "addEmDataHost",
    storage: "addStorageHost",
    shelf:   "renderShelfInto",
    viewer:  "renderViewerInto",
    doc:     "renderDocViewInto",
    study:   "renderStudyInto",
    "narrative-index": "renderNarrativeIndexInto",
    // 13 set 2026 · the two HOSTED types. A panel window builds its OWN panel in
    // its own area, so what proves it draws is that it asked `mountPanel` for
    // one — which is exactly the call that could not exist while the panel was a
    // single element somebody else was holding.
    emtree:    "mountPanel",
    inspector: "mountPanel",
    // 15 set 2026 · the last one. A graph window asks for its canvas to be
    // wired; what proves it draws is that it asked at all — which is the call
    // that could not exist while ten handlers were bound to one element.
    graph:     "mountGraph",
  };
  for (const [type, renderer] of Object.entries(PAINTS)) {
    called.clear();
    const st = M.surfaceTypeOf(type);
    ok(st, `callers · "${type}" is a registered surface type`);
    const area = makeEl();
    const surface = st.create({ id: `w:${type}`, type, state: {} });
    surface.mount(area, { id: `w:${type}`, type, state: {} });
    ok(area.children.length > 0,
       `callers · mounting a ${type} surface puts a box into its area`);
    surface.refresh();
    ok(called.has(renderer),
       `callers · …and a ${type} surface PAINTS through \`${renderer}\`, rather ` +
         "than announcing its own name and waiting to be visited");
    // and the law: focusing it must not repaint or rebuild anything
    called.clear();
    const before = area.children.length;
    surface.setFocused(true);
    surface.setFocused(false);
    eq([...called], [],
       `callers · ${type}: setFocused calls no renderer — the focus decides ` +
       "where the events go, never what is drawn");
    eq(area.children.length, before,
       `callers · ${type}: …and adds or removes no child`);
    surface.destroy();
  }

  // ── and the proof the twin is gone: TWO of the same type, at once ─────────
  //
  // Not "does it draw" but "does a second one draw too". Before tonight the
  // answer was a note — `tile.panelTaken`, «another window has this panel» —
  // because the panel was one element and the first claimant kept it. Two mounts
  // of the same type must now each ask for their own panel.
  for (const type of ["inspector", "emtree"]) {
    called.clear();
    const st = M.surfaceTypeOf(type);
    const a = makeEl(), b = makeEl();
    const wa = { id: "w:a", type, state: {} };
    const wb = { id: "w:b", type, state: {} };
    const sa = st.create(wa), sb = st.create(wb);
    sa.mount(a, wa);
    sb.mount(b, wb);
    const asked = [...called].filter((c) => c.startsWith("mountPanel:"));
    ok(a.children.length > 0 && b.children.length > 0,
       `two ${type} windows · both built a box of their own`);
    eq(asked.length, 1,
       `two ${type} windows · both asked for a panel (the set of distinct asks ` +
       "is one because they are on the same tab — what matters is that neither " +
       "was refused, which is what the note used to do)");
    // the selection reaches BOTH, and through the contract rather than a lookup
    called.clear();
    sa.select?.("n1");
    sb.select?.("n1");
    sa.destroy();
    sb.destroy();
  }
  delete globalThis.document;
}

// ── 14 · EVERY window type has a constructor, and none has two ────────────
//
// The clause that makes the defect impossible instead of watched, and the one
// this whole series was for.
//
// It used to name types: "`buildSecondarySurface` must not mention these six,
// and must still mention those two". That works while there is a list to keep,
// and it protects exactly the types somebody remembered to write down. What it
// cannot protect is the NINTH window type — the one that will be added when
// nobody remembers any of this.
//
// So the question is asked of `workspace.ts` and the registry together: every
// `WindowType` the model declares has an entry in `shell/surface.ts`. A type
// added without one fails here, on the line that adds it.
{
  const W = await load("workspace.ts");
  const M = await load("shell/types.ts");
  M.registerBuiltinSurfaces(new Proxy({}, { get: () => () => {} }));
  const registered = new Set(M.convertedTypes());

  // every type the MODEL knows — read from the metadata table every window type
  // must appear in to have an icon and a name, so this cannot drift from the union
  const declared = Object.keys(W.WINDOW_TYPE_META);
  ok(declared.length > 8, `the model declares ${declared.length} window types`);

  // …minus the ones still drawn the old way, named here with the reason.
  //
  // **IT IS EMPTY (15 settembre 2026), and that is the end of the audit.** The
  // graph was the last: ten pointer handlers bound to one `#canvas` inside
  // `#canvas-wrap`, the area that followed the focus. `wireGraphCanvas` binds
  // the same ten to each window's own canvas, so the clause below now has no
  // exception to make — every `WindowType` the model declares has a constructor,
  // and the fence says one sentence instead of a list.
  //
  // Left as a (now empty) table rather than deleted, and that is deliberate:
  // this one is not a description of the defect (those were deleted — an empty
  // `FOCUSED_SURFACE_BOXES` would be an invitation to add a row). This is the
  // SEAM for the next honest exception, and it fails loudly if anything is put
  // in it that is in fact registered.
  const STILL_PRIVILEGED = {};
  for (const type of declared) {
    if (STILL_PRIVILEGED[type]) {
      ok(!registered.has(type),
        `${type} is declared as still privileged but IS registered — remove it ` +
          "from the list rather than leaving a lie in the fence");
      continue;
    }
    ok(registered.has(type),
      `every window type has ONE constructor: "${type}" is declared in ` +
        "`workspace.ts` and has no entry in the surface registry. A type " +
        "without a constructor is a type that will be drawn some other way — " +
        "which is how the second path was born the first time.");
  }
  console.log("\n  still drawn the old way");
  const left = Object.entries(STILL_PRIVILEGED);
  if (!left.length) console.log("    (none — every window type has one constructor)");
  for (const [type, why] of left) console.log(`    ${type.padEnd(10)} ${why}`);
}

console.log(`surfaces: ${checks} checks passed`);
