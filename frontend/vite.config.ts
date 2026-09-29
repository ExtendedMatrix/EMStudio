import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// EMStudio app version — single source of truth is package.json (kept in sync
// with Cargo.toml + tauri.conf.json by scripts/set-version.sh). Inlined at
// build time and shown in the GUI so testers know which build they're on.
const PKG_PATH = fileURLToPath(new URL("./package.json", import.meta.url));
const readVersion = () =>
  (JSON.parse(readFileSync(PKG_PATH, "utf-8")) as { version: string }).version;
const pkg = { version: readVersion() };

// …and in DEV the badge must not lie either. `define` is read once, when Vite
// starts, so a `./em.sh devrel` bump left em.localhost showing dev.8 for weeks
// while serving current code. A version change in package.json restarts the
// dev server, which re-reads this config: one restart per release, none for a
// dependency install that leaves the version alone.
const versionFollowsPackageJson = (): Plugin => ({
  name: "emstudio-version-follows-package-json",
  apply: "serve",
  configureServer(server) {
    server.watcher.add(PKG_PATH);
    server.watcher.on("change", (file) => {
      if (file !== PKG_PATH) return;
      let next: string;
      try { next = readVersion(); } catch { return; } // half-written file: wait
      if (next === pkg.version) return;
      server.config.logger.info(`version ${pkg.version} → ${next}: restarting`);
      void server.restart();
    });
  },
});

// Single-file build: dist/index.html is fully self-contained, so it works
// over file://, inside the Tauri shell, and as an e-mail-able artefact.
// TWO PAGES, TWO BUILDS — and it has to be two builds, not two inputs.
//
// `viteSingleFile` works by inlining every dynamic import into one bundle, and
// rollup refuses that with more than one entry. Since the single-file property
// is exactly what both pages are for (the editor must open over `file://`, the
// viewer must be servable from anywhere without an asset path to get wrong),
// the answer is to run the same config twice:
//
//   npm run build          → dist/index.html   (the editor)
//   npm run build:reader   → dist/reader.html  (the dissemination viewer, P3)
//
// `EM_ENTRY=reader` picks the second. It is `reader` and not `viewer` because
// `viewer.html` is already taken by the phase-2 read-only SVG GRAPH viewer —
// that one draws the matrix, this one reads the story. They share every module that matters — the
// narrative renderer, the embeds, the palette — so the viewer is a second ENTRY,
// never a second implementation.
const entry = process.env.EM_ENTRY === "reader" ? "reader"
  : process.env.EM_ENTRY === "engine3d" ? "engine3d" : "index";
// RIFINITURE · the web build of the editor leaves three.js out of the single
// file and fetches `engine3d.js` when a model opens (`npm run build:web`)
const lazy3d = process.env.EM_LAZY_3D === "1";

// ── WHERE THE DEV SERVER LIVES, and why it is not `/` ───────────────────────
//
// In development EMStudio is reached THROUGH the node's own origin, at
// `/em/studio/` (`stratigraph-server/dev-stack/Caddyfile.dev`), and the reason is
// not tidiness: served on a port of its own, the editor cannot fetch a study
// container from the Catalog at all — the browser refuses it as cross-origin and
// the Catalog sends no CORS headers, measured in Chrome on 4 September as
// «Study unreachable — TypeError: Failed to fetch». Same origin, and the question
// does not arise. (The alternative was `Access-Control-Allow-Origin: *` on the
// Catalog, which is not the repair of a missing permission but a permission
// given to everybody.)
//
// So the dev server's `base` is that path, and the asset URLs Vite writes into
// its HTML carry it. Vite redirects `/` to the base, so `localhost:5173` still
// works for anybody who prefers the port.
//
// `EM_DEV_BASE=/` restores the old behaviour for a run that wants it.
// PRODUCTION is untouched: there the base stays `./` (see below), which is the
// property that lets the editor open from `file://` and the reader be served
// from any prefix.
const devBase = process.env.EM_DEV_BASE || "/em/studio/";

/** RIFINITURE · a lib ES build keeps its whitespace (Vite leaves it for the
 *  consumer's bundler). `engine3d.js` has no consumer bundler — the browser
 *  imports it as it is — so it is minified whole, after rollup. */
function minifyWholeChunk(): Plugin {
  return {
    name: "em-minify-engine3d",
    async renderChunk(code, chunk) {
      const r = await transformWithEsbuild(code, chunk.fileName, { minify: true, format: "esm" });
      return { code: r.code, map: null };
    },
  };
}

export default defineConfig(({ command }) => {
  return ({
  // The dev server is reached through Caddy, which forwards the ORIGINAL Host —
  // so Vite's host check has to know the names it will see. Without this it
  // answers 403 to the proxy and the route looks broken: measured from inside
  // the container (`wget http://host.docker.internal:5173/` → 403 Forbidden)
  // before it was added.
  server: {
    // 0.0.0.0, because the proxy dials in from the container network
    host: true,
    allowedHosts: ["em.localhost", "host.docker.internal", "localhost"],
  },
  // RELATIVE, and for the reader that is a contract with whoever serves it.
  //
  // The editor is one file, so its base is moot. The reader is a shell that
  // asks for `./assets/reader-*.{js,css}` — and, when a model appears,
  // `./three.module-*.js` beside them — every one of which the browser resolves
  // against the URL DIRECTORY the shell came from. StratiGraph Catalog therefore serves
  // the whole `dist/` as a directory and puts the shell at its root
  // (`/catalog/reader/reader.html`, `app/main.py::READER_MOUNT`), and the
  // requests land.
  //
  // An ABSOLUTE base (`/catalog/reader/`) would work for exactly that one
  // deployment and break every other: a different prefix, a Caddy sub-path, a
  // reader opened from a file manager. Relative asks nothing of the host but
  // that the shell and its assets stay together, which is what a dist IS.
  // `scripts/check-narrative.mjs` asserts it against the built shell, so this
  // is a checked promise rather than a comment.
  //
  // …in a BUILD (`command === "build"`, which is Vite's own answer and not an
  // env var of ours). The dev server takes `devBase` instead: it is served
  // under a path on the node's origin, and a relative base there would make
  // every module request resolve against whatever directory the page was asked
  // for. Two situations, two answers, one line each.
  base: command === "serve" ? devBase : "./",
  define: { __EMSTUDIO_VERSION__: JSON.stringify(pkg.version), __EM_LAZY_3D__: JSON.stringify(lazy3d) },
  // The EDITOR is one file you can double-click, and that is a product
  // property: it opens from a USB stick, in a trench, with no server. The
  // READER is SERVED (StratiGraph Catalog, the field node), so it does not need to be —
  // and paying the single-file tax there is what made the 3D engine cost +800 kB
  // of inlined base64 instead of a chunk fetched only when a model appears.
  //
  // So: single-file for the editor, ordinary assets for the reader.
  // …and NOT on the dev server, which is the line that made the base above
  // actually take effect: `viteSingleFile` sets `base: "./"` itself (it has to —
  // inlining is what a relative base is for), and it does it in a `config` hook,
  // i.e. AFTER ours. Measured: the config computed `/em/studio/` and Vite printed
  // `Local: http://localhost:5173/`, serving the editor at the root with
  // `/@vite/client` beside it. There is nothing to inline in a dev server, so the
  // plugin belongs to the build alone.
  plugins: command === "serve" ? [versionFollowsPackageJson()]
    : entry === "reader" ? [] : entry === "engine3d" ? [minifyWholeChunk()] : [viteSingleFile()],
  build: {
    outDir: "dist",
    // RIFINITURE · the engine is a library build: ONE self-contained ES module
    ...(entry === "engine3d" ? { lib: { entry: new URL("./src/engine3d-entry.ts", import.meta.url).pathname,
                                        formats: ["es" as const], fileName: () => "engine3d.js" } } : {}),
    rollupOptions: entry === "engine3d" ? {} : {
      input: new URL(`./${entry}.html`, import.meta.url).pathname,
    },
    // single-file output: nothing stale can linger, and unlink is not
    // always permitted on synced/mounted folders
    emptyOutDir: false,
    // inline every asset (official EM icons) into the single file — for the
    // editor. The reader keeps its assets beside it, which is what lets three
    // be a lazily fetched chunk rather than base64 in the HTML.
    assetsInlineLimit: entry === "reader" ? 4096 : 100000000,
    chunkSizeWarningLimit: 6000,
  },
});
});
