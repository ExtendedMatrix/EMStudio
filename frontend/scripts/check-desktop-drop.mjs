// MICRO-TILESET-SHIFT-E-EPOCHE p.3 (25 Oct 2026) · executable check of
// `src/desktop-drop.ts`, the routing of a drop from the Finder in the desktop:
//
//   node scripts/check-desktop-drop.mjs
//
//   · which window takes it and as what: a folder / a .zip / a .3tz /
//     tileset.json on a Viewer or a Scene → the tileset, as a Storage PATH;
//     the RealityScan pair X.json + X/ → the folder; X/ in a zip + X.json → the
//     zip; a folder on a Viewer may be pinned as a collection, on a Scene not;
//   · an em.json, a .emj, a GraphML → opened as a document, on any window
//     (a Viewer too: the browser's window-wide drop), the em.json preferred
//     to the archive dropped with it on a graph window;
//   · a folder or an archive on a window that is not a Viewer or a Scene →
//     said, not opened; nothing dropped → nothing;
//   · the kind guessed from the name when the disk is not asked, the hover's
//     «might be a tileset», the position in CSS pixels (Windows physical,
//     macOS/Linux already logical), Windows paths `/`-shaped.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ stdin: { contents: `export * from "./desktop-drop";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent" });
const D = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const eq = (a, want, what) => {
  checks++;
  try { assert.deepStrictEqual(a, want); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(want)}`); }
};

const B = "/Users/x/Desktop/BasilicaTSL_cesium";
const dir = (path) => ({ path, kind: "dir" });
const file = (path) => ({ path, kind: "file" });
const viewer = { win: "w1", type: "viewer" };
const scene = { win: "w2", type: "scene" };
const matrix = { win: "w3", type: "matrix" };
const shelf = { win: "w4", type: "shelf" };
const plan = D.planDesktopDrop;

// ── tilesets on a Viewer / a Scene ──────────────────────────────────────────
eq(plan([dir(`${B}/tileset_Basilica_TLS_ED`)], viewer),
  { action: "tileset", win: "w1", path: `${B}/tileset_Basilica_TLS_ED`, type: "dir", pinFolder: true }, "a folder on the Viewer");
eq(plan([dir(`${B}/tileset_Basilica_TLS_ED/`)], scene),
  { action: "tileset", win: "w2", path: `${B}/tileset_Basilica_TLS_ED`, type: "dir", pinFolder: false }, "a folder on the Scene (trailing / dropped, no pin)");
eq(plan([file(`${B}/tileset_Basilica_TLS_ED.json`), dir(`${B}/tileset_Basilica_TLS_ED`)], scene),
  { action: "tileset", win: "w2", path: `${B}/tileset_Basilica_TLS_ED`, type: "dir", pinFolder: false }, "the RealityScan pair → the folder");
eq(plan([file(`${B}/BasilicaTLS_tileset.zip`)], viewer),
  { action: "tileset", win: "w1", path: `${B}/BasilicaTLS_tileset.zip`, type: "file", pinFolder: false }, "a zip on the Viewer");
eq(plan([file(`${B}/X.json`), file(`${B}/X.zip`)], viewer).path, `${B}/X.zip`, "X/ in a zip + X.json → the zip (its root found beside)");
eq(plan([file(`${B}/pack.3TZ`)], scene).action, "tileset", "a .3tz (any case) on the Scene");
eq(plan([file(`${B}/t/tileset.json`)], viewer),
  { action: "tileset", win: "w1", path: `${B}/t/tileset.json`, type: "file", pinFolder: false }, "tileset.json on the Viewer");

// ── documents ───────────────────────────────────────────────────────────────
eq(plan([file("/d/GT16.em.json")], viewer), { action: "open", path: "/d/GT16.em.json" }, "an em.json on the Viewer opens (as the browser)");
eq(plan([file("/d/GT16.em.json")], scene), { action: "open", path: "/d/GT16.em.json" }, "an em.json on the Scene opens");
eq(plan([file("/d/GT16.emj")], matrix), { action: "open", path: "/d/GT16.emj" }, "a .emj on the Matrix");
eq(plan([file("/d/a.graphml")], null), { action: "open", path: "/d/a.graphml" }, "a GraphML outside every window");
eq(plan([file("/d/a.json")], shelf), { action: "open", path: "/d/a.json" }, "a .json on the Shelf opens (window-wide drop)");
eq(plan([file("/d/X.zip"), file("/d/g.em.json")], matrix), { action: "open", path: "/d/g.em.json" }, "on a graph window the em.json, not the zip");
eq(plan([file("/d/notes.txt"), file("/d/g.em.json")], matrix), { action: "open", path: "/d/g.em.json" }, "the document preferred to another file");
eq(plan([file("/d/notes.txt")], matrix), { action: "open", path: "/d/notes.txt" }, "the first file otherwise (the browser's loadFile)");
eq(plan([file("/d/plain.json")], viewer), { action: "open", path: "/d/plain.json" }, "a lone non-tileset .json on the Viewer opens as a document");

// ── said, not opened ────────────────────────────────────────────────────────
eq(plan([dir("/d/F")], matrix), { action: "none", why: "folder-elsewhere" }, "a folder on the Matrix");
eq(plan([file("/d/X.zip")], null), { action: "none", why: "archive-elsewhere" }, "a zip outside the windows");
eq(plan([], viewer), { action: "none", why: "empty" }, "nothing dropped");
eq(plan([file("")], viewer), { action: "none", why: "empty" }, "an empty path");

// ── Windows paths ───────────────────────────────────────────────────────────
eq(plan([dir("C:\\Users\\x\\T\\")], viewer).path, "C:/Users/x/T", "a Windows folder, /-shaped");

// ── the kind from the name ──────────────────────────────────────────────────
eq(D.guessKind(`${B}/tileset_Basilica_TLS_ED`), "dir", "no extension → a folder");
eq(D.guessKind(`${B}/Geometry/`), "dir", "a trailing / → a folder");
eq(D.guessKind(`${B}/x.em.json`), "file", "em.json → a file");
eq(D.guessKind(`${B}/a.3tz`), "file", ".3tz → a file");
eq(D.guessKind(`${B}/scan.e57`), "file", ".e57 → a file");

// ── the hover ───────────────────────────────────────────────────────────────
eq(D.mightBeTileset([`${B}/tileset_Basilica_TLS_ED`]), true, "hover: a folder name");
eq(D.mightBeTileset([`${B}/a.zip`]), true, "hover: an archive");
eq(D.mightBeTileset([`${B}/t/tileset.json`]), true, "hover: tileset.json");
eq(D.mightBeTileset(["/d/GT16.em.json"]), false, "hover: an em.json is not");

// ── the position ────────────────────────────────────────────────────────────
eq(D.toCssPoint({ x: 400, y: 300 }, 2, false), { x: 400, y: 300 }, "macOS: points are CSS pixels");
eq(D.toCssPoint({ x: 400, y: 300 }, 2, true), { x: 200, y: 150 }, "Windows: physical / dpr");
eq(D.toCssPoint({ x: 400, y: 300 }, 0, true), { x: 400, y: 300 }, "a dpr of 0 does not divide");
eq(D.toCssPoint(null, 1, false), null, "no position");
eq(D.toCssPoint({ x: NaN, y: 1 }, 1, false), null, "a position that is not a number");
eq(D.positionsArePhysical("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120"), true, "WebView2 → physical");
eq(D.positionsArePhysical("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"), false, "WKWebView → logical");

console.log(`check-desktop-drop: ${checks - fails.length}/${checks}`);
if (fails.length) {
  for (const f of fails) console.log(`  FAIL ${f}`);
  process.exit(1);
}
