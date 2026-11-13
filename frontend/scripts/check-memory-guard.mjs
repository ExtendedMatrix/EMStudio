// MICRO-MEMORIA-SESSIONE p.1 · executable check of `src/memory-guard.ts` — the
// estimate of what a model costs the page, the ceiling of the scene, the room
// left (the Preferences' ceiling or the machine's free memory, the tighter), and
// the version proposed when a model does not fit. The scene's own gate (the
// strip, «Carica comunque», the version proposed) is driven in the browser by
// `check-memoria-sessione.mjs`.
//
//   node scripts/check-memory-guard.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./memory-guard";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const G = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepStrictEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const MB = 1024 * 1024;

// the estimate: the largest of three readings
eq(G.estimateMb({}), null, "nothing known: no estimate (the guard lets it pass, the threshold's HEAD speaks)");
eq(G.estimateMb({ bytes: 200 * MB }), 600, "a whole glb: three times its size (MICRO-3DTILES's measure)");
// Templu Mare SB, 30 Oct: lod0-aton-heriverse 3.03 M triangles / 223 MB; lod1-realtime-web 1.53 M / 23 MB (Draco)
eq(G.estimateMb({ bytes: 223 * MB, tris: 3.03e6 }), 669, "lod0-aton-heriverse: 223 MB → ~669 MB (the file's reading wins)");
eq(G.estimateMb({ bytes: 23 * MB, tris: 1.53e6 }), 94, "lod1-realtime-web: Draco makes the file small, not the triangles (~94 MB, not 69)");
eq(G.estimateMb({ tris: 1e6, textureSide: 4096 }), 232, "a 4K texture: ~171 MB (page + GPU, with its mipmaps) + 1 M triangles ~61 MB");
eq(G.estimateMb({ points: 10e6 }), 439, "a cloud: 46 B a point (10 M → ~440 MB, measured 458)");
eq(G.estimateMb({ bytes: -1, tris: NaN }), null, "nonsense is not a weight");

// the ceiling's default: a quarter of the machine, between 1 and 4 GB
eq([G.sceneMemoryDefaultMB(8192), G.sceneMemoryDefaultMB(65536), G.sceneMemoryDefaultMB(2048), G.sceneMemoryDefaultMB(null)],
   [2048, 4096, 1024, 2048], "8 GB → 2 GB, 64 GB → 4 GB (capped), 2 GB → 1 GB (floor), unknown → as 8 GB");

// the room: the tighter of the two
eq(G.roomFor(0, 600, 2048, null), { ok: true, room: 2048, by: "ceiling" }, "nothing drawn, no bridge: the ceiling alone");
eq(G.roomFor(1800, 600, 2048, null), { ok: false, room: 248, by: "ceiling" }, "1.8 GB drawn: 600 MB more does not fit under 2 GB");
eq(G.roomFor(0, 600, 4096, 900), { ok: false, room: 388, by: "machine" }, "the machine has 900 MB free: 512 kept for it, 388 for the page");
eq(G.roomFor(0, 300, 4096, 900).ok, true, "…and 300 MB fit");
eq(G.roomFor(3000, 100, 2048, 20000), { ok: false, room: 0, by: "ceiling" }, "over the ceiling already: no room (never negative)");

// the version proposed: the heaviest that fits
const vs = [{ id: "lod0", est: 669 }, { id: "web", est: 94 }, { id: "mobile", est: 30 }, { id: "unknown", est: null }];
eq(G.lighterThatFits(vs, 248)?.id, "web", "248 MB left: the web version, the heaviest that fits");
eq(G.lighterThatFits(vs, 40)?.id, "mobile", "40 MB left: the mobile one");
eq(G.lighterThatFits(vs, 10), null, "10 MB left: none fits — only «Carica comunque»");
eq([G.mbSay(669), G.mbSay(2048), G.mbSay(1536)], ["669 MB", "2.0 GB", "1.5 GB"], "the sizes said");

// the scene asks the guard before every fetch: the three doors (a model, a flow, a tileset)
const scene = readFileSync(`${SRC}scene3d.ts`, "utf8");
eq((scene.match(/memGate\(key, item,/g) ?? []).length, 3, "scene3d: the guard before a model's file, a flow's first version and a new tileset");
eq(/memoryMB \?\? opts\.tilesMemoryMB/.test(scene), true, "a tileset's ceiling is what is left of the scene's, when smaller");
const main = readFileSync(`${SRC}main.ts`, "utf8");
// MICRO-NARRATIVE-MODULI · …and a story's 3D scene (the stage of a module) mounts it too
eq((main.match(/memory: sceneMemory, onMemoryGate,/g) ?? []).length, 3, "main: the Space, the Viewer and a story's scene all mount the guard");
eq(/\/machine\/memory/.test(readFileSync(new URL("../../tools/em_bridge.py", import.meta.url), "utf8")), true, "the bridge answers /machine/memory");

// MICRO-PIU-FONTI · every source open is counted: a document ~4× its JSON, an
// undo step one snapshot (2 B a character at worst); the scene has what they leave
eq(G.sourcesMb([]), 0, "no source: nothing");
eq(G.sourcesMb([{ bytes: 3.25 * MB, undo: 0 }]), 13, "Templu Mare v9 (3.25 MB of JSON), no undo: ~13 MB");
eq(G.sourcesMb([{ bytes: 3.25 * MB, undo: 10 }, { bytes: 1 * MB, undo: 2 }]), 86, "Templu with 10 steps + a room of 1 MB with 2: ~86 MB");
eq(G.sourcesMb([{ bytes: NaN, undo: 3 }]), 0, "nonsense weighs nothing");
eq(/ceilingMb: Math\.max\(0, sceneCeilingMb\(\) - sourcesMb\(\)\)/.test(main), true, "main: the scene's ceiling less the sources open");

console.log(`check-memory-guard: ${checks} checks OK`);
