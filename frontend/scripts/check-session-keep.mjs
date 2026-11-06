// MICRO-MEMORIA-SESSIONE p.2 · executable check of `src/session-keep.ts` — what a
// start does with the safety copy of the session before: taken back (the WebView
// fell a moment ago), offered (an older session ended unsaved) or let go; which
// files carry their content in the copy. The crash itself (a page that falls and
// reloads, its graph, file, selection and unsaved change back) is driven in the
// browser by `check-memoria-sessione.mjs`.
//
//   node scripts/check-session-keep.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./session-keep";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const K = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepStrictEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const now = Date.UTC(2026, 10, 6, 13, 0, 0);
const rec = (o = {}) => ({ id: "s1", started: now - 3600e3, at: now - 20e3, files: [{ path: "/T/EM/v6.em.json", name: "v6.em.json", dirty: false }],
  activeGraphId: "g1", activeFile: 0, selected: "US12", view: "matrix", ...o });

eq(K.decideRestore(null, null, now), "none", "no copy: nothing");
eq(K.decideRestore(rec({ files: [] }), { id: "s1", beat: now - 3e3, clean: false }, now), "none", "a copy with no file: nothing");
eq(K.decideRestore(rec(), { id: "s1", beat: now - 4e3, clean: false }, now), "auto", "its heart beat 4 s ago and it did not end: it FELL — back without asking");
eq(K.decideRestore(rec(), { id: "s1", beat: now - 4e3, clean: true }, now), "none", "it ended clean (closed with nothing unsaved): nothing");
eq(K.decideRestore(rec({ at: now - 3 * 3600e3 }), { id: "s1", beat: now - 3 * 3600e3, clean: false }, now), "none", "ended long ago, nothing unsaved: let go");
eq(K.decideRestore(rec({ at: now - 3 * 3600e3, files: [{ path: null, name: "x", dirty: true, text: "{}" }] }), { id: "s1", beat: now - 3 * 3600e3, clean: false }, now), "ask",
   "ended long ago WITH unsaved changes: offered");
eq(K.decideRestore(rec({ at: now - 30e3 }), { id: "other", beat: now - 1e3, clean: false }, now), "none",
   "the heartbeat is another session's (a second window): this copy is not one that fell");
eq(K.decideRestore(rec({ at: now - 200e3 }), { id: "s1", beat: now - 190e3, clean: false }, now), "none", "over 2 min of silence, nothing unsaved: not taken back by itself");

eq(K.keepsText({ path: "/a.em.json", dirty: false }, true), false, "desktop, saved, with a path: read back from the disk");
eq(K.keepsText({ path: "/a.em.json", dirty: true }, true), true, "unsaved: its content is kept");
eq(K.keepsText({ path: null, dirty: false }, true), true, "no path: its content is kept");
eq(K.keepsText({ path: "/a.em.json", dirty: false }, false), true, "a browser cannot read a path back: kept");
eq(K.keepsText({ path: null, dirty: true, room: { id: "r" } }, false), false, "a room's graph: entered again, never copied");

eq(K.staleIds([{ id: "a", at: 1 }, { id: "b", at: 5 }, { id: "c", at: 3 }, { id: "live", at: 9 }], "live"), ["a"], "the two newest copies kept, never the live one");
eq(K.clockOf(new Date(2026, 10, 6, 9, 5).getTime()), "09:05", "the hour said");
eq([K.BEAT_MS, K.FRESH_MS], [5000, 120000], "a heartbeat every 5 s, a fall within 2 min");

console.log(`check-session-keep: ${checks} checks OK`);
