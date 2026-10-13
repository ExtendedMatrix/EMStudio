// MICRO-APERTURA-VERA (13 ott 2026) — does EMStudio actually OPEN in a browser?
//
//   node scripts/check-apertura.mjs          (or: ./em.sh apertura)
//
// dev.36 went out broken: `renderStatusLine` ran while `main.ts` was still being
// evaluated and read `hubToken` before its `let` — a ReferenceError, the module
// stopped, the app was a dead page. Every check was green: the per-module
// scripts, `tsc --noEmit`, `npm run build`. None of them OPENED the app. This
// one does, and it is the gate `./em.sh devrel` runs before it tags.
//
// What it does, in at most 60 s:
//   1. `vite build` (the production build, plus a sourcemap) into a temporary
//      directory — `dist/` is not touched;
//   2. `vite preview` of that directory on a free port, at `/em/studio/`;
//   3. a real Chromium opens the empty app and FAILS on: any `pageerror`; a
//      `console.error` outside the short list of known noise below; a status
//      bar without «EMStudio <package.json version>»; a main menu that is not
//      there or does not open;
//   4. a second, fresh page opens `testdata/TempluMare.em.json` through
//      File ▸ Open… (the user's gesture) and fails on any error or on a Matrix
//      with no nodes.
//
// A failure ends with ONE verdict on stderr — the first error and where it was
// thrown, mapped back to `src/…:line:col` through the sourcemap — because that
// is what `devrel` and s3Dgraphy's `release.py` print when they refuse.
//
// Needs playwright-core (PLAYWRIGHT_CORE, a `playwright-core` the frontend can
// resolve, or the audit's copy) and a Chromium (CHR, else Playwright's own).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const FE = fileURLToPath(new URL("..", import.meta.url));
const VITE = join(FE, "node_modules/vite/bin/vite.js");
const FIXTURE = join(FE, "testdata/TempluMare.em.json");
const BUDGET_MS = 60_000;
const t0 = Date.now();
const left = () => Math.max(1000, BUDGET_MS - (Date.now() - t0));
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

// THE KNOWN NOISE — console errors that are the browser reporting the world,
// not the app failing. Each one is here for a reason, and the list stays short:
// a pattern that would also match a real failure does not belong in it.
let APP = "";   // the preview's origin, once it has a port
// Each entry is (text, url of the failed resource) → true when it is noise.
const NOISE = [
  // the s3dgraphy bridge (localhost:8765) and a StratiGraph node are OPTIONAL
  // services, and below every request outside the app is refused. Opening a
  // document asks the bridge for `/geometry-summary` (measured: the only one
  // that surfaces), and Chromium logs the refused request as a console error of
  // its own, with no stack. Only for a URL that is NOT the app: one of the
  // app's own files failing to load is a failure, and is reported.
  (text, url) => text === "Failed to load resource: net::ERR_CONNECTION_REFUSED" && !!url && !url.startsWith(APP),
];

const require_pw = async () => {
  const tries = [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname];
  for (const t of tries) {
    if (!t) continue;
    try {
      const m = t.startsWith("/") ? await import(t) : require(t);
      return m.chromium ? m : m.default;
    } catch { /* next */ }
  }
  throw new Error("playwright-core not found: set PLAYWRIGHT_CORE (or `npm i --no-save playwright-core`)");
};

const children = [];
let outDir = "";
let browser = null;
const cleanup = async () => {
  for (const c of children) try { c.kill("SIGTERM"); } catch { /* gone */ }
  if (browser) await browser.close().catch(() => {});
  if (outDir) rmSync(outDir, { recursive: true, force: true });
};
/** The one way out on a failure: the verdict last, on stderr, for the callers.
 *  Exit 1 = the app does not open; exit 2 = the check could not run (no
 *  Playwright, no Chromium, no preview) — which says nothing about the app. */
const refuse = async (what, where = [], code = 1) => {
  await cleanup();
  console.error(code === 1 ? `✗ EMStudio does not open: ${what}` : `✗ the check could not run: ${what}`);
  for (const w of where.slice(0, 3)) console.error(`    at ${w}`);
  process.exit(code);
};
const cannotRun = (what, where) => refuse(what, where, 2);
process.on("uncaughtException", (e) => void cannotRun(String(e?.message ?? e)));
process.on("unhandledRejection", (e) => void cannotRun(String(e?.message ?? e)));
const watchdog = setTimeout(() => void refuse(`the check took more than ${BUDGET_MS / 1000} s`), BUDGET_MS);

const run = (args, opts = {}) => {
  const c = spawn(process.execPath, [VITE, ...args], { cwd: FE, stdio: ["ignore", "pipe", "pipe"], ...opts });
  children.push(c);
  let log = "";
  c.stdout.on("data", (d) => { log += d; });
  c.stderr.on("data", (d) => { log += d; });
  return { c, log: () => log };
};
const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

// first, so a missing Playwright says so before a build was paid for
const { chromium } = await require_pw().catch((e) => cannotRun(e.message));

// ── 1 · build ────────────────────────────────────────────────────────────────
// Vite's own API, with the project's config — the production build exactly —
// plus a sourcemap and one plugin that keeps the entry chunk's code and map
// BEFORE vite-plugin-singlefile inlines it (and rewrites it, see below).
const version = JSON.parse(readFileSync(join(FE, "package.json"), "utf8")).version;
outDir = mkdtempSync(join(tmpdir(), "emstudio-apertura-"));
console.log(`▸ build ${version} (vite build + sourcemap) → ${outDir}`);
let entry = null;
try {
  const { build } = await import(pathToFileURL(require.resolve("vite", { paths: [FE] })).href);
  await build({
    root: FE, configFile: join(FE, "vite.config.ts"), logLevel: "warn",
    build: { outDir, emptyOutDir: false, sourcemap: true },
    plugins: [{
      name: "apertura-keep-entry", enforce: "pre",
      generateBundle(_o, bundle) {
        for (const c of Object.values(bundle))
          if (c.type === "chunk" && c.isEntry && c.map) entry = { code: c.code, map: c.map };
      },
    }],
  });
} catch (e) {
  await refuse(`vite build failed — ${String(e?.message ?? e).split("\n")[0]}`);
}

// ── where a stack frame really is: the inlined bundle back to src/… ──────────
// The editor is one file: the bundle is INLINED into index.html, so a frame
// says `…/em/studio/:LINE:COL` in the HTML. And not verbatim: singlefile turns
// every `__VITE_PRELOAD__` into `void 0` and escapes `</script>`/`<!--` as
// `\x3C…` (vite-plugin-singlefile `replaceScript`), which moves every column
// after them — measured: 10 columns on the line of the dev.36 throw, enough to
// land on `sync` instead of `hubToken`. So the same edits are found in the
// chunk and undone, and the chunk's own sourcemap answers — for the place, for
// the identifier there (the build is minified: dev.36 read «Cannot access
// 'ft'», the map says `hubToken`), and for the top-level function of src/ that
// encloses it.
const html = readFileSync(join(outDir, "index.html"), "utf8");
const starts = (text) => { const r = [0]; for (let i = 0; i < text.length; i++) if (text[i] === "\n") r.push(i + 1); return r; };
let original = () => null, originalName = () => null;
const open = /<script type="module"[^>]*>/.exec(html);
if (entry && open) {
  const { SourceMapConsumer } = require(require.resolve("source-map-js", { paths: [FE] }));
  const smc = new SourceMapConsumer(entry.map);
  const code = entry.code, htmlLines = starts(html), codeLines = starts(code);
  const at = open.index + open[0].length;                    // where the code starts in the HTML
  const lead = code.length - code.trimStart().length;        // `newCode.trim()`
  const edits = [...code.matchAll(/"?__VITE_PRELOAD__"?|<(?:\/script>|!--)/g)]
    .map((m) => ({ k: m.index, len: m[0].length, now: m[0].startsWith("<") ? m[0].length + 3 : 6 }));
  /** an HTML (line, col), 1-based → the chunk's { line 1-based, column 0-based, idx } */
  const toChunk = (l, c) => {
    const h = (htmlLines[l - 1] ?? 0) + c - 1 - at;
    if (h < 0) return null;
    let d = -lead, idx = null;                               // d = html index − chunk index
    for (const e of edits) {
      if (h < e.k + d) break;
      if (h < e.k + d + e.now) { idx = e.k; break; }        // inside a rewritten span
      d += e.now - e.len;
    }
    idx ??= h - d;
    let line = codeLines.length;
    while (line > 1 && codeLines[line - 1] > idx) line--;
    return { line, column: idx - codeLines[line - 1], idx };
  };
  original = (l, c) => {
    const g = toChunk(l, c);
    const p = g ? smc.originalPositionFor(g) : null;
    if (!p?.source) return null;
    const lines = (smc.sourceContentFor(p.source, true) ?? "").split("\n");
    let fn = null;
    for (let i = p.line - 1; i >= 0 && !fn; i--)
      fn = /^(?:export\s+)?(?:async\s+)?function\*?\s+([\w$]+)/.exec(lines[i] ?? "")?.[1] ?? null;
    // from the repository's root, where devrel and release.py are run
    const src = "frontend/" + p.source.replace(/^(\.\.\/)+/, "").replace(/^.*?\/frontend\//, "");
    return { at: `${src}:${p.line}:${p.column + 1}`, fn };
  };
  // the minified identifier `id` nearest to (l, c), and its name in src/:
  // the thrown position is the expression, not always the identifier
  originalName = (id, l, c) => {
    const g = toChunk(l, c);
    if (!g) return null;
    const lineStart = codeLines[g.line - 1], text = code.slice(lineStart, codeLines[g.line] ?? code.length);
    const re = new RegExp(`(?<![\\w$.])${id.replace(/\$/g, "\\$")}(?![\\w$])`, "g");
    const hits = [...text.matchAll(re)].map((m) => m.index).filter((i) => Math.abs(i - g.column) < 400)
      .sort((x, y) => Math.abs(x - g.column) - Math.abs(y - g.column));
    for (const column of hits) {
      const p = smc.originalPositionFor({ line: g.line, column });
      if (p?.name) return p.name;
    }
    return null;
  };
}
const frameRe = /at (?:(.+?) \()?(?:https?:\/\/[^)]*?):(\d+):(\d+)\)?$/;
const frames = (stack) => (stack ?? "").split("\n").slice(1).map((s) => {
  const m = frameRe.exec(s.trim());
  if (!m) return null;
  const o = original(+m[2], +m[3]);
  // a frame with no function is the module's own top level, whatever precedes it in src/
  const fn = m[1] ? (o?.fn ?? m[1]) : "<module>";
  return `${fn} (${o?.at ?? `index.html:${m[2]}:${m[3]}`})`;
}).filter(Boolean);
/** The message with the minified identifier put back, where the map knows it. */
const unminify = (message, stack) => {
  const m = frameRe.exec((stack ?? "").split("\n")[1]?.trim() ?? "");
  const id = /^Cannot access '([\w$]+)'|^([\w$]+) is not defined/.exec(message);
  const name = m && id ? originalName(id[1] ?? id[2], +m[2], +m[3]) : null;
  return name ? message.replace(id[1] ?? id[2], name) : message;
};
/** Did this error stop the module? Its stack ends at the module's top level. */
const stopsModule = (stack) => {
  const last = (stack ?? "").trim().split("\n").pop()?.trim() ?? "";
  return /^at https?:\/\//.test(last);
};

// ── 2 · serve ────────────────────────────────────────────────────────────────
const port = await freePort();
APP = `http://127.0.0.1:${port}/`;
const base = `${APP}em/studio/`;
const pv = run(["preview", "--outDir", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"]);
for (;;) {
  if (pv.c.exitCode !== null) await cannotRun("vite preview did not start", pv.log().trim().split("\n").slice(-3));
  try { if ((await fetch(base)).ok) break; } catch { /* not yet */ }
  if (left() < 2000) await cannotRun(`vite preview did not answer on ${base}`);
  await new Promise((r) => setTimeout(r, 150));
}

// ── 3 · open it ──────────────────────────────────────────────────────────────
browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined })
  .catch((e) => cannotRun(`no Chromium — ${String(e?.message ?? e).split("\n")[0]}`));

/** A fresh page with its errors collected (`verdict` below picks the one to say). */
const page = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // NOTHING AROUND IT: every request that is not the preview itself is refused,
  // so a bridge or a node left running on this laptop cannot make the verdict
  // differ from CI's. The app must open alone — that is the property checked.
  await ctx.route((u) => !u.href.startsWith(APP) && /^(https?|wss?):/.test(u.protocol),
    (r) => r.abort("connectionrefused"));
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push({ what: `${e.name}: ${unminify(e.message, e.stack)}`, where: frames(e.stack),
    first: stopsModule(e.stack) }));
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text(), loc = m.location();
    if (NOISE.some((noise) => noise(text, loc?.url))) return;
    const where = loc?.lineNumber != null && /\/em\/studio\/(index\.html)?$/.test(loc.url ?? "")
      ? [original(loc.lineNumber + 1, (loc.columnNumber ?? 0) + 1)?.at ?? `index.html:${loc.lineNumber + 1}`] : loc?.url ? [`${loc.url}:${(loc.lineNumber ?? 0) + 1}`] : [];
    errors.push({ what: `console.error: ${text.slice(0, 300)}`, where });
  });
  return { p, errors };
};
// THE verdict is the error that stopped the module, when there is one: the
// microtasks it had queued fail too, and Chromium may report them BEFORE it
// (measured on the dev.36 defect: `refreshIdentityChip` came first, a
// consequence; `renderStatusLine ← <module>` second, the cause).
const verdict = async (errors, round) => {
  if (!errors.length) return;
  const e = errors.find((x) => x.first) ?? errors[0];
  await refuse(`${round} — ${e.what}` + (errors.length > 1 ? `  (+${errors.length - 1} more)` : ""), e.where);
};
const step = (s) => console.log(`  ✓ ${s}`);

// round 1 · the empty app
{
  const { p, errors } = await page();
  await p.goto(base, { waitUntil: "load", timeout: left() });
  const want = `EMStudio ${version}`;
  const shown = await p.waitForFunction((w) => {
    const t = document.querySelector("#footer-app-version")?.textContent ?? "";
    return t.includes(w) ? t : false;
  }, want, { timeout: Math.min(8000, left()) }).then((h) => h.jsonValue()).catch(() => null);
  await p.waitForTimeout(1200);   // the late ones: microtasks, timers, the first probes
  await verdict(errors, "the empty app");
  if (!shown) await refuse(`the status bar does not say «${want}» ` +
    `(it says «${await p.locator("#footer-app-version").textContent().catch(() => "")}»)`);
  step(`it opens with no error, the status bar says «${shown.trim().replace(/^·\s*/, "")}»`);
  // the menu: there, and WIRED — a toggle that opens its menu is main.ts running
  const toggle = p.locator("#dd-file > .dd-toggle");
  if (!(await toggle.isVisible().catch(() => false))) await refuse("the main menu (File) is not there");
  await toggle.click({ timeout: 3000 }).catch(() => {});
  const opened = await p.locator("#dd-file > .dd-menu:not(.hidden)").isVisible().catch(() => false);
  if (!opened) await refuse("the main menu does not open (File ▾ clicked, its menu stayed hidden)");
  await verdict(errors, "the main menu");
  step("the main menu is there and opens");
  await p.context().close();
}

// round 2 · a document, opened the way a user opens it
{
  const { p, errors } = await page();
  await p.goto(base, { waitUntil: "load", timeout: left() });
  // a gesture that cannot be made is the app failing, not the check: the
  // errors first (they are usually why), then what could not be done
  const chooser = await (async () => {
    await p.locator("#dd-file > .dd-toggle").click({ timeout: 5000 });
    const [fc] = await Promise.all([
      p.waitForEvent("filechooser", { timeout: 5000 }),
      p.locator("#btn-open").click({ timeout: 5000 }),
    ]);
    return fc;
  })().catch(() => null);
  if (!chooser) {
    await verdict(errors, "File ▸ Open…");
    await refuse("File ▸ Open… offers no file chooser");
  }
  await chooser.setFiles(FIXTURE);
  const n = await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length || false, null,
    { timeout: Math.min(20000, left()) }).then((h) => h.jsonValue()).catch(() => 0);
  await p.waitForTimeout(800);
  await verdict(errors, "opening TempluMare.em.json");
  const view = await p.evaluate(() => window.__EM_SCENE__?.()?.view).catch(() => null);
  if (!n || view !== "matrix")
    await refuse(`TempluMare.em.json opened, and the Matrix has no nodes (view «${view}», ${n} nodes)`);
  step(`TempluMare.em.json opens through File ▸ Open…: the Matrix has ${n} nodes, no error`);
}

clearTimeout(watchdog);
await cleanup();
console.log(`✓ EMStudio ${version} opens in a browser (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
