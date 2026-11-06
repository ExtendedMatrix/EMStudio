// MICRO-MEMORIA-SESSIONE · the four points in a real browser, on a copy of Templu
// Mare v6 (never OneDrive's):
//   p.2  the WebView FALLS (the renderer crashed through CDP `Page.crash`) and a new
//        page opens on the same profile: the file, the graph, the unsaved rename,
//        the selection come back, said «Ho ripreso la sessione delle HH:MM»; a
//        session closed clean is not taken back;
//   p.3  the Log drawer: «Copia tutto» / «Copia i filtrati» into the real
//        clipboard with the hours, a line's «Copia», the text selectable and a
//        selection not taken away by a new line;
//   p.1  the guard of memory in the Space (the newest epoch: 10 models and a
//        tileset, ~113 MB estimated): with a ceiling of MEM_CEIL (80 MB) what does
//        not fit is not loaded, its strip proposes the version that fits (when one
//        does) and «Carica comunque»; with the machine's ceiling nothing is held back;
//   p.4  «Salva come» in a browser (a download): with relative urls it says so first.
//
//   PORT=5281 BRIDGE=http://localhost:8941 TEMPLU=/tmp/memses/T/EM/TempluMare_v6_optimized.em.json \
//     SHOTS=<dir> node scripts/check-memoria-sessione.mjs
//
// Needs a Vite of this tree on PORT and a bridge of this tree (level ≥ 62) whose
// --fs-root holds TEMPLU. PLAYWRIGHT_CORE / CHR as the other browser checks.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PORT = process.env.PORT ?? "5281";
const BRIDGE = process.env.BRIDGE ?? "http://localhost:8941";
const TEMPLU = process.env.TEMPLU ?? "/tmp/memses/T/EM/TempluMare_v6_optimized.em.json";
const SHOTS = process.env.SHOTS ?? null;
const PW = process.env.PLAYWRIGHT_CORE
  ?? `${process.env.HOME}/Documents/GitHub/EMStudio/.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js`;
const CHR = process.env.CHR
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const MEM_CEIL = Number(process.env.MEM_CEIL ?? 80);
const ONLY = (process.env.CASES ?? "session,log,memory,saveas").split(",");
if (!existsSync(TEMPLU)) { console.error(`no ${TEMPLU}`); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { chromium } = (await import(PW)).default ?? await import(PW);

let checks = 0;
const fails = [];
const out = {};
const ok = (cond, what, got) => { checks++; if (!cond) fails.push(`${what}${got !== undefined ? ` — got ${JSON.stringify(got)}` : ""}`); else console.log(`  ✓ ${what}`); };
const URL0 = `http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}`;
const doc = JSON.parse(readFileSync(TEMPLU, "utf8"));
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch({ headless: true, executablePath: CHR, args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"] });
const fresh = async (settings = null) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(([s]) => {
    if (sessionStorage.getItem("probe")) return;
    sessionStorage.setItem("probe", "1");
    if (!localStorage.getItem("emstudio.locale")) localStorage.setItem("emstudio.locale", "it");
    if (s) localStorage.setItem("emstudio.settings", JSON.stringify(s));
  }, [settings]);
  return ctx;
};
const open = async (ctx) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => (out.errors ??= []).push(String(e).slice(0, 300)));
  await p.goto(URL0);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 60000 });
  return p;
};
const openTemplu = async (p) => {
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [doc, TEMPLU]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
};
const toasts = (p) => p.evaluate(() => [...document.querySelectorAll(".toast, .toast-ask, [class*=toast]")].map((e) => e.textContent.trim()).filter(Boolean));

try {
  // ── p.2 · the session comes back after the WebView falls ──────────────────
  if (ONLY.includes("session")) {
    console.log("p.2 · session");
    const ctx = await fresh();
    const p = await open(ctx);
    await openTemplu(p);
    const active = doc.graphs[doc.active_graph_id] ?? Object.values(doc.graphs)[0];
    const us = active.nodes.find((n) => n.node_type === "US" && n.name);
    await p.evaluate(([id]) => { window.__EM_DRAG__.renameNode(id, "US ripresa dopo il crollo"); window.__EM_DRAG__.jumpTo(id); }, [us.id]);
    await p.waitForTimeout(400);
    await p.evaluate(() => window.__EM_DRAG__.sessionCopy());
    const rec = await p.evaluate(() => { const r = window.__EM_DRAG__.sessionRecord(); return { ...r, files: r.files.map((f) => ({ ...f, text: f.text ? f.text.length : null })) }; });
    out.copy = rec;
    ok(rec.files.length === 1 && rec.files[0].dirty && rec.files[0].text > 1e6, "the copy holds the file, unsaved, with its content (a browser cannot read the path back)", rec.files);
    ok(rec.selected === us.id, "…and the selection", rec.selected);
    // the WebView falls
    const cdp = await ctx.newCDPSession(p);
    const crashed = new Promise((res) => p.on("crash", () => res(true)));
    cdp.send("Page.crash").catch(() => undefined);
    ok(await Promise.race([crashed, new Promise((r) => setTimeout(() => r(false), 8000))]), "the page crashed (CDP Page.crash)");
    const t0 = Date.now();
    const p2 = await open(ctx);
    await p2.waitForFunction(() => window.__EM_SESSION__?.restored != null, null, { timeout: 60000 });
    out.session = await p2.evaluate(() => window.__EM_SESSION__);
    out.restoreMs = Date.now() - t0;
    ok(out.session.decided === "auto" && out.session.restored === 1, "a new page on the same profile takes it back by itself", out.session);
    await p2.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
    const back = await p2.evaluate(([id]) => ({ name: window.__EM_DRAG__.nodeName(id), selected: window.__EM_DRAG__.selected(),
      file: window.__EM_DRAG__.sessionRecord().files.map((f) => f.name).join(", "), dirty: !!document.querySelector(".et-dirty"),
      log: window.__EM_DRAG__.logTail?.(30) ?? null }), [us.id]);
    out.back = back;
    ok(back.name === "US ripresa dopo il crollo", "the unsaved rename is back", back.name);
    ok(back.dirty, "…still unsaved (the dot of the file)");
    ok(back.selected.includes(us.id), "the selection is back", back.selected);
    ok(/TempluMare_v6_optimized/.test(back.file), "the file is back by its name", back.file);
    const said = (await toasts(p2)).join(" | ") + " " + JSON.stringify(back.log ?? "");
    ok(/Ho ripreso la sessione delle \d\d:\d\d/.test(said), "said: «Ho ripreso la sessione delle HH:MM»", said.slice(0, 300));
    await shot(p2, "p2-ripresa");
    await ctx.close();

    // a session that ends clean is not taken back
    const c2 = await fresh();
    const q = await open(c2);
    await openTemplu(q);
    await q.evaluate(() => window.__EM_DRAG__.sessionCopy());
    const beforeClose = await q.evaluate(() => JSON.parse(localStorage.getItem("emstudio.session.beat")));
    await q.close({ runBeforeUnload: true });
    const q2 = await open(c2);
    await q2.waitForFunction(() => window.__EM_SESSION__?.decided, null, { timeout: 30000 });
    const d2 = await q2.evaluate(() => window.__EM_SESSION__);
    ok(beforeClose.clean === false && d2.decided === "none", "opened, nothing changed, closed: the next start does not take it back", d2);
    await c2.close();
  }

  // ── p.3 · the Log can be copied ──────────────────────────────────────────
  if (ONLY.includes("log")) {
    console.log("p.3 · log");
    const ctx = await fresh();
    const p = await open(ctx);
    await openTemplu(p);
    await p.evaluate(() => { for (const m of ["prova uno · Column_shadow", "prova due · Tetto1", "prova tre · Column_light"]) window.__EM_DRAG__.logLine(m); });
    await p.click("#footer-log");
    await p.waitForSelector("#log-drawer:not(.hidden) .log-activity li");
    await p.fill("#log-filter", "column");
    const shown = await p.$eval("#log-copy-shown", (b) => ({ text: b.textContent, disabled: b.disabled }));
    ok(!shown.disabled && /\(2\)/.test(shown.text), "«Copia i filtrati (2)» with the filter «column»", shown);
    ok((await p.$$eval(".log-activity li", (l) => l.length)) === 2, "the drawer shows the two lines");
    await p.click("#log-copy-shown");
    await p.waitForTimeout(200);
    const clipF = await p.evaluate(() => navigator.clipboard.readText());
    const lf = clipF.trim().split("\n");
    out.clipFiltered = clipF;
    ok(/· Log · «column» · \d{4}-\d\d-\d\d$/.test(lf[0]) && lf.length === 3 && /^\d\d:\d\d:\d\d · prova uno/.test(lf[1]) && /^\d\d:\d\d:\d\d · prova tre/.test(lf[2]),
       "the clipboard: the head with the filter and the day, the two lines oldest first, with their hours", lf);
    await p.fill("#log-filter", "");
    await p.click("#log-copy-all");
    await p.waitForTimeout(200);
    const clipA = await p.evaluate(() => navigator.clipboard.readText());
    const n = await p.evaluate(() => window.__EM_DRAG__.logTail?.(9999)?.length ?? null);
    ok(clipA.trim().split("\n").length - 1 >= 4 && /prova due/.test(clipA), "«Copia tutto»: every line of the ring", { lines: clipA.trim().split("\n").length - 1, ring: n });
    // a line's «Copia»
    const tre = p.locator(".log-activity li", { hasText: "prova tre" });
    await tre.hover();
    await tre.locator("[data-log-copy]").click();
    await p.waitForTimeout(200);
    const clipL = await p.evaluate(() => navigator.clipboard.readText());
    ok(/^\d\d:\d\d:\d\d · prova tre · Column_light$/.test(clipL.trim()), "a line's «Copia»: that line, with its hour", clipL);
    // the text can be selected, and a new line does not take the selection away
    const sel = await p.evaluate(() => {
      const li = [...document.querySelectorAll(".log-activity li")].find((l) => /prova due/.test(l.textContent));
      const r = document.createRange(); r.selectNodeContents(li);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      window.__selLi = li;
      return { text: s.toString(), us: getComputedStyle(li).userSelect || getComputedStyle(li).webkitUserSelect };
    });
    ok(/prova due/.test(sel.text) && sel.us === "text", "the drawer's text is selectable (user-select: text)", sel);
    await p.evaluate(() => window.__EM_DRAG__.logLine("prova quattro, arrivata durante la selezione"));
    await p.waitForTimeout(300);
    const held = await p.evaluate(() => ({ same: window.__selLi.isConnected && [...document.querySelectorAll(".log-activity li")].includes(window.__selLi), text: getSelection().toString(),
      four: [...document.querySelectorAll(".log-activity li")].some((l) => /prova quattro/.test(l.textContent)) }));
    ok(held.same && /prova due/.test(held.text) && !held.four, "a line arriving during the selection waits: the selection stays", held);
    await shot(p, "p3-log-selezione");
    await p.evaluate(() => getSelection().removeAllRanges());
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => [...document.querySelectorAll(".log-activity li")].some((l) => /prova quattro/.test(l.textContent)));
    ok(after, "let go, the line held back is drawn");
    await shot(p, "p3-log");
    await ctx.close();
  }

  // ── p.1 · the guard of memory in the Space ───────────────────────────────
  if (ONLY.includes("memory")) {
    console.log("p.1 · memory");
    // the Space opens on the newest epoch (XX sec: its models and the survey's tileset)
    const space = async (p) => {
      await p.click(`#workspace-bar .ws-tab[data-ws="space"]`);
      await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
      await p.waitForTimeout(1500);
    };
    const settle = async (p) => {
      for (let i = 0; i < 600; i++) {
        const st = await p.evaluate(() => { const h = document.querySelector(".scn-host"); const s = h?.__space?.() ?? [];
          return { ready: h?.dataset.ready, pending: s.filter((x) => x.as === "pending").length, gates: document.querySelectorAll("[data-gate=load]").length }; });
        if (st.gates) { await p.click("[data-gate=load]"); continue; }
        if (st.ready === "1" && !st.pending) break;
        await p.waitForTimeout(250);
      }
      await p.waitForTimeout(1200);
    };
    const look = (p) => p.evaluate(() => {
      const h = document.querySelector(".scn-host");
      const s = h?.__space?.() ?? [];
      return { guard: h?.__spaceGuard?.(), mesh: s.filter((x) => x.as === "mesh").length, gated: s.filter((x) => x.as === "gated").length,
        gatedIds: s.filter((x) => x.as === "gated").map((x) => x.id), drawn: s.filter((x) => x.as === "mesh" || x.as === "tiles").map((x) => `${x.id}@${String(x.url ?? "").split("/").pop()}`),
        memStrips: document.querySelectorAll("[data-mem-gate]").length, lighter: [...document.querySelectorAll('[data-gate="lighter"]')].map((b) => b.textContent),
        anyway: document.querySelectorAll('[data-gate="memory"]').length };
    });
    // the machine's ceiling: nothing held back
    const c0 = await fresh();
    const p0 = await open(c0);
    await openTemplu(p0);
    await space(p0);
    await settle(p0);
    const free = await look(p0);
    out.memoryFree = free;
    ok(free.gated === 0 && free.mesh >= 10 && free.guard?.ceilingMb >= 1024 && typeof free.guard?.availableMb === "number",
       "with the machine's ceiling and the bridge's free memory, the scene loads whole", free);
    await c0.close();
    // a ceiling of 300 MB (Preferences)
    const c1 = await fresh({ viewer: { sceneMemoryMB: MEM_CEIL } });
    const p1 = await open(c1);
    await openTemplu(p1);
    await space(p1);
    await settle(p1);
    const tight = await look(p1);
    out.memoryTight = tight;
    ok(tight.guard?.ceilingMb === MEM_CEIL, `the ceiling of the Preferences is read (${MEM_CEIL} MB)`, tight.guard);
    ok(tight.guard?.usedMb <= MEM_CEIL, "what was loaded stays under it (estimated)", tight.guard);
    ok(tight.gated > 0 && tight.memStrips === tight.gated && tight.anyway === tight.gated, "what does not fit is held back, each with its strip and «Carica comunque»", tight);
    const said = (await toasts(p1)).join(" | ") + JSON.stringify(await p1.evaluate(() => window.__EM_DRAG__.logTail?.(40) ?? []));
    ok(/non caricato: ~\d/.test(said), "said in the Log / a toast: «… non caricato: ~N MB, e restano …»", said.slice(0, 400));
    await shot(p1, "p1-guardia");
    if (tight.lighter.length) {
      const who = await p1.$eval('[data-gate="lighter"]', (b) => b.closest("[data-id]")?.dataset.id ?? null);
      await p1.click('[data-gate="lighter"]');
      await settle(p1);
      const chose = await look(p1);
      out.memoryLighter = { picked: tight.lighter[0], model: who, before: tight, after: chose };
      ok(!!who && chose.drawn.some((d) => d.startsWith(`${who}@`)) && !chose.gatedIds.includes(who),
         `«${tight.lighter[0]}» proposed for ${who}, chosen: that model is drawn with it`, { who, drawn: chose.drawn, gated: chose.gatedIds });
      ok(chose.guard.usedMb <= MEM_CEIL, "…and the scene is still under the ceiling (another may wait in its place: said in its strip)", chose.guard);
    } else ok(true, "(no lighter version fits the room left: only «Carica comunque» — said in the report)");
    const g0 = (await look(p1)).gated;
    await p1.click('[data-gate="memory"]');
    await settle(p1);
    const forced = await look(p1);
    ok(forced.gated === g0 - 1 || forced.mesh > tight.mesh, "«Carica comunque» loads that one", { g0, forced });
    await c1.close();
  }

  // ── p.4 · «Salva come» in a browser says it before the download ───────────
  if (ONLY.includes("saveas")) {
    console.log("p.4 · save as (browser)");
    const ctx = await fresh();
    const p = await open(ctx);
    await openTemplu(p);
    await p.click("#btn-save-as").catch(async () => p.evaluate(() => document.getElementById("btn-save-as").click()));
    await p.waitForSelector('[data-app-dialog="save-download-relative"]', { timeout: 15000 });
    const msg = await p.$eval('[data-app-dialog="save-download-relative"] .app-dialog-msg', (e) => e.textContent);
    ok(/578 file di questo documento sono scritti rispetto a \/tmp\/memses\/T\/EM/.test(msg), "before the download: «578 file … rispetto a <la cartella>»", msg);
    await shot(p, "p4-scarica");
    await p.click('[data-app-dialog="save-download-relative"] [data-dialog-cancel]');
    await ctx.close();
  }
} catch (e) {
  fails.push(`thrown: ${e instanceof Error ? e.stack : e}`);
} finally {
  await browser.close();
  if (SHOTS) writeFileSync(`${SHOTS}/check-memoria-sessione.json`, JSON.stringify({ checks, fails, ...out }, null, 1));
}
if (fails.length) {
  console.error(`check-memoria-sessione: ${fails.length} FAILED of ${checks}\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`check-memoria-sessione: ${checks} checks OK`);
