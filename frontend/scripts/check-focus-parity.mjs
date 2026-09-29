// ONE SURFACE · the fence that used to MEASURE the distance between two drawing
// paths, now asserting that the second one does not exist.
//
//   node scripts/check-focus-parity.mjs
//
// WHAT THIS FILE USED TO BE, and why it changed trade (12 set 2026).
//
// EMStudio drew a window two ways: the singleton surfaces inside `#canvas-wrap`
// for the window that had the focus, and `buildSecondarySurface()` for every
// other one. Parity between the two was an invariant kept BY HAND, type by
// type — and this check measured it: the head, the box, what the head promised.
// It was honest work and it found real things (the shelf's nine controls, the
// narrative's 28 px, the table's re-measured head).
//
// But a check that measures the distance between two paths accepts that there
// are two. Six types have one now, and for those the question "do the two mounts
// agree?" has no referent. So for them this asserts something stronger and much
// cheaper to keep true: THERE IS NO SECOND PATH. No singleton in the markup, no
// branch in `applyWindowSurface`, no row in `FOCUSED_SURFACE_BOXES`, no mention
// in `buildSecondarySurface` — and `selectWindow()` does not rebuild the tree.
//
// The types that were NOT converted keep the old clauses, and they are named
// here in clear: a fence that protects half a repo without saying which half is
// worse than two fences.
//
// And the rule of the house (5 ottobre): a guard that searches for a word inside
// a source read as text measures the FILE, not the PROGRAM. Everything below
// goes through `sorgenti.mjs` — the TypeScript compiler for the code, `linkedom`
// for the markup, the parsed rule for the stylesheet — or through the module
// itself, imported and run.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as esbuild from "esbuild";
import ts from "typescript";
import * as Sorg from "./sorgenti.mjs";

const SRC = new URL("../src/", import.meta.url).pathname;
const CSS = (await readFile(`${SRC}style.css`, "utf8"))
  .replace(/\/\*[\s\S]*?\*\//g, "");
const TS = await readFile(`${SRC}main.ts`, "utf8");
const SHELL = await readFile(`${SRC}shell/types.ts`, "utf8");
const HTML = await readFile(new URL("../index.html", import.meta.url).pathname,
                            "utf8");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

/**
 * Does this piece of code name a WINDOW TYPE?
 *
 * A string literal, and only a string literal — never an identifier. The house
 * rule of 5 ottobre arriving in a new disguise: `Sorg.nomina` also answers YES
 * for an identifier, and the first run of this fence failed on
 * `buildSecondarySurface` "naming doc" because the narrative branch reads
 * `store?.doc`. The document of the app and the Doc window type are two things
 * that happen to be spelled the same, and a window type is only ever written as
 * `win.type === "doc"` — a whole literal. Constructed by running it.
 */
const nominaTipo = (source, type) =>
  Sorg.stringheLetterali(source).includes(type);

// ── the two halves of the repo, named ───────────────────────────────────────
//
// CONVERTED: one constructor, in `shell/types.ts`, for every area of that type.
// The second column is the singleton that USED to be its focused mount, kept
// here so its absence can be asserted by name rather than by hoping.
const CONVERTED = {
  table:   ["table-view", "table-view-head", "table-view-body", "table-view-actions"],
  storage: ["storage-view", "storage-bar", "storage-body"],
  shelf:   ["shelf-view", "shelf-body"],
  viewer:  ["viewer-view", "viewer-stage", "viewer-caption", "viewer-bar"],
  doc:     ["doc-view", "doc-view-list", "doc-view-detail"],
  study:   ["study-view", "study-body"],
  // 3 ott 2026 (COLLEGARE) · the Index was BORN converted: no singleton ever,
  // and the id it would have had is asserted absent all the same
  "narrative-index": ["narrative-index-view"],
  // 13 set 2026 · the two HOSTED types. Their singletons were of two kinds and
  // both are listed: the surface they were mounted into (`#panel-view`) and the
  // four PANELS themselves, which were elements taken from the document at boot
  // and moved about — the last thing in this application that was one by
  // definition.
  emtree:    ["panel-view", "panel-view-tabs", "panel-view-body", "emtree"],
  // 1 ott 2026 (SHIFT-A) · the outliner left the EMtree's tabs for a window type
  // of its own, and the log left the Inspector's for the status bar's drawer —
  // their old singleton ids are still asserted absent, under their new owners
  outliner:  ["nodelist"],
  inspector: ["inspector", "logpanel"],
  // 14 set 2026 · the last two. The narrative was the one type that was also a
  // MODE — an overlay over the canvas — which is why its surface had to be one
  // element; the annotator's frame is built by the instance that traces.
  narrative: ["narrative-view"],
  annotator: ["annotator-view", "annotator-bar", "annotator-stage"],
  // 15 set 2026 · THE LAST ONE. `#canvas-wrap` was the privileged AREA — the one
  // the focus moved into — `#canvas` the one element the ten pointer gestures
  // were bound to, `#window-header` its docked bar, and `#overview` the one
  // minimap. A graph window builds its own canvas and its own minimap now.
  graph: ["canvas-wrap", "canvas", "window-header", "overview"],
};

/*
 * `UNCONVERTED` IS GONE (15 set 2026), and so is section B with it.
 *
 * It held the types still drawn two ways, each with the singleton that was the
 * reason — five on 12 September, three on the 13th, one on the 14th. Section B
 * compared the two mounts of each: the box on the class both carried, position
 * and stacking on the id of the focused one.
 *
 * With the table empty that comparison has no subject, and an empty table is an
 * invitation to add a row — the same reasoning that deleted `FOCUSED_SURFACE_BOXES`
 * on the 14th rather than emptying it. What replaces it is one clause, asked of
 * the registry rather than of a list (`check-surfaces.mjs` §14): every
 * `WindowType` declared in `workspace.ts` has a constructor, with no exceptions
 * to print.
 */

/** The four panels, by the id each USED to be. Named so their absence can be
 *  asserted rather than hoped for — see clause A8. */
const PANEL_IDS = ["emtree", "nodelist", "inspector", "logpanel"];

// ════════════════════════════════════════════════════════════════════════════
// A · for the SIX: the second path does not exist
// ════════════════════════════════════════════════════════════════════════════

// ── A1 · no singleton in the markup, and no rules left behind ───────────────
{
  for (const [type, ids] of Object.entries(CONVERTED)) {
    for (const id of ids) {
      ok(Sorg.elementi(HTML, `#${id}`).length === 0,
        `${type}: \`#${id}\` must not be in index.html. It was the FOCUSED mount ` +
          "of this type, and a singleton in the markup IS the second path — the " +
          "one the window that happens to have the focus uses and no other area " +
          "can.");
      ok(!Sorg.miraA(CSS, `#${id}`),
        `${type}: …and no rule may still aim at \`#${id}\`. A box that survives ` +
          "its element teaches the next person that the element is coming back.");
    }
  }
}

// ── A2 · `applyWindowSurface()` DOES NOT EXIST ─────────────────────────────
//
// It was the one place that decided WHICH SINGLETON was lit — eight `show()`
// calls, one per window type, each for a surface only the focused window could
// use. Every night of this series took lines out of it: six types on
// 12 September, the two hosted panels on the 13th, the narrative and the
// annotator on the 14th. What was left by then had nothing to do with surfaces
// — it showed the overview and refreshed the funnel, the two OVERLAYS of a
// canvas window — and tonight the overview became per instance, so both belong
// to `setAreaFocused`, which is where they are.
{
  ok(Sorg.corpoDi(TS, "applyWindowSurface").length === 0,
    "`applyWindowSurface` must not exist. A function whose job is «decide which " +
      "singleton is showing» has no job when no type has a singleton, and " +
      "keeping it as a place to put the next one is how the twin comes back.");
  ok(Sorg.corpoDi(TS, "mountWindow").length === 0,
    "…and neither may `mountWindow`, which was «the ONE place that knows how a " +
      "window type becomes something on screen». A window type becomes something " +
      "on screen by its CONSTRUCTOR now, in its own area.");
  // …and what took their place really is there, or this would pass on a file
  // that had simply lost both
  ok(Sorg.corpoDi(TS, "setAreaFocused").length > 0 &&
     Sorg.chiama(Sorg.dentro(TS, "setAreaFocused"), "refreshFunnel"),
    "…while the funnel, which IS a question only a canvas window answers, moved " +
      "to the one thing a focus change is allowed to do");
}

// ── A3 · `FOCUSED_SURFACE_BOXES` DOES NOT EXIST ────────────────────────────
//
// The table named the surfaces that MIGRATED: the same window's content living
// in a singleton inside `#canvas-wrap` while it had the focus and in an area's
// own box when it did not, so that only the WINDOW was a stable name for the
// reader's place. Seven rows on 12 September, two on the 13th, none tonight.
//
// Asked of the MODULE, imported and run — not of the file.
{
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}surface-scroll.ts`],
    bundle: true, format: "esm", write: false,
  });
  const S = await import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  ok(S.FOCUSED_SURFACE_BOXES === undefined,
    "`FOCUSED_SURFACE_BOXES` must be gone, not empty: a table of migrating " +
      "surfaces describes a crossing between two mounts, and there are no two " +
      "mounts. Left empty it would be an invitation to add a row.");
  for (const dead of ["rememberFocusedBoxes", "restoreFocusedBoxes",
                      "rememberScrollsIn", "restoreScrollsIn",
                      "MIGRATING_SURFACE_IDS"]) {
    ok(S[dead] === undefined,
      `…and \`${dead}\` with it: it existed only to carry a surface across ` +
        "that crossing, or to repair the detach that made the crossing lossy");
  }
  // …and what the module still does, which is a different and still-true thing:
  // a surface REBUILT in place loses its scroll, and this is what puts it back.
  ok(typeof S.paintSurface === "function" &&
     typeof S.surfacePlace === "function",
    "…while `paintSurface` and `surfacePlace` remain: a rebuild in place still " +
      "loses the reader's position, whoever has the focus");
}

// ── A4 · `buildSecondarySurface` DOES NOT EXIST ────────────────────────────
//
// The strongest form this clause can take, and the one the whole series was for.
// It used to say "it must not name these types"; every night took types out of
// it — six on 12 September, the two hosted panels on the 13th, the last two on
// the 14th — and a function with nothing left in it is not a smaller second
// path. It is none.
{
  ok(Sorg.corpoDi(TS, "buildSecondarySurface").length === 0,
    "`buildSecondarySurface` must not exist. It WAS the second path: the " +
      "function that drew a window which did not have the focus, while the " +
      "focused one was drawn by a singleton. Parity between the two was an " +
      "invariant kept BY HAND, type by type — and a branch that comes back for " +
      "any type at all brings the whole invariant back with it.");
  ok(Sorg.corpoDi(TS, "tileNote").length === 0,
    "…and neither may `tileNote`, its fall-through. «Step in to work here» is " +
      "an area announcing its own name instead of showing the document, and " +
      "after tonight no type can reach it.");
}

// ── A5 · the SIX are registered, and it is the registry that says so ───────
//
// Executed, not read: `shell/types.ts` is bundled and its registration function
// called with stub renderers, and the REGISTRY is asked which types exist. A
// type written into a comment, or into a branch that is never reached, does not
// appear here.
{
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}shell/types.ts`],
    bundle: true, format: "esm", write: false,
  });
  const M = await import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  const nothing = new Proxy({}, { get: () => () => {} });
  M.registerBuiltinSurfaces(nothing);
  const registered = M.convertedTypes().sort();
  assert.deepEqual(registered, Object.keys(CONVERTED).sort(),
    `the registry holds exactly the converted types — got ${registered.join(", ")}`);
  checks++;
  for (const type of registered) {
    const s = M.surfaceTypeOf(type).create({ id: "w", type, state: {} });
    for (const verb of ["mount", "refresh", "setFocused", "destroy"])
      ok(typeof s[verb] === "function",
        `${type}: the contract is honoured — \`${verb}\` exists on the surface`);
  }
}

// ── A6 · `selectWindow()` does not rebuild the tree ────────────────────────
//
// THE criterion of the night, in one clause.
{
  const body = Sorg.dentro(TS, "selectWindow");
  ok(body.length > 0, "selectWindow was found");
  ok(!Sorg.chiama(body, "renderTiles"),
    "selectWindow() must not call renderTiles(). The focus follows the mouse, " +
      "so that call made a movement of the pointer destroy and rebuild every " +
      "area — which is what `surface-scroll`, `wrapWin` and `releaseTilePanels` " +
      "existed to compensate for. The focus decides where the events go, never " +
      "what is drawn.");
  ok(Sorg.chiama(body, "setAreaFocused"),
    "…and what it does instead is turn the focus off on one area and on in " +
      "another — or this clause would pass on a function that does nothing");
}

// ── A7 · no `setFocused` touches the layout ────────────────────────────────
//
// The AST of `shell/types.ts`, walked: inside any method called `setFocused`,
// a write to `style`, a call to a `render*`, or a child added or removed is the
// law of §1 being broken, and it is the only place the law can be wrong.
{
  const sf = ts.createSourceFile("types.ts", SHELL, ts.ScriptTarget.Latest, true);
  const found = [];
  let bodies = 0;
  // `refresh` is in the list because it was NOT, and the proving run caught it:
  // `setFocused(on) { markFocus(root, on); this.refresh(); }` passed the fence
  // while repainting the whole surface on every crossing of a divider. A verb
  // that repaints is a verb that changes what is drawn, whoever owns it.
  const FORBIDDEN_CALLS =
    /^(render|refresh|repaint|draw|append|prepend|insert|remove|replace|build|mount|paint|layout)/i;
  const walkFocus = (node, sins) => {
    if (ts.isPropertyAccessExpression(node) &&
        (node.name.text === "style" || node.name.text === "innerHTML" ||
         node.name.text === "textContent"))
      sins.push(`writes \`${node.name.text}\``);
    if (ts.isCallExpression(node)) {
      let e = node.expression;
      const name = ts.isPropertyAccessExpression(e) ? e.name.text
                 : ts.isIdentifier(e) ? e.text : "";
      if (FORBIDDEN_CALLS.test(name)) sins.push(`calls \`${name}()\``);
    }
    node.forEachChild((c) => walkFocus(c, sins));
  };
  const walk = (node) => {
    const isFocus =
      (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
      node.name?.getText(sf) === "setFocused";
    if (isFocus) {
      bodies++;
      const sins = [];
      walkFocus(node, sins);
      if (sins.length) found.push(`${node.name.getText(sf)} ${sins.join(", ")}`);
    }
    node.forEachChild(walk);
  };
  walk(sf);
  // EVERY CONSTRUCTOR implements it — counted against the constructors, not
  // against the types, and the difference is the finding: there are eight
  // converted types and seven `create` bodies, because `emtree` and `inspector`
  // share ONE factory (`panelSurface`). Two types drawn by one constructor is
  // the whole shape of the conversion, so a fence that demanded one body per
  // type would be demanding the twin back.
  let creators = 0;
  const countCreate = (n) => {
    if ((ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)) &&
        n.name?.getText(sf) === "create") creators++;
    n.forEachChild(countCreate);
  };
  countCreate(sf);
  ok(bodies === creators && creators > 0,
    `every surface constructor implements setFocused — ${creators} constructors, ` +
      `${bodies} bodies. (That there are fewer constructors than converted ` +
      "types is right: the two hosted types share one.)");
  ok(found.length === 0,
    "a setFocused implementation touches the LAYOUT: " + found.join(" · ") +
      ". `setFocused` may turn input handling on and off and draw the focus " +
      "ring. It may not change what is visible or how it is arranged — that is " +
      "the whole law, and this is the only place it can be broken quietly.");
}

// ── A8 · NO PANEL ELEMENT LIVES OUTSIDE A SURFACE ──────────────────────────
//
// The clause that had no meaning before tonight, because before tonight it was
// false by design.
//
// A panel was ONE ELEMENT: `document.getElementById("inspector")` at boot, and
// then a life of being moved — into `#side` while nobody showed it, into
// whichever area claimed it, into the floating tool, and back. Everything that
// followed (a release pass, a claim pass, a "where does this live?" guard, and a
// note in the second area saying another window had it) followed from that one
// fact.
//
// So the fence asks the one question that makes it impossible: **is any of the
// four still fetched from the document?** A panel that is built into its
// window's own host cannot be; a panel that is parked anywhere must be. And
// `#side` — the parking place itself — must not exist in the markup or be
// looked up in the code.
//
// Said of the PROGRAM, not the file: `Sorg.chiama` finds a real call expression
// and `stringheLetterali` a whole string. The word `side` alone would be useless
// here — `aside`, `sidecar`, `sidebar` and `setSidePanel` all contain it, and
// this file names three of them.
{
  // WHAT THE PROGRAM FETCHES, from the AST — not "does this file contain the
  // word". The first version of this clause asked
  // `chiama(TS, "document.getElementById") && literals.includes(id)` and fired
  // immediately on `"emtree"`, which is an honest literal in four other places:
  // the tab list (`{ id: "emtree", labelKey: … }`), the branch of `mountPanel`
  // that builds it, the workspace type, the i18n key. Constructed by running it.
  // The question is only ever about the ARGUMENT of a lookup.
  const fetchedIds = new Set();
  {
    const sf = ts.createSourceFile("main.ts", TS, ts.ScriptTarget.Latest, true);
    const walk = (n) => {
      if (ts.isCallExpression(n) && n.arguments.length &&
          ts.isStringLiteral(n.arguments[0])) {
        const e = n.expression;
        const name = ts.isPropertyAccessExpression(e) ? e.name.text
                   : ts.isIdentifier(e) ? e.text : "";
        const arg = n.arguments[0].text;
        if (name === "getElementById") fetchedIds.add(arg);
        if (name === "querySelector" || name === "querySelectorAll") {
          for (const m of arg.matchAll(/#([A-Za-z][-\w]*)/g)) fetchedIds.add(m[1]);
        }
      }
      n.forEachChild(walk);
    };
    walk(sf);
  }
  const literals = Sorg.stringheLetterali(TS);
  const fetched = (id) => fetchedIds.has(id);
  for (const id of PANEL_IDS) {
    ok(!fetched(id),
      `no panel may be fetched from the document: \`getElementById("${id}")\` ` +
        "means there is ONE of it, and everything the panels used to need — a " +
        "parking place, a release pass, a claim pass, a note saying another " +
        "window had it — followed from exactly that.");
    ok(Sorg.elementi(HTML, `#${id}`).length === 0,
      `…and \`#${id}\` must not be in the markup either`);
  }
  ok(!fetched("side"),
    "`#side` — the hidden parking place — must not be looked up: a panel that " +
      "is built where it is shown has nowhere it needs to be put back to");
  // …and the lookup set is not empty, or every clause above would pass on a
  // file that fetches nothing at all
  ok(fetchedIds.size > 5,
    `the lookup set is real — ${fetchedIds.size} ids are fetched by this file`);
  ok(Sorg.elementi(HTML, "#side").length === 0,
    "…and it must not be in the markup");
  // …and the positive half, or this would pass on an application with no panels
  void literals;
  const shell = Sorg.stringheLetterali(SHELL);
  ok(shell.some((x) => x.includes("tile-panel-body")),
    "…while the panel BODY a window builds for itself is still there — the " +
      "clause above must fail on a parked panel, not on a deleted one");
  ok(Sorg.corpoDi(TS, "mountPanel").length > 0,
    "…and `mountPanel` is what builds one, per window, into that body");
}

// ════════════════════════════════════════════════════════════════════════════
// B · what is true of EVERY window, now that no type is drawn twice
// ════════════════════════════════════════════════════════════════════════════

// ── B2 · the head is ONE builder, and it does not know about the focus ─────
//
// Stronger than the clause it replaces. The builder used to take an `active`
// flag and stamp `.hdr-passive` on every descendant of an unfocused bar — 92 to
// 106 class writes on every crossing of a divider, measured, for a class with no
// rules. What says which window takes the edits is `.tile-active` on the AREA,
// so the head is literally the same DOM in both states.
{
  const body = Sorg.dentro(TS, "buildAreaHeader");
  ok(body.length > 0, "buildAreaHeader is where the head is built");
  // ITS SIGNATURE, from the AST. Asked this way and not by looking for the word
  // "active", which was this clause's own first bug — twice, once in each
  // version of this fence. `classList.toggle("active", tt === type)` marks the
  // CURRENT item of the type menu and the CURRENT mode, and has nothing to do
  // with the focus; the old check worked around it by counting occurrences and
  // requiring exactly two. The parameter list does not need a workaround: a
  // builder that takes only the window cannot be told who has the focus.
  const sf = ts.createSourceFile("main.ts", TS, ts.ScriptTarget.Latest, true);
  let params = null;
  const findFn = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.getText(sf) === "buildAreaHeader")
      params = n.parameters.map((p) => p.name.getText(sf));
    n.forEachChild(findFn);
  };
  findFn(sf);
  assert.deepEqual(params, ["win"],
    `buildAreaHeader takes the WINDOW and nothing else — got ${
      params ? params.join(", ") : "no such function"}. A second parameter is ` +
      "how the two heads used to be allowed to differ, and the text that " +
      "appears and vanishes is what makes the rows move.");
  checks++;
  for (const word of ["hdr-passive", "tile-active"]) {
    ok(!Sorg.nomina(body, word),
      `…and it must not name "${word}": the focus ring is drawn on the AREA by ` +
        "`setAreaFocused`, so the head is literally the same DOM in both states");
  }
  // …and it must not ask for the active window WHILE BUILDING. The walk stops at
  // every nested function, and that distinction is not pedantry: the `⊟` join
  // chip's CLICK handler legitimately reads `activeWin()` — after a join the
  // active window has changed and has to be mounted. A blunt "does this function
  // mention activeWin" said yes to that and would have been answered by moving
  // the call somewhere worse. What must not happen is the bar being BUILT
  // differently depending on who has the focus.
  {
    let buildingReadsFocus = false;
    const isNestedFn = (n) =>
      ts.isArrowFunction(n) || ts.isFunctionExpression(n) ||
      ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
    const scan = (n) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === "activeWin")
        buildingReadsFocus = true;
      n.forEachChild((c) => { if (!isNestedFn(c)) scan(c); });
    };
    const enter = (n) => {
      if (ts.isFunctionDeclaration(n) && n.name?.getText(sf) === "buildAreaHeader"
          && n.body) n.body.forEachChild((c) => { if (!isNestedFn(c)) scan(c); });
      n.forEachChild(enter);
    };
    enter(sf);
    ok(!buildingReadsFocus,
      "the head is BUILT without reading who has the focus. Its handlers close " +
        "over the window they belong to, because a bar can belong to a window " +
        "that is not the focused one.");
  }
}

// ── B3 · what the head PROMISES, the head builds ──────────────────────────
{
  const strip = Sorg.dentro(TS, "buildHeaderStrip");
  ok(strip.length > 0, "buildHeaderStrip was found");
  const built = new Set(Sorg.stringheLetterali(strip)
    .flatMap((s) => [...s.matchAll(/win-strip-(\w+)/g)].map((m) => m[1])));
  // Asked of the LITERALS of both files, not of a regexp over one of them: the
  // lookups moved into `shell/types.ts` when the six were converted, so a fence
  // that only read `main.ts` reported "nobody writes into the strip" — which was
  // true of the file and false of the program. Found by running it.
  const consumers = [
    ["main.ts", Sorg.stringheLetterali(TS.replace(Sorg.corpoDi(TS, "buildHeaderStrip"), ""))],
    ["shell/types.ts", Sorg.stringheLetterali(SHELL)],
  ];
  const looked = new Set();
  for (const [, literals] of consumers)
    for (const lit of literals)
      for (const m of lit.matchAll(/win-strip-(\w+)/g)) looked.add(m[1]);
  ok(looked.size > 0,
    "some surface writes into its area's header strip — if nothing does, either " +
      "the strip has stopped carrying the counts and crumbs, or this clause is " +
      "reading the wrong files");
  for (const name of looked) {
    ok(built.has(name),
      `a surface looks up \`.win-strip-${name}\` in its area's strip, so ` +
        "`buildHeaderStrip` must build it — otherwise the lookup returns null " +
        "and that information silently disappears");
  }
  ok(nominaTipo(strip, "shelf"),
    "the shelf's own chrome is built in the STRIP, by the one builder every " +
      "area calls. While it lived in `#shelf-bar` no amount of levelling the " +
      "box could help: the two mounts did not carry the same furniture.");
}

// ── B4 · the reserved width is published on the AREA, in every state ──────
{
  const panel = Sorg.dentro(TS, "buildResourcePanel");
  ok(Sorg.chiama(panel, "area.style.setProperty"),
    "`--palette-w` is published on the element that reserves the width, by " +
      "`buildResourcePanel` — which every area goes through");
  const tiles = Sorg.dentro(TS, "renderTiles");
  ok(Sorg.chiama(tiles, "buildResourcePanel"),
    "…called by `renderTiles` for every area. It used to have to be called TWICE " +
      "— once in the loop over the areas and once for the wrap — because the wrap " +
      "was an area that was not in the loop. There is one loop now.");
}

// ── B5 · the nine of `#shelf-bar`, and where each of them went ────────────
//
// THE TRAP, closed by naming it: the fastest way to make a clause about a
// vanished element pass is to DELETE the element and whatever it contained. So
// the inventory is data here, each entry asserted at its new address. A function
// that quietly disappeared fails this check, rather than being discovered in six
// months in a trench.
const NINE = [
  ["the list's NAME",   "win-strip-shelfname", "header strip"],
  ["its entry COUNT",   "win-strip-count",     "header strip"],
  ["⟳ refresh",         "win-strip-refresh",   "header strip · Table mode only"],
  ["the URI field",     "shelf-uri-input",     "+ URI form"],
  ["the FENCE select",  "shelf-uri-scope",     "+ URI form"],
  ["the ACCESS select", "shelf-uri-access",    "+ URI form"],
  ["the ADD verb",      "shelf-uri-go",        "+ URI form"],
  ["OPEN…",             "menu.shelfOpen",      "Shelf menu"],
  ["SAVE",              "menu.shelfSave",      "Shelf menu"],
];
{
  const literals = Sorg.stringheLetterali(TS);
  for (const [what, token, where] of NINE) {
    ok(literals.some((s) => s.includes(token)),
      `${what} must still be reachable — it lives in ${where} now. Nothing of ` +
        "the nine was allowed to go missing on the way out of `#shelf-bar`.");
  }
  ok(Sorg.corpoDi(TS, "openShelfUriForm").length > 0,
    "the four controls that make one gesture (address · fence · access · add) " +
      "are a popover behind one chip");
}

// ── B6 · and the two strips HDR2 hid are gone for good ────────────────────
{
  for (const id of ["shelf-bar", "storage-bar", "table-view-head"]) {
    ok(Sorg.elementi(HTML, `#${id}`).length === 0,
      `\`#${id}\` is gone from the markup: the chrome it held is in the window ` +
        "header, which every area builds");
    ok(!Sorg.miraA(CSS, `#${id}`),
      `…and so are its rules — a row that no longer exists must not keep a box`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// C · THE FOCUS IS NOT READ AFTER THE PROGRAM HAS WAITED  (14 set 2026)
// ════════════════════════════════════════════════════════════════════════════
//
// The rebuilding of the windows left one thing of the old architecture standing,
// by a declared choice: the focus is AMBIENT. `commands.ts` knows no context, so
// a command is not addressed to a window — it is addressed to «whoever has the
// focus now». While there was one editor, «now» was an innocent question.
//
// It is not innocent any more, and the reason is exactly what the rebuilding
// made normal: the focus FOLLOWS THE MOUSE, across eleven window types. It does
// not move on a click, it moves on a movement — continuously, and also while the
// application is waiting for something.
//
// So: no read of `activeWin()` after a suspension point in the same body. What
// the read is FOR does not matter here; what matters is that between the body's
// entry and the read the program gave the event loop a turn, and a pointermove
// is one event.
//
// Measured when this clause was written: `main.ts` spells `activeWin()` 57
// times and CALLS it 54 — three sit inside comments. Of the 54, three were
// exposed. One was a defect and was repaired (`addStorageRootPath`, reproduced
// with two Storage windows: the root added from the left one, the pointer moved
// right while the POST was in flight, and the RIGHT window went back to the
// roots). The other two are declared below.
{
  const esposte = Sorg.dopoUnaSospensione(TS, "activeWin", "main.ts");

  // The declared exceptions, by name and with the reason — a guard that
  // compares against a window CAPTURED BEFORE the wait. This is the same thing
  // this clause says, written by hand in one place before the rule existed, and
  // it is left exactly as it was found.
  //
  // What it is NOT, and this is worth saying rather than blurring: the rule
  // completes the command on the window it started from; this guard ABANDONS the
  // work when the focus has moved. For an image loading off a disk that means a
  // slow disk shows nothing at all. It is defensible — nothing is written to the
  // wrong window — and it is not the same sentence. Named here, not changed.
  // ── how an exception is NAMED here, and why it is not a line number ──────
  //
  // 15 set 2026. These two were declared by line — `{ riga: 12315 }` and
  // `{ riga: 12320 }` — and this fence was BORN RED because of it. The numbers
  // were true of `main.ts` as it stood when the clause was written (b533888);
  // it was committed one commit later (c65def1), together with the work that
  // had added fifty-odd lines above `renderAnnotator`, and the two reads were
  // at 12372 and 12377 the moment it landed in `main`. Nothing was wrong with
  // the code and nothing was wrong with the reasons below. The coordinate had
  // expired between being written and being pushed — and in a file of eighteen
  // thousand lines edited by two hands, that is the normal case, not bad luck.
  //
  // So the key is `Sorg.identita`: the BODY the read is in, the BRANCH it sits
  // on, and the SENTENCE it is written in. Measured across the six commits of
  // this series the two lines travelled from 12192/12197 to 12390/12395 — two
  // hundred lines — and both identities were byte-identical at every one.
  //
  // The branch is not decoration: it is what separates these two from each
  // other, and it is what their two reasons are about. One is the good path,
  // one is the failure.
  const DICHIARATE = [
    { chi: "(dentro renderAnnotator)", ramo: "try",
      testo: "activeWin().id !== win.id || annotatorNodeId() !== nodeId",
      perche: "guard: compares with `win`, the annotator's own window, captured " +
              "before `collectionFromFile` — the image lands in the window that " +
              "asked for it, or in none" },
    { chi: "(dentro renderAnnotator)", ramo: "catch",
      testo: "activeWin().id !== win.id",
      perche: "the same guard on the failing branch: the error message must not " +
              "be written into somebody else's annotator" },
  ];
  const nome = (d) => Sorg.identita({ funzione: d.chi, ramo: d.ramo, testo: d.testo });

  for (const e of esposte) {
    const d = DICHIARATE.find((x) => nome(x) === Sorg.identita(e));
    ok(d, `main.ts:${e.riga} reads \`activeWin()\` after ${e.motivo} (line ` +
      `${e.dove}), in \`${e.funzione}\`${e.ramo ? ` (${e.ramo})` : ""}: ` +
      `\`${e.testo}\`. Between the two the program gave the ` +
      "event loop a turn, and the focus FOLLOWS THE MOUSE: that read can answer " +
      "with a window the user merely drifted over. Capture the window at the top " +
      "of the body and use it — a command acts on the window it started from. " +
      "If the environment really is the right answer here, declare it in " +
      "`DICHIARATE` with the reason — by identity, never by line.");
  }
  for (const d of DICHIARATE)
    ok(esposte.some((e) => Sorg.identita(e) === nome(d)),
      `the declared exception «${nome(d)}» is no longer an ` +
      "exposed read — either it was repaired, or it was rewritten and its reason " +
      "no longer describes it. A declaration that protects nothing is a line " +
      "that will outlive its reason. Read it again, then delete it or restate it.");

  // …and the shape this reader cannot decide: a body handed to a function that
  // may run it now or store it and run it later. Never swallowed.
  //
  // …and this table had the SAME defect, one paragraph below the one that was
  // repaired: `{ 8073: … }` was the line of that read at b533888 and it is 8148
  // now. It never failed only because the loop above threw first — the fence
  // was red in two places and could report one. Keyed by identity like the
  // other, and the reader now names an anonymous listener by what it was handed
  // to rather than "(anonima)", which is what made this key writable at all.
  const IGNOTE = [
    { chi: "(argomento di onShelfChange)", ramo: "",
      testo: 'activeWin().type === "shelf"',
      perche: "`shelf.ts` pushes the listener onto a list and calls it from " +
              "`changed()`, which runs inside the mutation: the shelf is changed " +
              "by a gesture, not after a wait" },
    // TOCCARE · the canvas pointermove listener is wrapped in the dev stopwatch
    // (`perf.ts::perfTime`), which calls its argument AT ONCE and returns its
    // value — so this read still happens inside the fresh event, exactly as it
    // did when the body was handed to `addEventListener` directly.
    { chi: "(argomento di perfTime)", ramo: "if",
      testo: "over && over.winId !== activeWin().id",
      perche: "`perfTime(name, fn)` is `fn()` between two clock reads: " +
              "synchronous, never stored" },
  ];
  for (const t of Sorg.tempoIgnoto(TS, "activeWin", "main.ts"))
    ok(IGNOTE.some((i) => nome(i) === Sorg.identita(t)),
      `main.ts:${t.riga} reads \`activeWin()\` inside a body ` +
      `handed to \`${t.passataA}\`, which this reader cannot classify: it may ` +
      "run inside its caller or be stored and run an hour later, and the " +
      "difference is in the callee, not at this call. Say which, in `IGNOTE` — " +
      `by identity: «${Sorg.identita(t)}».`);
  for (const i of IGNOTE)
    ok(Sorg.tempoIgnoto(TS, "activeWin", "main.ts")
       .some((t) => Sorg.identita(t) === nome(i)),
      `the classified read «${nome(i)}» is not of unknown timing any more: ` +
      "either it is gone, or the reader learned to place it. Either way this " +
      "row no longer says anything true.");

  console.log(`\n  FOCUS AFTER A WAIT · ${esposte.length} exposed read(s), ` +
    `${esposte.length} declared, 0 undeclared`);
  for (const e of esposte) {
    const d = DICHIARATE.find((x) => nome(x) === Sorg.identita(e));
    console.log(`    main.ts:${e.riga}  ${e.funzione} · ${e.ramo} — ${d.perche.slice(0, 56)}…`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// D · THE WINDOW MENU REGISTRY RECEIVES ITS WINDOW  (15 set 2026)
// ════════════════════════════════════════════════════════════════════════════
//
// `WINDOW_MENUS` is a module constant, and `buildAreaHeader(win)` walks it to
// build the bar of ONE window. So the window existed at the point the menu was
// built and was lost crossing into the registry — and every entry that needed
// one reached for `activeWin()` instead. Four did, and the Viewer entry opened
// with `const win = activeWin();` and then used `win` correctly everywhere
// below: the shape was already right, only the source of the value was wrong.
//
// `items(win)` is the whole of carrying it across. This clause is what keeps it
// carried: an entry added later gets the window handed to it, and if it reaches
// past the parameter for the environment the fence says so — because the
// environment is NOT the same window. Measured the night this was written, with
// two areas and the focus on the second: opening a menu from the FIRST area's
// bar leaves `activeWin()` on the second, while the menu the user is about to
// use belongs to the first. That is why the bar's verbs are wrapped in
// `focusThen` — a compensation at seventeen call sites for exactly this gap.
{
  const registro = Sorg.valoreDi(TS, "WINDOW_MENUS");
  ok(registro.length > 0,
    "`WINDOW_MENUS` is still a declaration in `main.ts` — this clause asserts " +
    "something about ITS value, and a rename must make the fence fail rather " +
    "than let it pass on an empty string");
  ok(!Sorg.chiama(registro, "activeWin"),
    "an entry of `WINDOW_MENUS` calls `activeWin()`. The registry is walked by " +
    "`buildAreaHeader(win)` to build the bar of ONE window, and that window is " +
    "handed to every entry as `items(win)` — so reaching for the focus here " +
    "asks a different question than the one the bar is answering. While a menu " +
    "is open the focus can be in another area entirely: use the parameter.");
  ok(Sorg.chiama(registro, "winMode") || Sorg.chiama(registro, "winCurrent"),
    "…and the registry still reads per-window state at all — if it stopped, " +
    "this clause would be guarding a rule with no subject");
}

// ── the tables, because "it is fine" has to be readable ───────────────────
console.log("\n  CONVERTED · one surface, and no second path");
for (const [type, ids] of Object.entries(CONVERTED)) {
  console.log(`    ${type.padEnd(10)} ok · ${ids.length} singleton${
    ids.length > 1 ? "s" : ""} retired: ${ids.join(", ")}`);
}
console.log("\n  NOT CONVERTED · none. Every window type has one constructor,");
console.log("  and the focus does not enter any of them.");
console.log("\n  the nine of #shelf-bar × where they went");
for (const [what, , where] of NINE) {
  console.log(`    ${what.padEnd(18)} ${where}`);
}
console.log(`\nfocus-parity: ${checks} checks passed`);
