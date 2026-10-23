// MICRO-SERVSF-FINE-ISTANZE p.1 · the series of Virtual Special Finds (serVSF,
// node datamodel 1.6.35) in the interface: its glyph (the series ellipse with the
// VSF's border, the VSF's drawings shared through `FILE_ALIAS`), born from the
// «Aggiungi» menu as the other series, a virtual special find for the Tabular,
// the Inspector, the liquid view and the narrative; the new definitions of SF,
// RSF («Repositioned Special Find») and VSF in the tooltips and the help.
//
//   node scripts/check-servsf.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseHTML } from "linkedom";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { window, document } = parseHTML(`<!doctype html><html><body></body></html>`);
globalThis.window = window;
globalThis.document = document;

const SRC = new URL("../src/", import.meta.url).pathname;
// `import.meta.glob` is Vite's: the icons are listed from the folder they are
// vendored to, each «url» its own basename — the resolution is icons.ts's own
const ICONS = Object.fromEntries(readdirSync(`${SRC}assets/icons2d`).filter((f) => /\.(svg|png)$/.test(f))
  .map((f) => [`./assets/icons2d/${f}`, `url:${f}`]));
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { iconUrlFor, styleKeyFor } from "./icons";
      export { SECTIONS, contextTable } from "./add-menu";
      export { typeLabel, typeDescription, isVirtualType, isStratigraphicType, classOf } from "./rules";
      export { nodeStyle, styledNodeTypes } from "./palette";
      export { discStyle } from "./views/liquid";
      export { setLocale } from "./i18n";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [{
    name: "glob",
    setup(build) {
      build.onLoad({ filter: /icons\.ts$/ }, (a) => {
        const src = readFileSync(a.path, "utf8")
          .replace(/import\.meta\.glob\("\.\/assets\/icons2d\/\*\.\{png,svg\}"[\s\S]*?\)/, JSON.stringify(ICONS))
          .replace(/import\.meta\.glob\("\.\/assets\/dtc-glyphs\/\*\.svg"[\s\S]*?\)/, "{}");
        return { contents: src, loader: "ts" };
      });
    },
  }],
});
const M = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── the glyph: the VSF's drawing, the series' ellipse, the VSF's border ───────
{
  eq(M.iconUrlFor("serVSF"), "url:VSF.svg", "serVSF is drawn with the VSF's vector (FILE_ALIAS)");
  eq(M.iconUrlFor("VSF"), "url:VSF.svg", "the VSF keeps its own");
  eq(M.iconUrlFor("serUSVs"), "url:serUSVs.svg", "the other series keep theirs");
  const s = M.nodeStyle("serVSF"), v = M.nodeStyle("VSF"), ser = M.nodeStyle("serSU");
  eq(s.shape, ser.shape, "serVSF has the series' shape");
  eq(s.shape, "ellipse", "…an ellipse");
  eq([s.border, s.fill], [v.border, v.fill], "with the VSF's border and fill");
  eq(s.border.toUpperCase(), "#B19F61", "the VSF's gold border");
  ok(M.styledNodeTypes().includes("serVSF"), "the legend (styled node types) lists serVSF");
}

// ── born from the menu as the other series ────────────────────────────────────
{
  const series = M.SECTIONS.find((x) => x.label === "Series");
  ok(series.types.includes("serVSF"), "«Series» offers serVSF");
  eq(series.types.slice(0, 4), ["serSU", "serUSVn", "serUSVs", "serUSD"], "after the four it had");
  const row = M.contextTable().find((r) => r.nodeType === "serVSF" || r.type === "serVSF");
  ok(!!row, "the context table has a row for serVSF");
}

// ── a virtual special find, for every reader of the classes ──────────────────
{
  ok(M.isStratigraphicType("serVSF"), "serVSF is stratigraphic (Tabular: Units)");
  ok(M.isVirtualType("serVSF"), "…virtual (the continuity: «Survives until…»)");
  eq(M.classOf("serVSF"), "SeriesOfVirtualSpecialFindUnit", "its class");
  eq(M.discStyle("serVSF").ring, M.discStyle("VSF").ring, "the liquid view rings it as a VSF");
  const nar = readFileSync(`${SRC}narrative-embeds.ts`, "utf8");
  ok(/const VIRTUAL = \/\^\([^)]*serVSF/.test(nar), "the narrative's certainty reads serVSF as virtual");
}

// ── the definitions of 1.6.34 / 1.6.35 in the tooltips and the help ──────────
{
  M.setLocale("en");
  eq(M.typeLabel("RSF"), "Repositioned Special Find", "RSF reads «Repositioned Special Find»");
  ok(/movable/i.test(M.typeDescription("SF")) && !/original position unknown/i.test(M.typeDescription("SF")),
    "SF: movable, defined in positive");
  ok(/immovable|fixed/i.test(M.typeDescription("RSF")), "RSF: fixed, immovable");
  ok(/two roles|holds|completes/i.test(M.typeDescription("VSF")), "VSF: the two roles");
  ok(/repetition/i.test(M.typeDescription("serVSF")), "serVSF: the repetition of one equal object");
  ok(M.typeLabel("serVSF").length > 0 && M.typeLabel("serVSF") !== "serVSF", `serVSF has a label (${M.typeLabel("serVSF")})`);
  M.setLocale("it");
  ok(M.typeLabel("serVSF") !== M.typeLabel("VSF"), `in Italian too: «${M.typeLabel("serVSF")}»`);
  ok(M.typeDescription("RSF").length > 0, "RSF has its Italian description");
  M.setLocale("en");
}

console.log(`check-servsf: ${checks} checks passed`);
