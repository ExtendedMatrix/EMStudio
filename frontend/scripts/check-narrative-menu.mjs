// MICRO-NARRATIVE-MENU (13 Nov 2026) · the menus of the Narrative, opened in a
// real browser at E.D.'s window size and at a narrow one (central panel
// ~490 px), every submenu opened: each one inside the window, no horizontal
// scroll, no word broken inside (E.D.: «Matri / x», «T / i.»), the list
// starting from its first row; the «Insert» menu in its order (Document and
// 3D scene, the five views, the standard blocks, the gestures, the nodes to
// cite last); Esc closes Export ▾; the same component on the Matrix (Shift+A at
// the right edge: the submenus open on the left), and after a keyboard walk
// into a submenu and back.
//
//   node scripts/check-narrative-menu.mjs
//   PORT=5193 NARR_V9=/tmp/…/TempluMare_v9.em.json node scripts/check-narrative-menu.mjs
//
// A COPY of Templu Mare v9 is needed (its story: 13 chapters, 870 nodes to
// cite); without it the check says so and passes. PORT = a Vite already
// serving the frontend, else one is started on a free port. Needs
// playwright-core (PLAYWRIGHT_CORE, or the audit's copy) and a Chromium (CHR).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FE = fileURLToPath(new URL("..", import.meta.url));
const VITE = join(FE, "node_modules/vite/bin/vite.js");
const DOC = process.env.NARR_V9 ?? "/tmp/nvmod/T/EM/TempluMare_v9.em.json";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
if (!existsSync(DOC)) {
  console.log(`– check-narrative-menu: no copy of Templu Mare v9 at ${DOC} (NARR_V9): skipped`);
  process.exit(0);
}
const loadPw = async () => {
  for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname]) {
    if (!t) continue;
    try { const m = await import(t); return m.chromium ? m : m.default; } catch { /* next */ }
  }
  console.error("✗ the check could not run: playwright-core not found (PLAYWRIGHT_CORE)");
  process.exit(2);
};
const { chromium } = await loadPw();
const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

let vite = null;
let PORT = process.env.PORT;
if (!PORT) {
  PORT = String(await freePort());
  vite = spawn(process.execPath, [VITE, "--port", PORT, "--strictPort"], { cwd: FE, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/em/studio/`)).ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
const failures = [];
let passed = 0;
const ok = (cond, what) => { if (cond) passed++; else failures.push(what); };

/** in the page: the menus matched by `sels`, each with what is wrong with it */
const MEASURE = (sels) => {
  const broken = (root) => {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!n.parentElement?.getClientRects().length) continue;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(n.textContent))) {
        const r = document.createRange();
        r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
        if (tops.size > 1) out.push(m[0]);
      }
    }
    return out;
  };
  return sels.flatMap((sel) => [...document.querySelectorAll(sel)]
    .filter((e) => e.getClientRects().length && getComputedStyle(e).display !== "none").map((e) => {
      const r = e.getBoundingClientRect();
      const issues = [];
      if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
        issues.push(`outside the window (${Math.round(r.left)},${Math.round(r.top)})–(${Math.round(r.right)},${Math.round(r.bottom)})`);
      for (const s of [e, ...e.querySelectorAll(".addm-body")])
        if (s.scrollWidth > s.clientWidth + 1 && getComputedStyle(s).overflowX !== "hidden") issues.push(`horizontal overflow ${s.scrollWidth}>${s.clientWidth}`);
      const bw = broken(e);
      if (bw.length) issues.push(`words broken inside: ${[...new Set(bw)].slice(0, 6).join(" | ")}`);
      const body = e.querySelector(".addm-body") ?? (e.matches(".addm-sub") ? e : null);
      if (body) {
        const first = body.querySelector(".addm-item, .addm-cat, .addm-grp");
        if (body.scrollTop > 0) issues.push(`list starts scrolled by ${body.scrollTop}px`);
        if (first && first.getBoundingClientRect().top < body.getBoundingClientRect().top - 0.5) issues.push("first row under the search field");
      }
      return { sel, issues };
    }));
};

try {
  for (const [size, viewport] of [["E.D.", { width: 1552, height: 914 }], ["narrow", { width: 1180, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await p.addInitScript(() => { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); sessionStorage.setItem("probe", "1"); } });
    await p.goto(`http://localhost:${PORT}/em/studio/`);
    await p.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 90000 });
    await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(DOC, "utf8")), DOC]);
    await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 90000 });
    await p.click(`#workspace-bar .ws-tab[data-ws="narrative"]`);
    await p.waitForTimeout(1200);
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^(Write|Scrivi)$/.test(x.textContent.trim()))?.click());
    await p.waitForTimeout(600);
    const check = async (menu, sels) => {
      await p.waitForTimeout(200);
      const m = await p.evaluate(MEASURE, sels);
      ok(m.length > 0, `${size} · ${menu}: not on screen`);
      for (const x of m) ok(!x.issues.length, `${size} · ${menu} (${x.sel}): ${x.issues.join("; ")}`);
    };
    const close = async () => { await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await p.mouse.click(4, viewport.height - 4); await p.waitForTimeout(150); };
    const openInsert = async () => {
      await p.evaluate(() => { const bs = [...document.querySelectorAll('.nv-chapter[data-chapter="0"] .nv-ins-btn')]; bs[Math.min(5, bs.length - 1)].scrollIntoView({ block: "center" }); });
      await p.waitForTimeout(250);
      await p.evaluate(() => { const bs = [...document.querySelectorAll('.nv-chapter[data-chapter="0"] .nv-ins-btn')]; bs[Math.min(5, bs.length - 1)].click(); });
      await p.waitForSelector(".addm", { timeout: 5000 });
    };
    const subsOf = async (menu) => {
      const cats = await p.evaluate(() => [...document.querySelectorAll(".addm-cat:not(.off)")].map((c) => c.dataset.cat));
      for (const c of cats) {
        await p.hover(`.addm-cat[data-cat="${c}"]`);
        await check(`${menu} › ${c}`, [".addm", ".addm-cat.open > .addm-sub"]);
      }
      return cats.length;
    };

    // the «+» between paragraphs
    await openInsert();
    await check("Insert", [".addm"]);
    const order = await p.evaluate(() => [...document.querySelectorAll(".addm-body > *")]
      .map((e) => e.classList.contains("addm-sep") ? "—" : e.dataset.key ?? (e.classList.contains("addm-grp") ? `#${e.textContent.trim()}` : e.dataset.cat ? `▸${e.dataset.cat}` : "")).filter(Boolean));
    const at = (k) => order.indexOf(k);
    ok(order[1] === "b|document" && order[2] === "b|scene3d", `${size} · Insert: Document and 3D scene first (got ${order.slice(0, 4).join(", ")})`);
    ok(["b|matrix", "b|table", "b|timeline", "b|map", "b|paradata"].every((k) => at(k) > at("b|scene3d")), `${size} · Insert: the five views in the list`);
    ok(!order.some((k) => k.startsWith("▸")), `${size} · Insert: no submenu rows (got ${order.filter((k) => k.startsWith("▸")).join(", ")})`);
    ok(at("b|q|research_history") > at("b|paradata") && at("b|mention") > at("b|q|research_history"), `${size} · Insert: views, standard blocks, then the gestures`);
    const cite = order.findIndex((k) => k.startsWith("c|"));
    ok(cite > at("b|chapter") && order.slice(cite).every((k) => k.startsWith("c|") || k === "—" || k.startsWith("#")), `${size} · Insert: «Or cite a node» last`);
    ok(await subsOf("Insert") === 0, `${size} · Insert: no submenu`);
    await p.evaluate(() => document.querySelector(".addm-q")?.focus());
    await p.keyboard.type("timeline");
    await p.waitForTimeout(250);
    const hits = await p.evaluate(() => [...document.querySelectorAll(".addm-body .addm-item")].map((b) => b.dataset.key));
    ok(hits.includes("b|timeline"), `${size} · Insert: the search finds a view («timeline»)`);
    await check("Insert · searching", [".addm"]);
    await close();
    // the refs of a module (a second menu of the same component)
    await openInsert();
    await p.evaluate(() => document.querySelector('.addm-item[data-key="b|document"]')?.click());
    await p.waitForTimeout(300);
    await check("Insert › Document", [".addm"]);
    await close();

    // Narrative ▾, Export ▾ (Esc closes it)
    await p.evaluate(() => [...document.querySelectorAll(".tile-area")].find((x) => x.offsetParent && x.dataset.surfaceType === "narrative")?.querySelector(".win-type-toggle")?.click());
    await check("Narrative ▾", [".tile-area .win-type .dd-menu:not(.hidden)"]);
    await close();
    await p.evaluate(() => document.querySelector(".nv-publish")?.click());
    await check("Export ▾", [".nv-pubmenu"]);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok(!(await p.$(".nv-pubmenu")), `${size} · Export ▾: Esc closes it`);
    await close();

    // right click on a title and on a paragraph, at the bottom of the page
    for (const what of ["title", "paragraph"]) {
      await p.evaluate((what) => {
        const el = what === "title" ? document.querySelectorAll(".nv-chapter")[1]?.querySelector(".nv-chapter-head")
          : [...document.querySelectorAll('.nv-chapter[data-chapter="1"] .nv-block-row')].find((r) => r.querySelector(".nv-prose-edit"));
        const hb = (el.closest(".win-body") ?? document.body).getBoundingClientRect();
        el.scrollIntoView({ block: "end" });
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 6, clientY: Math.min(r.bottom - 4, hb.bottom - 8) }));
      }, what);
      await check(`right click · ${what}`, [".nv-ctx"]);
      if (what === "paragraph") {
        const why = await p.evaluate(() => [...document.querySelectorAll(".nv-ctx button:disabled")].map((b) => b.title));
        ok(why.every(Boolean), `${size} · right click: a refused item says why`);
      }
      await close();
    }

    // the Index's «+ Add…» and its submenu
    await p.evaluate(() => { const b = document.querySelector('[data-nidxact="add"]'); b?.scrollIntoView({ block: "center" }); b?.click(); });
    await check("Index + Add…", [".addm"]);
    await subsOf("Index + Add…");
    await close();

    // the same component on the Matrix, at its right edge; then the keyboard
    // walks into a submenu and back
    const mx = await p.evaluate(() => {
      const c = [...document.querySelectorAll(".tile-area")].find((x) => x.offsetParent && x.dataset.surfaceType === "graph")?.querySelector("canvas");
      const r = c?.getBoundingClientRect();
      return r ? { x: Math.round(r.right - 30), y: Math.round(r.top + r.height * 0.55) } : null;
    });
    if (mx) {
      await p.mouse.click(mx.x, mx.y);
      await p.keyboard.press("Escape");
      await p.mouse.move(mx.x, mx.y);
      await p.keyboard.press("Shift+A");
      await p.waitForTimeout(300);
      if (await p.$(".addm")) {
        await check("Matrix Shift+A", [".addm"]);
        ok(await subsOf("Matrix Shift+A") > 0, `${size} · Matrix Shift+A: its submenus`);
        await close();
        await p.mouse.move(mx.x, mx.y);
        await p.keyboard.press("Shift+A");
        await p.waitForTimeout(300);
        for (const k of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "ArrowUp", "ArrowUp"]) await p.keyboard.press(k);
        await check("Matrix Shift+A · keyboard round trip", [".addm"]);
        await close();
      } else failures.push(`${size} · Shift+A on the Matrix opened nothing`);
    }
    ok(!errors.length, `${size} · page errors: ${errors.join(" | ")}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  vite?.kill("SIGTERM");
}
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`check-narrative-menu: ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ check-narrative-menu: ${passed} checks`);
