// MICRO-SEG08 · executable check of the page «Impostazioni ▸ Estensioni» (it was
// the window Strumenti ▸ Estensioni…) and of the rename «Add-ons» → «Strumenti di
// terze parti»:
//   · «Dove la trovi» (src/extensions-where.ts) on the commands of the REAL
//     Geofisica manifest (em-extensions, geofisica 0.1.0): door.reader → File ▸
//     Porta dentro…, the panel → Spazio ▸ barra laterale ▸ tab «Geofisica», space.layer → Spazio ▸ Layer,
//     space.tool → Spazio ▸ barra degli strumenti, inspector.section → Ispettore, the
//     vocabularies → the Inspector's pickers, a command → em.app.commands.run(…);
//   · the page (src/extensions-window.ts, linkedom): Geofisica «solo dati» says
//     so on its line, ONE action «Installa il codice», the places read from its
//     archive (a preview) marked ○ but the vocabularies ●; after the code, every
//     place ● with «Mostrami» that calls the host with the place;
//   · the repositories' selector (the official first, «Ufficiale», «+ N altri»)
//     and its panel: the official pausable not removable, the others with
//     Modifica / Rimuovi, «Non firmato», «Aggiungi un repository»;
//   · the strings: EN + IT for every key the page uses; no «Add-ons» /
//     «Componenti aggiuntivi» left for EMStudio's own tools (Blender's own
//     add-ons keep their name); the Settings' tabs in their groups.
//
//   node scripts/check-ext-page.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

// ── the commands and panels of geofisica 0.1.0 (em-extension.toml, as the preview gives them) ──
const L = (en, it) => ({ en, it });
const GEO_COMMANDS = [
  { id: "geofisica.ingest", label: L("Import a geophysical stack", "Importa una pila geofisica"), in: [],
    slots: [{ name: "folder", kind: "path", required: true }, { name: "kind", kind: "string", required: false }] },
  { id: "geofisica.read", label: L("Geophysical stack", "Pila geofisica"), in: ["door.reader@2"], folders: true,
    slots: [{ name: "folder", kind: "path", required: true }] },
  { id: "geofisica.describe", label: L("What the folder is", "Che cos'è la cartella"), in: [], slots: [{ name: "folder", kind: "path", required: false }] },
  { id: "geofisica.section", label: L("Geophysical reading", "Lettura geofisica"), in: ["inspector.section@1"], when: "selection:document|USD",
    slots: [{ name: "id", kind: "id", required: true }] },
  { id: "geofisica.layer", label: L("Geophysical slices", "Fette geofisiche"), in: ["space.layer@1"], slots: [] },
  { id: "geofisica.trace.point", label: L("Point anomaly on a slice", "Anomalia puntuale su fetta"), in: ["space.tool@1"], slots: [{ name: "g", kind: "geometry", required: true }] },
  { id: "geofisica.trace.line", label: L("Linear anomaly on a slice", "Anomalia lineare su fetta"), in: ["space.tool@1"], slots: [{ name: "g", kind: "geometry", required: true }] },
  { id: "geofisica.trace.area", label: L("Areal anomaly on a slice", "Anomalia areale su fetta"), in: ["space.tool@1"], slots: [{ name: "g", kind: "geometry", required: true }] },
];
const GEO_PANELS = [{ id: "import", label: L("Geophysical stack", "Pila geofisica"), place: "right" }];
const VOCABS = ["anomalie", "metodi", "grandezze"];

// ── «Dove la trovi», pure ───────────────────────────────────────────────────
const X = await load("extensions-where.ts");
let places = X.whereOf({ commands: GEO_COMMANDS, panels: GEO_PANELS, vocabularies: VOCABS, codeActive: false, dataActive: true, lang: "it", pluginId: "geofisica" });
eq(places.map((p) => p.kind), ["door", "panel", "layer", "tool", "section", "vocab", "python"],
   "Geofisica: File ▸ Porta dentro…, Spazio ▸ barra laterale ▸ tab «Geofisica», Spazio ▸ Layer, Spazio ▸ barra degli strumenti, Ispettore, Vocabolari, Python — in the draft's order");
eq(places.map((p) => p.active), [false, false, false, false, false, true, false], "data only: the vocabularies ● now, the rest ○ (with the code)");
const door = places.find((p) => p.kind === "door");
eq([door.names, door.folders, door.commands], [["Pila geofisica"], true, ["geofisica.read"]], "the reader: its name, it reads a folder, its command");
eq(places.find((p) => p.kind === "tool").names, ["Anomalia puntuale su fetta", "Anomalia lineare su fetta", "Anomalia areale su fetta"], "the three Space tools on one line");
eq(places.find((p) => p.kind === "section").names, ["Lettura geofisica"], "the Inspector's section");
eq([places.find((p) => p.kind === "panel").place, places.find((p) => p.kind === "panel").tab], ["sidebar", "geofisica"], "the panel goes in the Space's sidebar, on a tab with the extension's name (MICRO-SEG19; no name given here: its id)");
eq(places.find((p) => p.kind === "vocab").names, VOCABS, "the vocabularies by name");
const py = places.find((p) => p.kind === "python");
eq([py.code, py.more], ['em.plugins.invoke("geofisica", "geofisica.ingest", {"folder": …})', 7],
   "Python: the command no menu carries, its required slot, by the road the console runs (em.plugins.invoke); 7 more");
places = X.whereOf({ commands: GEO_COMMANDS, panels: GEO_PANELS, vocabularies: VOCABS, codeActive: true, dataActive: true, lang: "en" });
ok(places.every((p) => p.active) && places.find((p) => p.kind === "door").names[0] === "Geophysical stack", "the code loaded: every place ●, in English too");
eq(X.codeCounts(GEO_COMMANDS, GEO_PANELS), [{ kind: "commands", n: 8 }, { kind: "door", n: 1 }, { kind: "panel", n: 1 }, { kind: "layer", n: 1 },
   { kind: "tool", n: 3 }, { kind: "section", n: 1 }], "«8 comandi, 1 lettore, 1 pannello, 1 layer dello Spazio, 3 strumenti dello Spazio, 1 sezione dell'Ispettore»");
eq([X.slotKind("door.reader@2"), X.slotKind("menu.file.import@1"), X.slotKind("context.node@1"), X.slotKind("nonsense@1")],
   ["door", "import", "context", null], "the slots of SPEC-plugin §13 → places; an unknown slot: none");
eq(X.whereOf({ commands: [], panels: [], vocabularies: [], codeActive: false, dataActive: false, lang: "it" }), [], "nothing declared: nowhere");
eq([X.repoHost("https://extensions.extendedmatrix.org/index.json"), X.repoHost("file:///Volumes/NAS/em-extensions/index.json"), X.repoHost("/Users/x/repo")],
   ["extensions.extendedmatrix.org", "em-extensions", "repo"], "the selector's name of a repository");

// ── the page ────────────────────────────────────────────────────────────────
const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
const W = await load("extensions-window.ts");
const words = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);
const shown = [];
let loaded = null;
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => false, fileName: () => null, openVocabularies: () => {}, afterChange: () => {},
  loadedFacts: (id) => (id === "geofisica" ? loaded : null), showWhere: (p, id) => shown.push([p.kind, id]), openGuide: () => shown.push(["guide"]) };
const prob = (code, it) => ({ code, level: "warning", en: code, it });
const official = { name: "extendedmatrix", url: "https://extensions.extendedmatrix.org/index.json", enabled: true, check_on_startup: true,
  has_token: false, local: false, official: true, trust_reviews: true, synced_at: "2026-11-21T00:12:00Z", entries: 1, error: null,
  keys: [{ key_id: "269B910A23431722", key: "RW..." }], signed: true, signed_by: "269B910A23431722" };
const lab = { name: "lab", url: "file:///Volumes/NAS/em-extensions/index.json", enabled: false, check_on_startup: false, has_token: true,
  local: true, synced_at: null, entries: null, error: null };
const geoDataOnly = { id: "geofisica", name: "Geofisica", version: "0.1.0", kind: "mixed", source: "extendedmatrix", registered: true,
  origin: "/x/archives/extendedmatrix/geofisica-0.1.0.zip", license: ["SPDX:CC-BY-4.0", "SPDX:GPL-3.0-or-later"],
  data: { status: "installed", version: "0.1.0", versions: ["0.1.0"], iri: "https://w3id.org/extendedmatrix/profile/geofisica", name: "geofisica",
    carried_vocabularies: VOCABS.map((v) => ({ scheme: `https://w3id.org/extendedmatrix/profile/geofisica/vocab/${v}/`, version: "0.1.0" })) },
  code: { status: "not_installed", version: "0.1.0", hosts: ["emstudio", "blender"], permissions: { files: "Reads the chosen geophysical stacks and writes their slice cache" },
    capabilities: ["read-graph", "write-graph"], installable_from: "/x/archives/extendedmatrix/geofisica-0.1.0.zip",
    reason: prob("code_not_installed_choice", "codice non installato: scelta dell'utente (solo i dati)") } };
const avGeo = { repo: "extendedmatrix", id: "geofisica", version: "0.1.0", versions: ["0.1.0"], name: "Geofisica",
  tagline: "Geophysical slices as documents: GPR, ERT and more", maintainer: "Emanuel Demetrescu (CNR-ISPC)", archive_size: 105307,
  sections: { data: {}, code: {} }, installed: "0.1.0", update: false, same_source: true };
let previews = 0;
const st = {
  rows: [geoDataOnly], unavailable: false, error: null, platform: "macos-arm64", dirs: { extensions: "/x/ext" }, overlay: null, missing: [], newer: [],
  repos: [lab, official], online: { on: true, setting: true, env: null }, officialUrl: official.url,
  available: [avGeo], blocked: [], updates: [], syncProblems: {}, otherPlatforms: [], versions: {}, from: "bridge",
  preview: async () => { previews++; return { ok: true, j: { preview: { code: { present: true, commands: GEO_COMMANDS, panels: GEO_PANELS,
    license: "SPDX:GPL-3.0-or-later", hosts: ["emstudio", "blender"] }, data: { present: true, summary: { license: "SPDX:CC-BY-4.0" } } } } }; },
};
let repaints = 0;
let box = W.extensionsContent(document, host, st, () => { repaints++; });
// the head
const sel = box.querySelector("[data-ext='repos']");
ok(sel && sel.textContent.includes("extensions.extendedmatrix.org") && sel.textContent.includes("ext.repoOfficialMark") && sel.textContent.includes("ext.reposMore(n=0)"),
   "the selector: the official one active, «Ufficiale», «+ 0 altri» (the lab's is paused)");
ok(box.querySelector("[data-ext='install-zip']") && box.querySelector("[data-ext-search]") && box.querySelectorAll("[data-ext-show]").length === 3
   && [...box.querySelectorAll("[data-ext-filter]")].map((b) => b.dataset.extFilter).join() === "packages,plugins,mixed",
   "«Installa da disco…», the search, Tutte · Installate · Aggiornamenti, Dati · Codice · Dati + codice");
// the line of Geofisica, data only
let geo = box.querySelector('.ext-list [data-ext-id="geofisica"]');
eq(box.querySelector(".ext-list [data-ext-group]")?.dataset.extGroup, "extendedmatrix", "under «Repository ufficiale»");
ok(box.querySelector(".ext-group-h").textContent.includes("ext.groupOfficial") && box.querySelector(".ext-group-h").textContent.includes("ext.groupSigned(k=269B910A23431722)"),
   "…signed, its key");
eq([geo.querySelector(".ext-name").textContent, geo.querySelector(".ext-ver").textContent, geo.querySelector(".ext-kind").textContent],
   ["Geofisica", "0.1.0", "ext.kind.mixed"], "name, version, «Dati + codice»");
ok(geo.querySelector(".ext-row-sub").textContent === "Geophysical slices as documents: GPR, ERT and more · Emanuel Demetrescu (CNR-ISPC) · 103 kB",
   "what it is, who keeps it, its weight (from the repository's index)");
eq([geo.querySelector("[data-ext-state]").textContent, geo.querySelector("[data-ext-state]").dataset.extState], ["ext.st.dataOnly", "codeOut"],
   "the TRUE state: «Dati installati · codice non installato»");
eq([...geo.querySelectorAll(".ext-row-state button")].map((b) => [b.dataset.ext, b.className]), [["install-code", "primary"]],
   "ONE action on the line, ochre: «Installa il codice»");
eq([geo.dataset.extOpen, geo.querySelector(".ext-row-b").hidden], ["1", false], "a line asking for something opens by itself");
ok(geo.querySelector("[data-ext-where-loading]") && previews === 1, "the code's places not in the register: its archive read once (a preview)");
await new Promise((r) => setTimeout(r, 0));
ok(repaints >= 1, "…then the page drawn again");
box = W.extensionsContent(document, host, st, () => {});
geo = box.querySelector('.ext-list [data-ext-id="geofisica"]');
eq(previews, 1, "…and not read again");
const placesOf = (row) => [...row.querySelectorAll("[data-ext-where-place]")].map((e) => [e.dataset.extWherePlace, e.dataset.extWhereActive]);
eq(placesOf(geo), [["door", "0"], ["panel", "0"], ["layer", "0"], ["tool", "0"], ["section", "0"], ["vocab", "1"], ["python", "0"]],
   "«Dove la trovi»: ○ File ▸ Porta dentro…, ○ Spazio ▸ barra laterale ▸ tab «Geofisica», ○ Spazio ▸ Layer, ○ Spazio ▸ barra degli strumenti, ○ Ispettore, ● Vocabolari, ○ Python");
ok(geo.querySelector(".ext-where-legend")?.textContent === "ext.w.legend", "«○ arriva con il codice»");
eq([...geo.querySelectorAll("[data-ext-show-where]")].map((b) => b.dataset.extShowWhere), ["vocab"], "«Mostrami» only where it is now");
ok(geo.querySelector('[data-ext-where-what="door"]').textContent.includes("Pila geofisica") && geo.querySelector('[data-ext-where-what="door"]').textContent.includes("ext.w.doorFolder"),
   "the reader by name, «legge una cartella»");
ok(geo.querySelector('[data-ext-where-what="python"] code').textContent === 'em.plugins.invoke("geofisica", "geofisica.ingest", {"folder": …})', "the Python line");
const data = geo.querySelector('[data-ext-part="data"]'), code = geo.querySelector('[data-ext-part="code"]');
ok(data.textContent.includes("CC-BY-4.0") && data.textContent.includes("ext.dataEverywhere") && data.textContent.includes("ext.c.vocabs.other(n=3,list=anomalie, metodi, grandezze)"),
   "«Cosa contiene» · Dati: CC BY 4.0, si legge in ogni strumento, 3 vocabolari by name");
ok(code.textContent.includes("GPL-3.0-or-later") && code.textContent.includes("Python") && code.textContent.includes("EMStudio") && code.textContent.includes("Blender")
   && code.querySelector("[data-ext-counts]")?.textContent === "ext.c.commands.other(n=8), ext.c.door.one(n=1), ext.c.panel.one(n=1), ext.c.layer.one(n=1), ext.c.tool.other(n=3), ext.c.section.one(n=1)",
   "· Codice: GPL-3.0, Python, EMStudio and Blender; 8 comandi, 1 lettore, 1 pannello, 1 layer, 3 strumenti, 1 sezione");
ok(geo.querySelector('[data-ext-perm="files"]') && geo.querySelector(".ext-asks").textContent.includes("ext.cap.read-graph") === false
   && geo.querySelector(".ext-asks").textContent.includes("ext.can("), "«Chiede di»: the permission with its reason, what it can do");
ok(geo.querySelector("[data-ext-why]")?.textContent.includes("scelta dell'utente"), "the library's reason, said in the opened line");
// the code installed and loaded: every place ●, «Mostrami» everywhere
const geoFull = { ...geoDataOnly, code: { status: "installed", version: "0.1.0", versions: ["0.1.0"], active: true, verified: false,
  hosts: ["emstudio", "blender"], permissions: geoDataOnly.code.permissions, capabilities: geoDataOnly.code.capabilities } };
loaded = { commands: GEO_COMMANDS, panels: GEO_PANELS };
W.setRowOpen("geofisica", true);
box = W.extensionsContent(document, host, { ...st, rows: [geoFull] }, () => {});
geo = box.querySelector('.ext-list [data-ext-id="geofisica"]');
eq([geo.querySelector("[data-ext-state]").textContent, geo.querySelectorAll(".ext-row-state button").length], ["ext.st.installed", 0],
   "after «Installa il codice»: «Installata», no action on the line");
ok(placesOf(geo).every(([, a]) => a === "1") && !geo.querySelector(".ext-where-legend"), "every place ● now");
const showBtns = [...geo.querySelectorAll("[data-ext-show-where]")];
eq(showBtns.map((b) => b.dataset.extShowWhere), ["door", "panel", "layer", "tool", "section", "vocab", "python"], "«Mostrami» on each");
for (const b of showBtns) b.onclick();
eq(shown, ["door", "panel", "layer", "tool", "section", "vocab", "python"].map((k) => [k, "geofisica"]), "…each asks the page to go to its place");
ok(geo.querySelector('.ext-acts [data-ext="disable"]') && geo.querySelector('.ext-acts [data-ext="remove-code"]') && geo.querySelector('.ext-acts [data-ext="remove-all"]'),
   "the other gestures under the opened line: Disattiva, Rimuovi il codice, Rimuovi");
// closing a line
W.setRowOpen("geofisica", false);
box = W.extensionsContent(document, host, { ...st, rows: [geoFull] }, () => {});
geo = box.querySelector('.ext-list [data-ext-id="geofisica"]');
eq([geo.dataset.extOpen, geo.querySelector(".ext-row-b").hidden, geo.querySelector("[data-ext-toggle]").getAttribute("aria-expanded")], ["0", true, "false"],
   "a triangle closes it (▸)");
W.setRowOpen("geofisica", true);
// an update: the line says it, ONE action «Aggiorna»
box = W.extensionsContent(document, host, { ...st, rows: [geoFull], updates: [{ id: "geofisica", repo: "extendedmatrix", installed: "0.1.0", version: "0.2.0" }] }, () => {});
geo = box.querySelector('.ext-list [data-ext-id="geofisica"]');
eq([geo.querySelector("[data-ext-state]").textContent, [...geo.querySelectorAll(".ext-row-state button")].map((b) => b.dataset.ext)],
   ["ext.st.update(old=0.1.0,v=0.2.0)", ["repo-update"]], "«Aggiornamento 0.1.0 → 0.2.0», «Aggiorna»");
// what to show
W.setExtensionsShow("updates");
box = W.extensionsContent(document, host, st, () => {});
eq(box.querySelectorAll(".ext-list [data-ext-id]").length, 0, "«Aggiornamenti»: none here");
W.setExtensionsShow("all");
W.setExtensionsSearch("radar");
box = W.extensionsContent(document, host, st, () => {});
eq(box.querySelectorAll(".ext-list [data-ext-id]").length, 0, "the search: «radar» is not Geofisica's");
W.setExtensionsSearch("GPR");
box = W.extensionsContent(document, host, st, () => {});
eq(box.querySelectorAll(".ext-list [data-ext-id]").length, 1, "…«GPR» is (its tagline)");
W.setExtensionsSearch("");
// the status line
box = W.extensionsContent(document, host, st, () => {});
const sb = box.querySelector(".ext-status");
ok(sb.textContent.includes("ext.sb.repos.one(n=1)") && sb.textContent.includes("ext.sb.exts.one(n=1)") && sb.textContent.includes("ext.sb.updates.other(n=0)"),
   "«1 repository attivo · 1 estensione · 0 aggiornamenti»");
sb.querySelector("[data-ext='guide']").onclick();
eq(shown.at(-1), ["guide"], "«Come si costruisce un'estensione»");

// ── the repositories' panel (board 2) ──────────────────────────────────────
let panel = box.querySelector("[data-ext-repos]");
ok(panel.hidden, "the panel closed until the selector is pressed");
box.querySelector("[data-ext='repos']").onclick();
box = W.extensionsContent(document, host, st, () => {});
panel = box.querySelector("[data-ext-repos]");
eq([panel.hidden, box.querySelector("[data-ext='repos']").getAttribute("aria-expanded")], [false, "true"], "…open");
eq([...panel.querySelectorAll("[data-ext-repo]")].map((r) => r.dataset.extRepo), ["extendedmatrix", "lab"], "the official always first");
const off = panel.querySelector('[data-ext-repo="extendedmatrix"]'), labRow = panel.querySelector('[data-ext-repo="lab"]');
ok(off.querySelector('[data-ext-repo-enabled="extendedmatrix"]').checked && off.querySelector("[data-ext-repo-official]") && off.querySelector("[data-ext-repo-signed]")
   && off.textContent.includes("ext.repoOfficialRule") && off.querySelector("[data-ext='repo-sync']")?.textContent === "ext.repoCheckNow",
   "the official: ticked, «Ufficiale», «✓ firmato», «sempre primo, sospendibile, non rimovibile», «Controlla ora»");
ok(!off.querySelector("[data-ext='repo-remove']"), "…never «Rimuovi»");
ok(!labRow.querySelector('[data-ext-repo-enabled="lab"]').checked && labRow.querySelector("[data-ext='repo-edit']") && labRow.querySelector("[data-ext='repo-remove']")
   && labRow.querySelector("[data-ext-repo-unsigned]") && labRow.textContent.includes("ext.repoToken"),
   "another: paused (unticked), «Modifica», «Rimuovi», «Non firmato: ogni pacchetto chiede…», «token impostato»");
ok(labRow.querySelector(".ext-repo-more").hidden && labRow.querySelector("[data-ext-repo-startup]"), "its details folded under «Modifica»");
const add = panel.querySelector(".ext-repo-add");
ok(add.querySelector("[data-ext-repo-url-inline]") && add.querySelector("[data-ext-repo-token-inline]").type === "password"
   && add.querySelector("[data-ext='repo-add-inline']").classList.contains("primary"),
   "«Aggiungi un repository»: the address, the token in a password field, «Aggiungi» (ochre)");
// the official not on this machine yet: first, unticked
box = W.extensionsContent(document, host, { ...st, repos: [lab] }, () => {});
const absent = box.querySelector('[data-ext-repos] [data-ext-repo="extendedmatrix"]');
ok(absent && !absent.querySelector("input").checked && absent.textContent.includes("ext.repoOfficialAbsent"), "the official absent: shown first, unticked, tick to use it");
W.setReposOpen(false);

// ── the strings ─────────────────────────────────────────────────────────────
const I = await load("i18n.ts");
const src = readFileSync(new URL("../src/extensions-window.ts", import.meta.url), "utf8") + readFileSync(new URL("../src/extensions-where.ts", import.meta.url), "utf8");
const keys = new Set([...src.matchAll(/\bt\(\s*"(ext\.[A-Za-z.]+)"/g)].map((m) => m[1]));
const plurals = new Set([...src.matchAll(/\btn\(\s*"(ext\.[A-Za-z.]+)"/g)].map((m) => m[1]));
const kinds = ["commands", "door", "import", "export", "panel", "layer", "tool", "section", "column", "statusbar", "menu", "context", "check", "narrative"];
for (const k of kinds) plurals.add(`ext.c.${k}`);
for (const k of ["door", "import", "export", "layer", "tool", "section", "column", "statusbar", "menu", "context", "check", "narrative", "vocab", "python"]) keys.add(`ext.w.${k}`);
for (const k of ["right", "left", "below", "window"]) keys.add(`ext.w.panel.${k}`);
for (const k of ["all", "installed", "updates"]) keys.add(`ext.show.${k}`);
for (const k of ["packages", "plugins", "mixed"]) { keys.add(`ext.filter.${k}`); keys.add(`ext.filter.${k}Hint`); }
for (const p of plurals) { keys.add(`${p}.one`); keys.add(`${p}.other`); }
const lacking = [];
for (const lang of ["en", "it"]) {
  I.setLocale(lang);
  for (const k of keys) if (I.t(k) === k) lacking.push(`${lang}:${k}`);
}
eq(lacking, [], "every key of the page in English and Italian");
I.setLocale("it");
eq([I.t("settings.tab.addons"), I.t("settings.tab.extensions"), I.t("ext.where"), I.t("ext.st.dataOnly"), I.t("ext.w.door")],
   ["Strumenti di terze parti", "Estensioni", "Dove la trovi", "Dati installati · codice non installato", "File ▸ Porta dentro…"], "IT: the draft's words");
I.setLocale("en");
eq([I.t("settings.tab.addons"), I.t("ext.where"), I.t("ext.w.show")], ["Third-party tools", "Where you will find it", "Show me"], "EN: the draft's words");
const i18n = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
const enIt = i18n.slice(i18n.indexOf("const EN: Dict"), i18n.indexOf("const EL: Dict"));
const left = [...enIt.matchAll(/^\s*"([^"]+)": "([^"]*(?:Add-ons|add-ons|Componenti aggiuntivi|componenti aggiuntivi|componente aggiuntivo)[^"]*)",$/gm)]
  .map((m) => m[1]).filter((k) => !/^files\.(bl\.why\.disabled|blNotAsked|blSettingsWhat)$/.test(k));
eq(left, [], "no «Add-ons» / «Componenti aggiuntivi» left for EMStudio's tools (Blender's own add-ons keep their name)");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
ok(/<h3 class="settings-page-title" data-i18n="settings.addons">Third-party tools<\/h3>/.test(html) && !/>Add-ons</.test(html), "the page's title in the markup");
ok(/id="settings-sect-extensions"/.test(html) && /id="set-extensions"/.test(html), "Settings ▸ Extensions: its section");
// MICRO-SEG11 · the Development folder is a row of the scroll itself, with overflow:hidden:
// without this rule a long list open squashed it to its border (2 px, measured in the page)
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
ok(/\.ext-scroll > \* \{ flex-shrink: 0; \}/.test(css), "the rows of the scroll keep their height (the Development folder is not squashed)");

console.log(`check-ext-page: ${checks} checks passed`);
