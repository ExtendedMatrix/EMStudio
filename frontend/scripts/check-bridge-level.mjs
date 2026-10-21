// MICRO-INSTALLER-PULSANTE p.3 · executable check of `src/bridge-level.ts`, and
// of a real bridge: the level `/health` says against the one the app wants
// (`BRIDGE_LEVEL_WANTED` in main.ts, `BRIDGE_LEVEL` in tools/em_bridge.py),
// and the words the Log and the notice say.
//
//   node scripts/check-bridge-level.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? "python3";
const load = async (what) => {
  const b = await esbuild.build({ stdin: { contents: what, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const L = await load(`export * from "./bridge-level";`);

let checks = 0;
const fails = [];
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

// the rule
eq(L.bridgeLevelVerdict({ bridge_level: 35 }, 35), { kind: "same", have: 35, wanted: 35 }, "the level wanted: nothing to say");
eq(L.bridgeLevelVerdict({ bridge_level: 33 }, 34), { kind: "older", have: 33, wanted: 34 }, "E.D.'s Windows: 33 instead of 34");
eq(L.bridgeLevelVerdict({ bridge_level: 36 }, 35), { kind: "newer", have: 36, wanted: 35 }, "a newer bridge is different too");
eq(L.bridgeLevelVerdict({}, 35), { kind: "older", have: null, wanted: 35 }, "no level at all: older than DEV30");
eq(L.bridgeLevelVerdict({ bridge_level: "35" }, 35).kind, "older", "a level that is not a number is not believed");
eq(L.levelKey("http://localhost:8765", { bridge_level: 33, pid: 12 }) === L.levelKey("http://localhost:8765", { bridge_level: 33, pid: 12 }), true,
   "one bridge, one key: said once");
eq(L.levelKey("http://localhost:8765", { bridge_level: 33, pid: 12 }) === L.levelKey("http://localhost:8765", { bridge_level: 33, pid: 13 }), false,
   "another process on the same port is said again");

// the words — the MICRO's sentence, in English (the first dictionary) and Italian
const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
const said = (key, vars) => [...i18n.matchAll(new RegExp(`^  "${key.replace(/\./g, "\\.")}": "(.*)",$`, "gm"))]
  .map((m) => m[1].replace(/\{(\w+)\}/g, (_x, k) => vars[k] ?? `{${k}}`));
const [enOther, itOther] = said("bridge.levelOther", { have: "33", wanted: "34" });
eq(itOther, "Il bridge che risponde è di una versione diversa (33 invece di 34): chiudi i processi em-bridge e riapri EMStudio", "the sentence, in Italian");
eq(enOther, "The bridge that answers is of a different version (33 instead of 34): close the em-bridge processes and reopen EMStudio", "…and in English");
eq(said("bridge.levelOtherDev", {}).length >= 2 && said("bridge.levelWhere", {}).length >= 2 && said("bridge.levelNone", {}).length >= 2, true,
   "the browser's sentence, the Log's where and «no level», in both");

// the app and the bridge want the same level
const main = readFileSync(`${SRC}main.ts`, "utf8");
const py = readFileSync(`${TOOLS}em_bridge.py`, "utf8");
const wanted = Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]);
const level = Number(/^BRIDGE_LEVEL = (\d+)/m.exec(py)?.[1]);
eq(wanted, level, "BRIDGE_LEVEL_WANTED (main.ts) is the bridge's BRIDGE_LEVEL");

// a real bridge says its level where the page reads it
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const dir = realpathSync(mkdtempSync(`${tmpdir()}/level-`));
const br = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--s3dgraphy", `${S3D}src`],
  { env: { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/.state`, EM_BRIDGE_PARENT_PID: "" }, stdio: "ignore" });
let h = null;
for (let i = 0; i < 100 && !h; i++) {
  h = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json(), () => null);
  if (!h) await new Promise((r) => setTimeout(r, 150));
}
br.kill();
eq(h?.service, "em_bridge", "the bridge answers /health");
eq(L.bridgeLevelVerdict(h ?? {}, wanted).kind, "same", `this working tree's bridge is the level the app wants (${h?.bridge_level} / ${wanted})`);
eq(typeof h?.pid === "number" && typeof h?.started_at === "string", true, "…and says the pid and since when, for the Log line");

if (fails.length) {
  console.log(`check-bridge-level: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-bridge-level: ${checks} checks OK`);
