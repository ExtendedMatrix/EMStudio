// MICRO-PL25-SLOT-DELLA-FASE-2 (X5) · executable check of the slots of phase 2.
//
//   · the pure pieces (plugin-commands.ts): the sections for a type, the
//     columns of a sheet, the tools and their clicks, the panels; a tool's
//     geometry and a panel's fields fill the slots (never invented); a
//     field's value (a number a number), the rows, one line of the status bar;
//   · the drawers (plugin-surfaces.ts, linkedom): a panel and an Inspector
//     section drawn from data — every word of the plugin TEXT, never markup
//     (SPEC-plugin §14.8); a button gives its field, a number field a number,
//     «Usa la selezione», a value computing / refused / its rows;
//   · the wiring: the window type `plugin-panel` (one, the panel in its
//     state), its surface, the Tabular's columns, the status bar's zone, the
//     Space's register, Tools ▸ Plugins ▸ «Apri …», the level 88 and
//     /py/compute in the table of routes, EN + IT;
//   · a REAL bridge (level 88) with its secret and machine folders in /tmp: a
//     plugin with the five slots installed from disk, its panels and keys in
//     /py/plugins, the values of a section, a column and the status bar in
//     ONE /py/compute (in Italian), a command that writes refused before it
//     runs and one that tries refused by the seam, nothing reaching the page;
//     a tool's command with the geometry: one step, one undo; a panel's
//     button with the fields' values.
//   · MICRO-GEO11 (row G10 of the geophysics plan) · space.layer@1: a layer's
//     kind in /py/plugins, the slot drawn and read only; ONE /py/compute gives
//     the layer in the one shape (frame in doubles, planes, display, a
//     picture outside the plugin's folder dropped), its picture then served by
//     /py/layer-image.
//
// Run: node frontend/scripts/check-plugin-slots.mjs (S3D=… for another s3Dgraphy).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = path.resolve(SRC, "../..");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;

const b = await esbuild.build({
  stdin: { contents: `export { DocumentStore } from "./model"; export { applyDelta } from "./property-source"; export * from "./py-session";
    export * from "./plugin-commands"; export * from "./plugin-surfaces";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

// ── pure pieces ─────────────────────────────────────────────────────────────
const cmd = (over = {}) => { const c = { plugin: "p", id: "c", label: { en: "Do", it: "Fai" }, writes: false, slots: [], in: [], off: [], when: "", accept: [], ...over }; return { ...c, name: `${c.plugin}/${c.id}` }; };
const P = (id, state_, commands, panels = []) => ({ id, version: "0.1.0", name: id.toUpperCase(), source: "disk", state: state_, problems: [], verified: false, package: null, wired: [], commands, panels });
const panel = { plugin: "a", id: "fit", name: "a/fit", label: { en: "Fit", it: "Adattamento" }, place: "right", when: "", fields: [
  { kind: "number", name: "tol", label: { en: "Tolerance", it: "Tolleranza" }, default: 0.5, unit: "mm" },
  { kind: "choice", name: "side", label: { en: "Side" }, options: [{ value: "l", label: { en: "left", it: "sinistra" } }, { value: "r", label: { en: "right" } }] },
  { kind: "node", name: "unit", label: { en: "Unit", it: "Unità" } },
  { kind: "check", name: "all", label: { en: "All", it: "Tutte" } },
  { kind: "value", command: "sum", label: { en: "Now", it: "Adesso" } },
  { kind: "button", command: "go", label: { en: "<img src=x onerror=alert(1)>" } },
] };
const state = new M.PluginState();
state.set({ plugins: [
  P("a", "loaded", [
    cmd({ plugin: "a", id: "sec", in: ["inspector.section@1"], when: "selection:US", buttons: ["go"] }),
    cmd({ plugin: "a", id: "col", in: ["tabular.column@1"], view: "Units" }),
    cmd({ plugin: "a", id: "colE", in: ["tabular.column@1"], view: "Epochs" }),
    cmd({ plugin: "a", id: "st", in: ["statusbar@1"] }),
    cmd({ plugin: "a", id: "axis", in: ["space.tool@1"], primitive: "line", icon: "⟂", writes: true }),
    cmd({ plugin: "a", id: "odd", in: ["space.tool@1"], primitive: "cube" }),
    cmd({ plugin: "a", id: "sum" }), cmd({ plugin: "a", id: "go", writes: true }),
  ], [panel]),
  P("b", "refused", [cmd({ plugin: "b", id: "st", in: ["statusbar@1"] })], [{ ...panel, plugin: "b", name: "b/fit" }]),
] });
eq(M.sectionsFor(state, "US").map((c) => c.id), ["sec"], "a section for its type");
eq(M.sectionsFor(state, "USV"), [], "…not for another");
eq([M.columnsFor(state, "Units").map((c) => c.id), M.columnsFor(state, "Epochs").map((c) => c.id)], [["col"], ["colE"]], "the columns of each sheet");
eq(state.commandsIn("statusbar").map((c) => c.name), ["a/st"], "the status of a refused plugin is not drawn");
eq(M.toolsOf(state).map((c) => c.id), ["axis"], "a tool with a primitive the page cannot lay is not drawn");
eq([M.clicksOf("point"), M.clicksOf("line"), M.clicksOf("polyline"), M.clicksOf("surface"), M.clicksOf("cube")],
  [{ min: 1, max: 1 }, { min: 2, max: 2 }, { min: 2, max: null }, { min: 3, max: null }, null], "the clicks of each primitive (the library's)");
eq(M.panelsOf(state).map((x) => x.name), ["a/fit"], "the panels of the loaded plugins only");
eq([M.panelNamed(state, "a/fit")?.id, M.panelNamed(state, "b/fit"), M.panelNamed(state, null)], ["fit", null, null], "a panel by its name");
eq(M.toolId(cmd({ plugin: "a", id: "axis" })), "plugin:a/axis", "a tool's id in the register");
eq(M.computeKey("tabular.column@1", { plugin: "a", id: "col" }, "Units"), "tabular.column@1|a/col|Units", "the key of a value");
const geo = { primitive: "line", vertices: [[0, 0, 0], [1, 0, 0]], on: "rm1", frame: "model" };
eq(M.fillSlots(cmd({ slots: [{ name: "g", kind: "geometry" }, { name: "id", kind: "id" }, { name: "tol", kind: "number" }, { name: "side", kind: "string" }] }),
  { selection: ["us1"], geometry: geo, fields: { tol: 0.25, side: "" } }), { g: geo, id: "us1", tol: 0.25 },
  "the geometry placed, the fields by name; an empty field fills nothing");
eq(M.fillSlots(cmd({ slots: [{ name: "id", kind: "id" }] }), { selection: ["us1"], fields: { id: "us9" } }), { id: "us9" }, "a panel's node field before the selection");
eq(M.fillSlots(cmd({ slots: [{ name: "g", kind: "geometry" }] }), { selection: [] }), {}, "no geometry: the slot stays missing (the contract asks)");
eq([M.fieldValue({ kind: "number" }, "0,5"), M.fieldValue({ kind: "number" }, "x"), M.fieldValue({ kind: "number" }, ""), M.fieldValue({ kind: "text" }, ""), M.fieldValue({ kind: "check" }, 1)],
  [0.5, undefined, undefined, undefined, true], "a field's value as the slot gets it");
eq([M.fieldStart(panel.fields[0]), M.fieldStart(panel.fields[1]), M.fieldStart(panel.fields[3]), M.fieldStart(panel.fields[2])], [0.5, "l", false, ""], "a field's start");
eq(M.rowsOf([{ label: "a", value: "1" }, "x"]), [{ label: "a", value: "1" }, { label: "", value: "x" }], "rows");
eq([M.statusLine("a\n  b"), M.statusLine("x".repeat(100)).length], ["a b", 80], "one line of the status bar");

// MICRO-GEO09 (row G8 of the geophysics plan) · door.reader@2: a folder, a claim, a panel
{
  const rs = new M.PluginState();
  rs.set({ plugins: [
    P("g", "loaded", [
      cmd({ plugin: "g", id: "read", in: ["door.reader@2"], accept: [".asc"], claims: [".tif", ".jpg"], folders: true, panel: "g/imp",
            writes: true, slots: [{ name: "folder", kind: "path" }, { name: "method", kind: "string", required: false }] }),
      cmd({ plugin: "g", id: "old", in: ["door.reader@1"], accept: [".units"] }),
    ]),
    P("h", "refused", [cmd({ plugin: "h", id: "read", in: ["door.reader@2"], folders: true, claims: [".tif"] })]),
  ] });
  eq(rs.readersFor("/data/Sector 1", true).map((c) => c.name), ["g/read"], "a folder: the readers of folders of the loaded plugins");
  eq(rs.readersFor("/data/Sector 1").map((c) => c.name), [], "…not as a file");
  eq(rs.readersFor("/x/100-150cm.ASC").map((c) => c.name), ["g/read"], "an accepted file is taken");
  eq(rs.readersFor("/x/mean_v2.TIF").map((c) => c.name), [], "a claimed file is NOT taken (the page reads it)…");
  eq(rs.claimsFor("C:\\x\\mean_v2.TIF").map((c) => c.name), ["g/read"], "…it is offered as «Leggi come» (a Windows path too)");
  eq([rs.claimsFor("/x/a.asc"), rs.claimsFor("/x/list.units")], [[], []], "an accepted file is no claim; a reader of @1 claims nothing");
  eq(rs.readersFor("/x/list.UNITS").map((c) => c.id), ["old"], "door.reader@1 unchanged");
  eq([M.pathSlotOf(rs.readersFor("/d", true)[0]), M.pathSlotOf(cmd())], ["folder", "path"], "the slot a reader's path fills");
  eq(M.fillSlots(rs.readersFor("/d", true)[0], { selection: [], path: "/d" }), { folder: "/d" }, "…filled with the folder");
  eq(M.fillSlots(cmd({ slots: [{ name: "folder", kind: "path" }] }), { selection: [], fields: { folder: "/from/the/door" } }),
    { folder: "/from/the/door" }, "a panel's field filled by the door fills the reader's path slot");
}

// ── the drawers (linkedom) ──────────────────────────────────────────────────
const tt = (k, v) => `${k}${v ? JSON.stringify(v) : ""}`;
const host = document.createElement("div");
const said = { fields: [], buttons: [] };
const pctx = (over = {}) => ({ lang: "it", t: tt, fields: { tol: 0.75 }, onField: (n, v) => said.fields.push([n, v]),
  valueOf: () => ({ ok: true, value: [{ label: "Punti", value: "12" }] }), onButton: (f) => said.buttons.push(f.command),
  command: (id) => cmd({ plugin: "a", id, label: { en: id, it: id } }), selection: () => ({ id: "us1", name: "US1" }), nodeName: (id) => id.toUpperCase(),
  mark: "non verificato", provenance: "Plugin a 0.1.0 · da disco", enabled: true, ...over });
M.renderPanelInto(host, panel, pctx());
eq(host.querySelector(".plg-panel-head b")?.textContent, "Adattamento", "the panel's name in the page's language");
eq(host.querySelector(".plg-badge")?.textContent, "non verificato", "…with its mark");
eq(host.querySelector('[data-field="tol"] input')?.value, "0.75", "a number field shows what the person wrote");
eq(host.querySelector('[data-field="tol"] .plg-unit')?.textContent, "mm", "…and its unit");
eq([...host.querySelectorAll('[data-field="side"] option')].map((o) => o.textContent), ["sinistra", "right"], "a choice's options, in Italian where there is Italian");
eq(host.querySelector('[data-command="sum"] dd')?.textContent, "12", "a value's rows");
const btn = host.querySelector('[data-command="go"] button');
eq([btn?.textContent, host.querySelectorAll("img").length], ["<img src=x onerror=alert(1)>", 0], "a plugin's label is TEXT: no markup reaches the page");
btn?.click();
eq(said.buttons, ["go"], "a button gives its command");
const inp = host.querySelector('[data-field="tol"] input');
inp.value = "1,5";
inp.dispatchEvent(new document.defaultView.Event("change"));
eq(said.fields.at(-1), ["tol", 1.5], "a number field gives a number");
host.querySelector('[data-field="unit"] .plg-use')?.click();
eq(said.fields.at(-1), ["unit", "us1"], "«Usa la selezione» takes the selected node");
M.renderPanelInto(host, panel, pctx({ enabled: false, disabledWhy: "no", valueOf: () => ({}) }));
ok(host.querySelector('[data-command="go"] button')?.disabled && host.querySelector(".plg-why")?.textContent === "no", "not enabled: the buttons off, why said");
eq(host.querySelector('[data-command="sum"] .plg-pending')?.textContent, "plg.computing", "a value being computed");
M.renderPanelInto(host, null, pctx(), "x/gone");
eq(host.textContent, 'plg.panelGone{"panel":"x/gone"}', "a panel whose plugin is gone says so");
const insp = document.createElement("div");
M.renderSectionInto(insp, cmd({ plugin: "a", id: "sec", label: { en: "Face", it: "Volto" } }), { lang: "it", t: tt,
  value: { ok: false, why: "rotto" }, buttons: [cmd({ plugin: "a", id: "go", writes: true, label: { it: "Vai" } })],
  onButton: (c) => said.buttons.push(c.id), pluginName: "A", mark: "", provenance: "", readOnly: true });
eq([insp.querySelector("h3.insp-sect")?.firstChild?.textContent, insp.querySelector(".plg-why")?.textContent], ["Volto", "rotto"], "a section: h3.insp-sect, its reason when not computed");
ok(insp.querySelector('[data-run="plugin:a/go"]')?.disabled, "a writing button off in a read-only room");
{
  const none = document.createElement("div");
  const sctx = (value, buttons = []) => ({ lang: "en", t: tt, value, buttons, onButton: () => {}, pluginName: "A", mark: "", provenance: "", readOnly: false });
  M.renderSectionInto(none, cmd({ plugin: "a", id: "sec" }), sctx({ ok: true, value: [] }));
  eq(none.childNodes.length, 0, "a section with no rows and no buttons is not drawn (nothing to say of this node)");
  M.renderSectionInto(none, cmd({ plugin: "a", id: "sec" }), sctx({}));
  ok(none.querySelector(".plg-pending"), "…while it is computed, it is (it may have rows)");
  const withBtn = document.createElement("div");
  M.renderSectionInto(withBtn, cmd({ plugin: "a", id: "sec" }), sctx({ ok: true, value: [] }, [cmd({ plugin: "a", id: "go", label: { en: "Go" } })]));
  ok(withBtn.querySelector(".plg-empty") && withBtn.querySelector('[data-run="plugin:a/go"]'), "…with a button, drawn and «nothing to show»");
}

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py"), ws = read("frontend/src/workspace.ts");
const shell = read("frontend/src/shell/types.ts"), emdata = read("frontend/src/emdata.ts"), html = read("frontend/index.html"), i18n = read("frontend/src/i18n.ts");
const surfaces = read("frontend/src/plugin-surfaces.ts");
ok(/wordsOf\(out, getLocale\(\)\.startsWith\("it"\) \? "it" : "en"\)/.test(main), "a plugin's refusal in the page's language (its EN and IT: T-6 of PL20)");
{
  const lv = [Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]), Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]), Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
  ok(lv[0] >= 88 && lv.every((x) => x === lv[0]), "level 88 or later, the same in the page, the bridge, em_py");
}
ok(/"\/py\/compute"\)\}/.test(bridge) && /"\/py\/compute"\)/.test(emPy), "/py/compute in the table of routes");
ok(/\| "plugin-panel";/.test(ws) && /"plugin-panel": \{ icon: windowIcon\("plugin-panel"\)/.test(ws), "ONE window type for every panel");
ok(/id: "plugin-panel"/.test(shell) && /renderPluginPanelInto/.test(shell), "…a surface of its own (born converted)");
ok(!/TRANSFORM_TYPES[^;]*"plugin-panel"/s.test(main.slice(main.indexOf("const TRANSFORM_TYPES"), main.indexOf("const TRANSFORM_TYPES") + 800)), "not a transform target: a panel is opened from its plugin");
ok(/renderPluginSections\(host, owning, selectedId\)/.test(main), "inspector.section@1 in the Inspector");
ok(/setPluginColumnsProvider\(/.test(main) && /plugCols\.map/.test(emdata), "tabular.column@1 in the Tabular");
ok(/id="sb-plugins"/.test(html) && /renderPluginStatus/.test(main), "statusbar@1: a zone of text");
ok(/syncPluginTools\(\)/.test(main) && /vwFinishPlugin/.test(main) && /o !== "core" && !o\.startsWith\("plugin:"\)/.test(main), "space.tool@1 in the Space's register (a package's sync keeps them)");
ok(/openPluginPanel\(panel\)/.test(main) && /plg\.openPanel/.test(main), "panel@1 opened from Tools ▸ Plugins");
ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(surfaces), "the drawers never write markup");
// MICRO-GEO09 · door.reader@2 in «Porta dentro…»
{
  const menuT = read("frontend/src/menu-table.ts");
  ok(/cmd\("doorFolder", "door\.folderMenu", "btn-porta-dentro-cartella"/.test(menuT) && /btn-porta-dentro-cartella"\)\?\.addEventListener\("click", \(\) => \{ void doorFolderFromMenu\(\)/.test(main),
    "File ▸ Porta dentro una cartella…");
  ok(/plugins\(\)\.readersFor\(f\.path!, true\)/.test(main) && /chooseReader\(/.test(main), "a folder goes to a reader of folders (several: the person chooses)");
  ok(/plugins\(\)\.claimsFor\(r\.f\.path\)/.test(main) && /dataset\.doorReadAs = r\.f\.name/.test(main) && /t\("door\.readAsHost"\)/.test(main),
    "a claimed file: «Leggi come», the page's own reading first");
  ok(/rows\.every\(\(r\) => byPluginOf\(r\.f\)\)/.test(main), "files all read by plugins: no date asked");
  ok(/const panel = c\.panel \? panelNamed\(plugins\(\), c\.panel\) : null;/.test(main) && /\[pathSlotOf\(c\)\]: path/.test(main) && /openPluginPanel\(panel\);/.test(main),
    "a reader with a panel: the panel opens with the path in its field");
  ok(/!typedPath\(x\.name\)/.test(main), "a path already in a panel's field asks no file picker");
  for (const k of ["door.folderMenu", "door.folderMenuHint", "door.folderPickTitle", "door.noFolderReader", "door.pickReader", "door.readerPanel", "door.readAs", "door.readAsHost"])
    ok((i18n.match(new RegExp(`"${k.replace(".", "\\.")}":`, "g")) ?? []).length === 2, `${k}: EN + IT`);
}
const keys = [...new Set([...main.matchAll(/t\("(plg\.[A-Za-z]+)"/g), ...surfaces.matchAll(/t\("(plg\.[A-Za-z]+)"/g)].map((m) => m[1]))];
for (const k of ["plg.openPanel", "plg.panelGone", "plg.toolTitle", "plg.useSelection", "plg.columnTitle"]) ok(keys.includes(k), `${k} used`);
for (const k of [...keys, "win.pluginPanel"]) ok((i18n.match(new RegExp(`"${k.replace(".", "\\.")}":`, "g")) ?? []).length >= 2, `${k}: EN + IT`);

// ── a real bridge ───────────────────────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (!fs.existsSync(py)) {
  console.log(`check-plugin-slots: ${checks} checks passed (no s3Dgraphy venv at ${py}: the live part skipped)`);
  process.exit(0);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-slots-check-"));
const TOKEN = "check-plugin-slots-secret-0123456789ab";
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"),
  S3DGRAPHY_PLUGINS_DATA_DIR: path.join(dir, "plugins-data"),
  EM_VOCABULARIES_DIR: path.join(dir, "vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "state"), EM_PY_ANSWER_S: "10" };

const src = path.join(dir, "src", "plug-slots");
fs.mkdirSync(path.join(src, "plug_slots_mod"), { recursive: true });
fs.writeFileSync(path.join(src, "LICENSE"), "EUPL-1.2 (check)\n");
fs.writeFileSync(path.join(src, "plug_slots_mod", "__init__.py"), `
from s3dgraphy import em

def summary(slots):
    n = em.graph.node(slots["id"])
    return [{"label": {"en": "Name", "it": "Nome"}, "value": n.name}, {"label": "Descr.", "value": n.description or "—"}]

def length(slots):
    return {i: len(em.graph.node(i).name) for i in slots["ids"]}

def status(slots):
    n = len(list(em.graph.nodes(type="US")))
    return {"en": f"{n} units", "it": f"{n} unità"}

def sneaky(slots):
    with em.write("Di nascosto") as tx:
        tx.update("us1", "description", "x")

def mark(slots):
    with em.write("Segnato") as tx:
        tx.update(slots["id"], "description", "tolleranza " + str(slots.get("tol")))
    return slots["id"]

def axis(slots):
    (x0, y0, z0), (x1, y1, z1) = slots["g"]["vertices"]
    d = ((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2) ** 0.5
    with em.write("Asse posato") as tx:
        tx.update(slots["id"], "description", f"asse {d:.1f} su {slots['g']['on']}")
    return round(d, 2)

def stacks(slots):
    import os
    from s3dgraphy.em import plugins as PL
    folder = os.path.join(str(PL.plugins_data_dir()), "plug-slots", "cache", "k")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "s0.png"), "wb") as fh:
        fh.write(b"\\x89PNG\\r\\n\\x1a\\nlayer")
    return {"kind": "raster_stack", "id": "ert:b", "name": {"en": "ERT stack b", "it": "Pila ERT b"},
            "frame": {"epsg": 25830, "origin": [701806.741, 4234824.081], "rotation": 0},
            "items": [{"id": "d1", "label": {"en": "slice 1", "it": "fetta 1"}, "image": "cache/k/s0.png",
                       "extent": [0, 0, 92, 50], "depth_top": 1.0, "depth_bottom": 1.5},
                      {"id": "bad", "image": "/etc/passwd", "extent": [0, 0, 1, 1]}]}

def setup(ctx):
    for name, fn in (("summary", summary), ("length", length), ("status", status), ("sneaky", sneaky), ("mark", mark), ("axis", axis),
                     ("stacks", stacks)):
        ctx.command(name, fn)

plugin = type("Plugin", (), {"setup": staticmethod(setup)})
`);
fs.writeFileSync(path.join(src, "em-extension.toml"), `schema_version = "1.0.0"
id = "plug-slots"
version = "0.1.0"
name = "Plugin degli slot (PROVA)"
tagline = "A plugin of check-plugin-slots"
maintainer = "check-plugin-slots"
license = ["SPDX:EUPL-1.2"]
em_api_min = "1.0"
type = "plugin"

[code]
entry = "plug_slots_mod:plugin"
hosts = ["emstudio"]
  [code.permissions]
  files = "Non legge file"
  [code.descriptor]
  host = "emstudio-side"
  transport = ["direct"]
  capabilities = ["read-graph", "write-graph"]
  provenance = "derivation"
  [[code.commands]]
  id = "summary"
  label = { it = "Riassunto", en = "Summary" }
  in = ["inspector.section@1"]
  when = "selection:US"
  slots = [{ name = "id", kind = "id" }]
  buttons = ["mark"]
  [[code.commands]]
  id = "length"
  label = { it = "Lunghezza", en = "Length" }
  in = ["tabular.column@1"]
  view = "Units"
  slots = [{ name = "ids", kind = "ids" }]
  [[code.commands]]
  id = "status"
  label = "Unità"
  in = ["statusbar@1"]
  [[code.commands]]
  id = "sneaky"
  label = "Sneaky"
  in = ["statusbar@1"]
  [[code.commands]]
  id = "mark"
  label = { it = "Segna", en = "Mark" }
  writes = true
  slots = [{ name = "id", kind = "id" }, { name = "tol", kind = "number", required = false }]
  in = ["context.node@1"]
  [[code.commands]]
  id = "axis"
  label = { it = "Asse", en = "Axis" }
  in = ["space.tool@1"]
  primitive = "line"
  icon = "⟂"
  slots = [{ name = "g", kind = "geometry" }, { name = "id", kind = "id" }]
  [[code.commands]]
  id = "stacks"
  label = { it = "Pile", en = "Stacks" }
  in = ["space.layer@1"]
  layer = "raster_stack"
  [[code.commands]]
  id = "stack"
  label = { it = "Pila", en = "Stack" }
  in = ["door.reader@2"]
  claims = [".tif"]
  folders = true
  panel = "fit"
  writes = true
  slots = [{ name = "folder", kind = "path" }]
  [[code.panels]]
  id = "fit"
  label = { it = "Adattamento", en = "Fit" }
  place = "right"
    [[code.panels.fields]]
    kind = "number"
    name = "tol"
    default = 0.5
    [[code.panels.fields]]
    kind = "value"
    command = "summary"
    [[code.panels.fields]]
    kind = "button"
    command = "mark"
`);

const port = await freePort();
const child = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(port), "--s3dgraphy", path.join(S3D, "src")],
  { env: { ...process.env, ...machine, EM_BRIDGE_TOKEN: TOKEN }, stdio: ["ignore", "ignore", "pipe"] });
let err = "";
child.stderr.on("data", (d) => { err += d; });
const B = `http://127.0.0.1:${port}`;
const post = async (route, body, auth = true) => {
  const r = await fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
try {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(`${B}/health`); if (r.ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  eq((await post("/py/compute", {}, false)).status, 401, "/py/compute is behind the secret");
  const inst = await post("/extensions/install", { path: src, trust: true });
  eq([inst.status, inst.j.ok !== false], [200, true], "the plugin of the five slots installed from disk");
  const pl = (await post("/py/plugins", { lang: "it" })).j;
  const me = pl.plugins.find((p) => p.id === "plug-slots");
  eq(me?.state, "loaded", `loaded in the bridge ${JSON.stringify(me?.problems)}`);
  eq(me.panels.map((x) => [x.name, x.place, x.fields.map((f) => f.kind)]), [["plug-slots/fit", "right", ["number", "value", "button"]]], "/py/plugins carries the panel");
  const c = Object.fromEntries(me.commands.map((x) => [x.id, x]));
  eq([c.axis.primitive, c.axis.icon, c.summary.buttons, c.length.view, c.summary.writes, c.status.writes, c.axis.writes],
     ["line", "⟂", ["mark"], "Units", false, false, true], "…and each command's keys; a section, a column, a status only read");
  eq([c.stack.in, c.stack.folders, c.stack.claims, c.stack.panel, c.stack.accept], [["door.reader@2"], true, [".tif"], "plug-slots/fit", []],
    "MICRO-GEO09 · a reader of door.reader@2: its folders, claims and panel in /py/plugins");
  eq(pl.slots?.phase1?.["door.reader"], 2, "…the slot at version 2");
  eq(pl.slots?.drawn2, { "inspector.section": 1, "tabular.column": 1, statusbar: 1, "space.tool": 1, panel: 1, "space.layer": 1 },
     "the slots of phase 2 drawn (MICRO-GEO11: space.layer too)");
  eq([c.stacks.in, c.stacks.layer, c.stacks.writes, "layer" in c.summary], [["space.layer@1"], "raster_stack", false, false],
     "MICRO-GEO11 · a layer of the Space: its kind in /py/plugins, read only; the other commands say no layer");

  const state2 = new M.PluginState();
  state2.set(pl);
  const st = new M.DocumentStore({ header: { format: "em.json", schema_version: 2, version: "1.0" },
    graph: { graph_id: "pl25", nodes: [{ id: "us1", node_type: "US", name: "US1", description: "una" }, { id: "us22", node_type: "US", name: "US22", description: "" }], edges: [] } });
  const page = {
    base: async () => B, token: async () => TOKEN, doc: () => JSON.parse(st.toJSON()), revision: () => st.rev,
    author: () => "0000-0002-1825-0097", lang: () => "it", declared: () => [], selection: () => ["us22"],
    applyStep: (step) => { M.applyDelta(st, step.delta, { renameCopies: true }); return st.rev; },
    log: () => {}, t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}`,
    host: { select() {}, view: () => true, notify() {}, command: () => true, camera: () => null, setCamera() {}, frame() {}, pick: async () => null },
  };
  const s = new M.PySession(page);
  await s.open();
  const sec = M.sectionsFor(state2, "US")[0], col = M.columnsFor(state2, "Units")[0], stat = state2.commandsIn("statusbar");
  const items = [
    { key: M.computeKey("inspector.section@1", sec, "us22"), plugin: sec.plugin, command: sec.id, slot: "inspector.section@1", slots: M.fillSlots(sec, { selection: ["us22"] }) },
    { key: M.computeKey("tabular.column@1", col, "Units"), plugin: col.plugin, command: col.id, slot: "tabular.column@1", slots: M.fillSlots(col, { selection: ["us1", "us22"] }) },
    ...stat.map((x) => ({ key: M.computeKey("statusbar@1", x, ""), plugin: x.plugin, command: x.id, slot: "statusbar@1", slots: {} })),
    { key: "w", plugin: "plug-slots", command: "mark", slot: "statusbar@1", slots: { id: "us1" } },
  ];
  const rev0 = st.rev;
  const vals = Object.fromEntries((await s.compute(items)).map((v) => [v.key, v]));
  eq(vals[items[0].key].value, [{ label: "Nome", value: "US22" }, { label: "Descr.", value: "—" }], "ONE /py/compute: the section's rows, in Italian");
  eq(vals[items[1].key].value, { us1: "3", us22: "4" }, "…the column's cells");
  eq(vals["statusbar@1|plug-slots/status|"].value, "2 unità", "…the status bar's line");
  ok(!vals["statusbar@1|plug-slots/sneaky|"].ok, "a value that tries to write: refused by the seam");
  ok(!vals.w.ok && /scrive/.test(vals.w.messages.it), "a command that writes: refused before it runs, said in Italian");
  eq([st.rev, st.node("us1")?.description], [rev0, "una"], "nothing reached the page");

  // MICRO-GEO11 · space.layer@1: ONE /py/compute, the layer in its shape; its picture by /py/layer-image
  const lay = (await s.compute([{ key: "L", plugin: "plug-slots", command: "stacks", slot: "space.layer@1", slots: {} }]))[0];
  ok(lay.ok, `a layer computed: ${JSON.stringify(lay)}`);
  const L = lay.value[0];
  eq([L.kind, L.id, L.name, L.frame, L.ground, L.display, L.opacity],
     ["raster_stack", "ert:b", "Pila ERT b", { epsg: 25830, origin: [701806.741, 4234824.081], rotation: 0, local: true },
      { mode: "flat", z: 0, surface: null }, { mode: "all", index: 0 }, 1],
     "…in the one shape, in Italian, the origin in doubles to the millimetre");
  eq(L.items.map((i) => [i.id, i.label, i.image, i.extent, i.orientation, i.depth_top, i.depth_bottom]),
     [["d1", "fetta 1", "cache/k/s0.png", [0, 0, 92, 50], "horizontal", 1, 1.5]], "…a plane naming a picture outside the plugin's folder dropped");
  const pic = await fetch(`${B}/py/layer-image?plugin=plug-slots&path=${encodeURIComponent(L.items[0].image)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  eq([pic.status, Buffer.from(await pic.arrayBuffer()).toString("latin1").slice(-5)], [200, "layer"], "…its picture served by /py/layer-image");

  // space.tool@1: the geometry placed → the command, one step, one undo
  const depth0 = st.undoStack.length;
  const tool = M.toolsOf(state2)[0];
  let out = await s.invoke(tool.plugin, tool.id, M.fillSlots(tool, { selection: ["us22"], geometry: { primitive: "line", vertices: [[0, 0, 0], [0, 3, 4]], on: "rm1", frame: "model" } }));
  eq([out.status, out.steps.length, st.undoStack.length - depth0, out.result?.value, st.node("us22")?.description], ["done", 1, 1, 5, "asse 5.0 su rm1"], "a tool: its command with the geometry, one undo step");
  const dtc = st.doc.graph.nodes.find((n) => n.node_type === "dtc_process");
  eq([dtc?.data?.parameters?.plugin, dtc?.data?.parameters?.command], ["plug-slots", "axis"], "…the act's DTC names the plugin and the tool");
  st.undo();
  eq(st.node("us22")?.description, "", "ONE undo takes it away");
  out = await s.invoke(tool.plugin, tool.id, M.fillSlots(tool, { selection: ["us22"] }));
  ok(out.status === "refused" && /Mi manca g/.test(out.error), "nothing placed: «Mi manca g»");

  // panel@1: a button with the fields' values
  const p = M.panelNamed(state2, "plug-slots/fit");
  const mark = state2.plugin("plug-slots").commands.find((x) => x.id === p.fields[2].command);
  out = await s.invoke(mark.plugin, mark.id, M.fillSlots(mark, { selection: ["us22"], fields: { tol: 0.25 } }));
  eq([out.status, st.node("us22")?.description], ["done", "tolleranza 0.25"], "a panel's button: the fields fill the slots of their name");
  await s.close();
} finally {
  child.kill();
}
if (err && /Traceback/.test(err)) console.error(err.slice(-2000));
console.log(`check-plugin-slots: ${checks} checks passed`);
