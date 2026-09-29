// RIFINITURE · the 3D engine is in the editor only where it costs nothing.
//
//   node scripts/check-engine3d.mjs
//
// The desktop and file:// editor is ONE file and keeps three.js inline (it reads
// from the disk). The WEB build (`npm run build:web`, the Docker image) defines
// `__EM_LAZY_3D__` and must leave three out of the page, fetching `engine3d.js`
// beside it the first time a model opens. Measured in RIFINITURE parte 7: three
// inline cost +800 kB raw to every first load (+1.3 s at 5 Mbit/s).
//
// Bundled here with esbuild, twice, the way Vite would: dynamic imports folded
// into the one output, as the single-file build does.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const SRC = new URL("../src/", import.meta.url).pathname;
async function bundle(lazy) {
  const r = await esbuild.build({ entryPoints: [`${SRC}embed3d-native.ts`], bundle: true, format: "esm",
    write: false, minify: true, define: { __EM_LAZY_3D__: String(lazy) }, logLevel: "silent" });
  return r.outputFiles[0].text;
}
const inline = await bundle(false);
const lazy = await bundle(true);
// three's own messages: the library speaks them, the editor never writes them
const LIB = ["THREE.WebGLRenderer:", "THREE.GLTFLoader:"];
ok(LIB.every((k) => inline.includes(k)), "inline build · three.js is in the file (desktop, file://)");
ok(LIB.every((k) => !lazy.includes(k)), "web build · three.js is NOT in the page");
ok(lazy.includes("engine3d.js"), "web build · …it asks for engine3d.js instead");
ok(lazy.length < inline.length / 3, `web build · the module is a fraction of the inline one (${lazy.length} vs ${inline.length} bytes)`);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
ok(/EM_LAZY_3D=1/.test(pkg.scripts["build:web"]) && /build:engine3d/.test(pkg.scripts["build:web"]),
   "build:web · lazy editor + engine3d.js + reader");
const docker = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
ok(/RUN npm run build:web/.test(docker), "Dockerfile · the served image is the web build");
const tauri = JSON.parse(readFileSync(new URL("../../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"));
ok(tauri.build.beforeBuildCommand.script === "npm run build", "desktop · keeps the single file (three inline, from the disk)");
console.log(`engine3d: ${checks} checks passed`);
