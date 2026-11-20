// EXPERIMENTAL · the site and its footprint in the browser (site-door.ts), registered
// by check-interactions.mjs only with the switch on:
//
//   EMSTUDIO_EXPERIMENTAL=1 node scripts/suite-bench.mjs SD
//
// Bench (suite-bench.mjs, with the switch on): SITE_V4 = a COPY of the GT16
// study (its proxies beside it) and, in its GIS/ folder, two SYNTHETIC GeoJSON
// point layers written around the study's anchor (EPSG:3844, the graph's own
// grid): no survey of the site is read.
//
// SD.door      — MICRO-COR11: the lab's door is gone (no row menu entry, no
//                drop on the graph); «Porta dentro…» takes the GeoJSON (12
//                points, the graph's CRS), the survey stamps its layer, the
//                site is made in the same step and the layer hangs from it;
//                ⌘Z takes the whole act back; the second file finds the site;
//                the site's chip in the Matrix bar with its glyph
// SD.footprint — the footprint from the proxies of SU001–SU004: a POLYGON Z in
//                EPSG:3844 on the site, its chain (extractor extracted_from the
//                four geometry properties)
// SD.space     — in the Space the footprint's outline on the ground; «Site»
//                hides and shows it
// SD.roundtrip — the em.json written by EMStudio, read by s3Dgraphy: the site,
//                the footprint, the layers and their edges come back (no edge
//                degraded to generic_connection)
import { execFileSync } from "node:child_process";

export function register({ test, browser, PORT, benchFile, workspace, readFileSync, existsSync }) {
  const V4 = benchFile("SITE_V4");
  const BR = process.env.SITE_BRIDGE ?? process.env.BRIDGE;
  const GIS = V4.replace(/\/EM\/[^/]+$/, "/GIS");
  const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  let shared = null;   // one page through the four cases (the act builds on the act)

  const page = async () => {
    if (shared) return shared;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    await p.addInitScript(() => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); sessionStorage.setItem("probe", "1"); } } catch {} });
    await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BR)}`);
    await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
    await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(V4, "utf8")), V4]);
    await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
    shared = { p, ctx, errors };
    return shared;
  };
  const doc = (p) => p.evaluate(() => JSON.parse(window.__EM_DRAG__.docJson()));
  const graphOf = (d) => d.graph ?? Object.values(d.graphs ?? {}).find((g) => (g.nodes ?? []).length > 50) ?? Object.values(d.graphs ?? {})[0];
  const site = (p) => p.evaluate(() => window.__siteDoor());

  test("SD.door", "Sito (sperimentale) · la porta è «Porta dentro…» (MICRO-COR11: la porta del lab tolta): un GeoJSON sintetico (12 punti, il CRS del grafo) con il rilievo che lo timbra e il sito creato nello stesso passo, lo strato gis_layer appeso al sito, ⌘Z toglie l'atto intero; il secondo file trova il sito; il chip del sito col glifo nella barra della Matrix; nessuna voce «Porta nel grafo…» né drop sul grafo", async () => {
    if (!existsSync(V4)) return { pass: false, detail: { missing: V4 } };
    const { p, errors } = await page();
    const out = {};
    // the lab's door is gone: no row menu entry «Bring into the graph…»
    await workspace(p, "assets");
    await p.evaluate((dir) => window.__EM_DRAG__.storageGo(dir), GIS);
    await p.waitForTimeout(1200);
    const row = p.locator(".storage-row", { has: p.locator(".storage-name", { hasText: /^points_a\.geojson$/ }) }).first();
    await row.click({ button: "right" });
    out.oldMenu = await p.locator('.storage-row-menu button[data-act="site-door"]').count();
    await p.keyboard.press("Escape");
    await workspace(p, "canvas");
    const door = async (name) => {
      await p.evaluate((f) => { void window.__EM_DRAG__.portaDentro([f]); }, { path: `${GIS}/${name}`, name });
      await p.waitForSelector('[data-app-dialog="door"] [data-door-survey]', { timeout: 20000 });
      return p.evaluate(() => {
        const d = document.querySelector('[data-app-dialog="door"]');
        const shown = (sel) => { const r = d.querySelector(sel)?.closest(".door-row"); return !!r && !r.classList.contains("hidden"); };
        const sr = d.querySelector("[data-door-site-name]")?.closest(".door-row") ?? d.querySelector(".door-row[data-door-site]");
        return { survey: shown("[data-door-survey]"), siteRow: !!sr && !sr.classList.contains("hidden"),
          newSite: !!d.querySelector("[data-door-site-name]"), siteText: sr?.textContent ?? "" };
      });
    };
    const fillGo = (vals) => p.evaluate((v) => {
      const d = document.querySelector('[data-app-dialog="door"]');
      for (const [sel, x] of Object.entries(v)) { const f = d.querySelector(sel); if (f) { f.value = x; f.dispatchEvent(new Event("input", { bubbles: true })); } }
      d.querySelector("[data-dialog-ok]")?.click();
    }, vals);
    out.dialog = await door("points_a.geojson");
    const nBefore = graphOf(await doc(p)).nodes.length;
    await fillGo({ "[data-door-survey]": "Topographic survey", "[data-door-site-name]": "Site A", "[data-dialog-input]": "2024" });
    await p.waitForFunction(() => window.__siteDoor()?.site && (window.__siteDoor()?.layers?.length ?? 0) >= 1, null, { timeout: 30000 });
    let g = graphOf(await doc(p));
    const s = g.nodes.find((n) => n.node_type === "LocationNodeGroup" && n.data?.level === "sito");
    const layer = g.nodes.find((n) => n.node_type === "resource" && n.data?.url_type === "gis_layer");
    const sheet = layer && g.nodes.find((n) => g.edges.some((e) => e.source === layer.id && e.target === n.id && e.edge_type === "has_file"));
    out.site = s && { name: s.name, kind: s.data.kind };
    out.sheet = sheet && { crs: sheet.data?.crs, format: sheet.data?.gis_format, count: sheet.data?.feature_count };
    out.link = g.edges.filter((e) => e.source === s?.id && e.target === layer?.id).map((e) => e.edge_type);
    out.capture = g.edges.filter((e) => e.target === layer?.id && e.edge_type === "dtc_had_output")
      .map((e) => g.nodes.find((n) => n.id === e.source)?.data?.dtc_kind);
    out.added = g.nodes.length - nBefore;
    // ⌘Z: the whole act, one step
    await p.evaluate(() => window.__EM_DRAG__.undo());
    await p.waitForTimeout(500);
    out.afterUndo = graphOf(await doc(p)).nodes.length - nBefore;
    await p.evaluate(() => window.__EM_DRAG__.redo());
    await p.waitForTimeout(500);
    out.afterRedo = graphOf(await doc(p)).nodes.length - nBefore;
    // a Storage file dragged onto the Matrix: no door any more (the graph is not a drop target)
    out.graphDrop = await p.evaluate((path) => {
      const area = [...document.querySelectorAll(".tile-area")].find((a) => a.querySelector("canvas")) ?? document.querySelector(".tile-area");
      const dt = new DataTransfer();
      dt.setData("application/x-em-storage-entry", JSON.stringify({ path, type: "file", name: "points_b.geojson", ext: "geojson" }));
      const ev = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt });
      area.dispatchEvent(ev);
      area.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      return { accepted: ev.defaultPrevented };
    }, `${GIS}/points_b.geojson`);
    await p.waitForTimeout(800);
    out.graphDrop.dialog = await p.locator('[data-app-dialog="door"]').count();
    // the second file through «Porta dentro…»: the site found
    out.second = await door("points_b.geojson");
    await fillGo({ "[data-door-survey]": "Topographic survey", "[data-dialog-input]": "2024" });
    await p.waitForFunction(() => window.__siteDoor()?.layers?.length === 2, null, { timeout: 30000 });
    await p.waitForTimeout(600);
    out.chip = await p.evaluate(() => { const c = document.querySelector(".site-chip");
      return c ? { text: c.textContent, glyph: !!c.querySelector(".site-glyph") } : null; });
    const conds = {
      oldDoorGone: out.oldMenu === 0 && !out.graphDrop.accepted && out.graphDrop.dialog === 0,
      asked: out.dialog.survey && out.dialog.siteRow && out.dialog.newSite,
      site: out.site?.name === "Site A" && out.site.kind === "toponym",
      sheet: out.sheet?.crs === "EPSG:3844" && out.sheet.format === "geojson" && out.sheet.count === 12,
      link: out.link.length === 1 && out.link[0] === "has_linked_resource",
      stamped: out.capture.length === 1 && out.capture[0] === "topographic",
      oneStep: out.added > 2 && out.afterUndo === 0 && out.afterRedo === out.added,
      second: out.second.siteRow && !out.second.newSite && /Site A/.test(out.second.siteText),
      chip: !!out.chip && /Site A/.test(out.chip.text) && out.chip.glyph && /2 layers/.test(out.chip.text),
      noErrors: !errors.length,
    };
    return { pass: Object.values(conds).every(Boolean), detail: { conds, out, errors } };
  });

  test("SD.footprint", "Sito (sperimentale) · l'impronta dai proxy di SU001–SU004 (dal menu del chip): POLYGON Z in EPSG:3844 sul sito, con la catena (estrattore extracted_from le quattro geometrie)", async () => {
    if (!existsSync(V4)) return { pass: false, detail: { missing: V4 } };
    const { p, errors } = await page();
    await workspace(p, "canvas");
    await p.click(".site-chip");
    await p.click('.site-menu button[data-act="site-footprint"]');
    await p.waitForSelector('.modal[data-dialog="site-footprint"] input[data-field="units"]');
    await p.fill('.modal[data-dialog="site-footprint"] input[data-field="units"]', "SU001, SU002, SU003, SU004");
    await p.click('.modal[data-dialog="site-footprint"] button[data-act="footprint-go"]');
    await p.waitForFunction(() => !!window.__siteDoor()?.footprint, null, { timeout: 30000 });
    const st = await site(p);
    const g = graphOf(await doc(p));
    const fp = g.nodes.find((n) => n.id === st.footprint.propertyId);
    const ext = g.edges.find((e) => e.source === fp?.id && e.edge_type === "has_data_provenance")?.target;
    const from = g.edges.filter((e) => e.source === ext && e.edge_type === "extracted_from")
      .map((e) => g.nodes.find((n) => n.id === e.target)).map((n) => n?.data?.property_type ?? n?.name);
    const ring = st.footprint.rings[0];
    const out = { crs: st.footprint.crs, shape: st.footprint.shape, vertices: ring.length, from,
      onSite: g.edges.some((e) => e.source === st.site.id && e.target === fp?.id && e.edge_type === "has_property"),
      wkt: String(fp?.data?.value ?? "").slice(0, 60) };
    const conds = {
      polygon: out.crs === "EPSG:3844" && out.shape === "POLYGON Z" && out.vertices >= 4 && out.wkt.startsWith("<http://www.opengis.net/def/crs/EPSG/0/3844> POLYGON Z"),
      onSite: out.onSite,
      chain: out.from.length === 4 && out.from.every((x) => x === "geometry"),
      noErrors: !errors.length,
    };
    return { pass: Object.values(conds).every(Boolean), detail: { conds, out, errors } };
  });

  test("SD.space", "Sito (sperimentale) · nello Spazio il contorno dell'impronta a terra; «Sito» lo nasconde e lo rimostra", async () => {
    if (!existsSync(V4)) return { pass: false, detail: { missing: V4 } };
    const { p, errors } = await page();
    await workspace(p, "space");
    await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 120000 });
    await p.waitForTimeout(1500);
    const count = () => p.evaluate(() => [...document.querySelectorAll(".scn-mark")].filter((g) => (g.dataset.mark ?? "").startsWith("site:fp")).length);
    const out = { before: await count(), toggle: await p.evaluate(() => !!document.querySelector(".scn-bar [data-site-toggle]")) };
    if (out.toggle) {
      await p.evaluate(() => document.querySelector(".scn-bar [data-site-toggle]").click());
      await p.waitForTimeout(800);
      out.hidden = await count();
      await p.evaluate(() => document.querySelector(".scn-bar [data-site-toggle]").click());
      await p.waitForTimeout(800);
      out.again = await count();
    }
    if (process.env.SHOTS) await p.locator(".scn-host").first().screenshot({ path: `${process.env.SHOTS}/SD.space.png` });
    const conds = { outline: out.before === 1, toggle: out.toggle && out.hidden === 0 && out.again === 1, noErrors: !errors.length };
    return { pass: Object.values(conds).every(Boolean), detail: { conds, out, errors } };
  });

  test("SD.roundtrip", "Sito (sperimentale) · il round trip: l'em.json scritto da EMStudio, letto da s3Dgraphy, ridà il sito (level sito), l'impronta, i due layer e i loro archi; nessun arco degradato a generic_connection", async () => {
    if (!existsSync(V4)) return { pass: false, detail: { missing: V4 } };
    const { p, ctx, errors } = await page();
    const text = await p.evaluate(() => window.__EM_DRAG__.docJson());
    await ctx.close();
    shared = null;
    const py = `${S3D}.venv/bin/python`;
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(`${S3D}src`)})
from s3dgraphy import api
from s3dgraphy.gis import site_of, footprint_of, gis_layers
from s3dgraphy.exporter.emjson_exporter import build_emjson
doc = json.loads(sys.stdin.read())
g, w = api.load_emjson(doc)
again, w2 = api.load_emjson(json.loads(json.dumps(build_emjson(g))))
s = site_of(again)
fp = footprint_of(again, s.node_id) if s else None
def edges_of(d):
    if d.get("graph"): return d["graph"]["edges"]
    return [e for v in d["graphs"].values() for e in v.get("edges", [])]
print(json.dumps({"site": s.name if s else None, "level": (s.attributes.get("level") or s.data.get("level")) if s else None,
  "footprint": fp["shape"] if fp else None, "crs": fp["crs"] if fp else None,
  "layers": sorted(n.name for n in gis_layers(again)),
  "generic": sum(1 for e in again.edges if e.edge_type == "generic_connection"),
  "generic_before": sum(1 for e in edges_of(doc) if e.get("edge_type") == "generic_connection"),
  "warnings": [x for x in w + w2 if "not allowed" in x or "generic" in x]}))
`;
    const out = JSON.parse(execFileSync(py, ["-c", script], { input: text, encoding: "utf8", maxBuffer: 1 << 28 }));
    const conds = {
      site: out.site === "Site A" && out.level === "sito",
      footprint: out.footprint === "POLYGON Z" && out.crs === "EPSG:3844",
      layers: out.layers.length === 2,
      noneDegraded: out.generic === out.generic_before && !out.warnings.length,
      noErrors: !errors.length,
    };
    return { pass: Object.values(conds).every(Boolean), detail: { conds, out } };
  });
}
