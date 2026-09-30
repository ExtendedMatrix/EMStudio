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
/** RISORSA-FILE · Vite's `?url` (the Draco decoder's two files), as esbuild
 *  cannot: the import is the file's URL, here its name */
const viteUrl = { name: "vite-url", setup(b) {
  b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: "vite-url" }));
  b.onLoad({ filter: /.*/, namespace: "vite-url" }, (a) => ({
    contents: `export default ${JSON.stringify("url:" + a.path.replace(/\?url$/, "").split("/").pop())};`, loader: "js" }));
} };
const ok = (c, what) => { assert.ok(c, what); checks++; };
const SRC = new URL("../src/", import.meta.url).pathname;
async function bundle(lazy) {
  const r = await esbuild.build({ entryPoints: [`${SRC}embed3d-native.ts`], bundle: true, format: "esm",
    write: false, minify: true, define: { __EM_LAZY_3D__: String(lazy) }, logLevel: "silent", plugins: [viteUrl] });
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

// MICRO-3DTILES · 3DTilesRendererJS the same way, and AFTER three: inline in the
// single file; in the web build fetched as `tiles3d.js` the first time a TILESET
// opens — and that file takes three from `engine3d.js`, never a copy of its own
const TILES = "TilesRenderer: tiles versions at 1.1";
ok(inline.includes(TILES), "inline build · 3DTilesRendererJS is in the file (desktop, file://)");
ok(!lazy.includes(TILES), "web build · 3DTilesRendererJS is NOT in the page");
ok(lazy.includes("tiles3d.js"), "web build · …it asks for tiles3d.js, when a tileset opens");
ok(/build:tiles3d/.test(pkg.scripts["build:web"]) && /EM_ENTRY=tiles3d/.test(pkg.scripts["build:tiles3d"]),
   "build:web · + tiles3d.js");
const tl = await esbuild.build({ entryPoints: [`${SRC}tiles3d-entry.ts`], bundle: true, format: "esm", write: false,
  external: ["three", "three/*"], logLevel: "silent", plugins: [viteUrl] });
const tlText = tl.outputFiles[0].text;
ok(!tlText.includes("THREE.WebGLRenderer:"), "tiles3d.js · no three of its own");
// every name it takes from three (or three's addons) is one engine3d.js exports
const wanted = new Set();
for (const m of tlText.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(three[^"]*)"/g))
  for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/)[0]; if (n) wanted.add(n); }
const three = await import("three");
const entry = readFileSync(`${SRC}engine3d-entry.ts`, "utf8");
const missing = [...wanted].filter((n) => !(n in three) && !new RegExp(`\\b${n}\\b`).test(entry));
ok(wanted.size > 20 && !missing.length, `tiles3d.js · its ${wanted.size} imports are all exported by engine3d.js (missing: ${missing.join(", ") || "none"})`);
ok(/export \* from "three"/.test(entry), "engine3d.js · three's named exports, for tiles3d.js");
const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
ok(/"\.\/engine3d\.js"/.test(vite) && /THREE_EXTERNAL/.test(vite), "vite · tiles3d.js has three external, pointed at ./engine3d.js");
const docker = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
ok(/RUN npm run build:web/.test(docker), "Dockerfile · the served image is the web build");
const tauri = JSON.parse(readFileSync(new URL("../../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"));
ok(tauri.build.beforeBuildCommand.script === "npm run build", "desktop · keeps the single file (three inline, from the disk)");
console.log(`engine3d: ${checks} checks passed`);
