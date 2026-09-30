// NIGHT-RISORSA-FILE · executable check of the resource and its files.
//
//   node scripts/check-resources.mjs
//
// The resource is the SET, the file is each FILE (s3Dgraphy 1.6.17/1.6.31,
// decision of E.D. 30 Sep 2026). EMStudio mirrors `api.add_resource` in
// `resources.ts`; this file asks that mirror the same questions s3Dgraphy's
// tests ask, and compares its output with a golden made BY s3Dgraphy
// (`testdata/resources-golden.json`, written by `tools/resources_golden.py`).
//
// Sections:
//   0. the style keys: `resource` → LINK, `resource_file` → FILE (icons + palette)
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;

/** `import.meta.glob` is Vite's: here each call becomes the object Vite would
 *  hand out, one `url:<file>` per file of the directory that matches. */
const globPlugin = {
  name: "glob",
  setup(build) {
    build.onLoad({ filter: /\/src\/icons\.ts$/ }, (args) => {
      const text = readFileSync(args.path, "utf8").replace(
        /import\.meta\.glob\(\s*"\.\/assets\/([^/]+)\/\*\.(\{[^}]+\}|\w+)"[\s\S]*?\}\)/g,
        (_m, dir, ext) => {
          const exts = ext.startsWith("{") ? ext.slice(1, -1).split(",") : [ext];
          const files = readdirSync(`${SRC}assets/${dir}`)
            .filter((f) => exts.some((e) => f.endsWith(`.${e}`)));
          return JSON.stringify(Object.fromEntries(
            files.map((f) => [`./assets/${dir}/${f}`, `url:${f}`])));
        });
      return { contents: text, loader: "ts" };
    });
  },
};

async function load(contents) {
  const bundle = await esbuild.build({
    stdin: { contents, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, plugins: [globPlugin],
    loader: { ".svg": "text", ".png": "text" },
    logLevel: "silent",
  });
  return import("data:text/javascript;base64,"
    + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
}

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

// ── 0 · the style keys ──────────────────────────────────────────────────────
{
  const I = await load(`export { iconUrlFor, styleKeyFor } from "./icons";
                        export { nodeStyle } from "./palette";`);
  ok(typeof I.styleKeyFor === "function", "icons.ts says which style key a node_type reads");
  eq(I.styleKeyFor?.("resource"), "LINK", "a resource (the node_type since MIG1) reads LINK");
  eq(I.styleKeyFor?.("link"), "LINK", "…and `link`, the name before MIG1, still reads LINK (old files)");
  eq(I.styleKeyFor?.("resource_file"), "FILE", "a file reads FILE, by declaration");
  eq(I.iconUrlFor("resource"), "url:link.svg", "a resource is drawn with link.svg");
  eq(I.iconUrlFor("resource_file"), "url:resource_file.svg", "a file is drawn with its own glyph");
  const res = I.nodeStyle("resource"), link = I.nodeStyle("link"), file = I.nodeStyle("resource_file");
  eq([res.border, res.borderStyle, res.shape], [link.border, link.borderStyle, link.shape],
    "palette: a resource has LINK's frame");
  eq(res.border, "#FF6600", "…the LINK orange, not the `unknown` fallback");
  eq([file.border, file.borderStyle], ["#FF6600", "dashed"], "palette: a file has FILE's dashed frame");
}

if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`resources: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`resources: ${checks} checks passed`);
