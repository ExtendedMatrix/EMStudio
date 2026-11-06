// MICRO-MEMORIA-SESSIONE p.3 · the Log drawer can be COPIED (E.D., 1 Nov 2026:
// «si deve poter copiare ciò che si legge») — `src/logpanel.ts`: the filter
// (words, «solo la selezione»), one line as it is copied (its hour, its mark, its
// text, the nodes it names), several lines oldest first under the day, «Copia»
// on each line, and the drawer's text selectable. The clipboard and the redraw
// held during a selection are driven in the browser by `check-memoria-sessione.mjs`.
//
//   node scripts/check-log-copy.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const { window: win, document: doc } = parseHTML("<!doctype html><html><body><div id='b'></div></body></html>");
globalThis.window = win; globalThis.document = doc;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./logpanel";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const L = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepStrictEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const at = (h, m, s, d = 6) => new Date(2026, 10, d, h, m, s).getTime();
const E = [
  { level: "info", message: "container: TempluMare_v6 — 3 member(s)", at: 1, wall: at(9, 1, 2) },
  { level: "warn", message: "Column_shadow.035 non caricato: ~669 MB", at: 2, wall: at(9, 2, 3), ids: ["rm1"] },
  { level: "error", message: "save failed: disk full", at: 3, wall: at(9, 3, 4) },
  { level: "info", message: "Modifica: modificato US 12 (descrizione)", at: 4, wall: at(9, 4, 5), ids: ["us12"] },
];
const names = { rm1: "Column_shadow.035", us12: "US 12" };
const nameOf = (id) => names[id] ?? null;

eq(L.entryText(E[1], nameOf), "09:02:03 ! Column_shadow.035 non caricato: ~669 MB [Column_shadow.035]", "a line: hour, mark, text, the node it names");
eq(L.entryText(E[2]), "09:03:04 × save failed: disk full", "an error's mark, no nodes");
eq(L.filterEntries(E, { text: "column" }).length, 1, "a word filters (case ignored)");
eq(L.filterEntries(E, { text: "modifica us" }).map((e) => e.wall), [E[3].wall], "several words: all of them");
eq(L.filterEntries(E, { text: "descrizióne" }).length, 1, "accents ignored");
eq(L.filterEntries(E, { text: "09:03" }).length, 1, "the hour is part of the line");
eq(L.filterEntries(E, { text: "us 12", nameOf }).length, 1, "the names of the nodes too");
eq(L.filterEntries(E, { onlyIds: new Set(["rm1", "us12"]) }).length, 2, "«solo la selezione»");
eq(L.filterEntries(E, { onlyIds: new Set(["rm1"]), text: "salvato" }).length, 0, "both filters together");
const all = L.entriesText(E, nameOf, "EMStudio 1.6.0-dev.105 · Log");
eq(all.split("\n")[0], "EMStudio 1.6.0-dev.105 · Log · 2026-11-06", "the head says the day");
eq(all.split("\n").slice(1, 3), ["09:01:02 · container: TempluMare_v6 — 3 member(s)", "09:02:03 ! Column_shadow.035 non caricato: ~669 MB [Column_shadow.035]"],
   "oldest first (the drawer shows the newest on top; a paste is read top to bottom)");
eq(all.endsWith("\n"), true, "ends with a newline");
const night = [{ ...E[0], wall: at(23, 59, 58, 5) }, { ...E[1], wall: at(0, 0, 5, 6) }];
eq(L.entriesText(night).split("\n")[0], "2026-11-05 → 2026-11-06", "a ring across midnight names both days");

// the drawer: «Copia» on each activity line, giving its text
const host = doc.getElementById("b");
for (const e of E) (e.level === "warn" ? L.logWarn : e.level === "error" ? L.logError : L.logInfo)(e.message, e.ids);
const copied = [];
L.renderLogPanel(host, null, "1.6.41", undefined, { nameOf, onCopy: (t) => copied.push(t), copyLabel: "Copia" });
const btns = [...host.querySelectorAll("[data-log-copy]")];
eq(btns.length, 4, "«Copia» on each line");
eq(btns[0].textContent, "Copia", "in the interface's words");
btns[0].dispatchEvent(new win.Event("click"));
eq(/^\d\d:\d\d:\d\d · Modifica: modificato US 12 \(descrizione\) \[US 12\]$/.test(copied[0]), true, "the newest line on top, copied with its hour and its node");
L.renderLogPanel(host, null, "1.6.41", undefined, { nameOf, text: "save" });
eq(host.querySelectorAll(".log-activity li").length, 1, "the panel shows what the filter leaves");
eq(host.querySelector(".log-section:last-of-type")?.textContent?.startsWith("Activity (1)"), true, "and counts it");

// the drawer's text is selectable, its head carries the filter and the two copies
const css = readFileSync(`${SRC}style.css`, "utf8");
eq(/\.log-drawer-body, \.log-drawer-body \* \{ user-select: text; -webkit-user-select: text; \}/.test(css), true, "the drawer's text can be selected (WebKit too)");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
eq(["log-filter", "log-copy-shown", "log-copy-all"].every((id) => html.includes(`id="${id}"`)), true, "the head: filter, «Copia i filtrati», «Copia tutto»");

console.log(`check-log-copy: ${checks} checks OK`);
