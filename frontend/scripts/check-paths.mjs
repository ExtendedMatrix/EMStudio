// MICRO-PERCORSI-WINDOWS · executable check of `src/paths.ts` — the one module
// for the paths of files — on POSIX, Windows (`C:\`, `C:/`), UNC
// (`\\server\share`), spaces, accents, `@`, `#`; then of the addresses the
// viewer builds from a Windows em.json (Templu Mare v4's own locators); then
// the rule that keeps it the only one: no new `lastIndexOf("/")` (nor the
// other ad hoc cuts) on a file path anywhere else in `src/`.
//
//   node scripts/check-paths.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as P from "./paths"; export * as R from "./representation"; export * as Res from "./resources";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const { P, R, Res } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

// ── toPosix / isAbsolute / rootOf ───────────────────────────────────────────
eq(P.toPosix("C:\\Users\\ed\\EM\\x.em.json"), "C:/Users/ed/EM/x.em.json", "toPosix: a Windows path");
eq(P.toPosix("c:\\Users"), "C:/Users", "toPosix: the drive letter upper-case");
eq(P.toPosix("\\\\nas\\scavi\\TM\\x.glb"), "//nas/scavi/TM/x.glb", "toPosix: UNC");
eq(P.toPosix("\\\\?\\C:\\very\\long"), "C:/very/long", "toPosix: the verbatim prefix dropped");
eq(P.toPosix("\\\\?\\UNC\\nas\\scavi\\x"), "//nas/scavi/x", "toPosix: the verbatim UNC prefix");
eq(P.toPosix("/Users/ed/x"), "/Users/ed/x", "toPosix: POSIX untouched");
for (const [p, abs] of [["/a", true], ["C:\\a", true], ["C:/a", true], ["\\\\nas\\s\\a", true], ["//nas/s/a", true],
                        ["../RB/x.glb", false], ["proxies/SU002.glb", false], ["DosCo\\D.02.jpg", false], ["", false], ["~/x", false]])
  eq(P.isAbsolute(p), abs, `isAbsolute(${JSON.stringify(p)})`);
eq([P.rootOf("C:/a"), P.rootOf("//nas/s/a"), P.rootOf("/a"), P.rootOf("a")], ["C:/", "//nas/s/", "/", ""], "rootOf");
ok(P.hasScheme("https://x/y") && P.hasScheme("blend://../RB/a.blend#Mesh/x") && P.hasScheme("onedrive://D/x")
   && !P.hasScheme("C:/x") && !P.hasScheme("C:\\x"), "hasScheme: a scheme, not a drive letter");

// ── normalize / dirname / basename / join ───────────────────────────────────
eq(P.normalize("C:\\Users\\ed\\EM\\..\\RB\\.\\x.glb"), "C:/Users/ed/RB/x.glb", "normalize: Windows, .. and .");
eq(P.normalize("C:/../../x"), "C:/x", "normalize: never above the drive");
eq(P.normalize("//nas/s/../x"), "//nas/s/x", "normalize: never above the share");
eq(P.normalize("../../a//b/"), "../../a/b/", "normalize: a relative path keeps its .. and its trailing /");
eq(P.dirname("C:\\Users\\ed\\EM\\TempluMare_v4.em.json"), "C:/Users/ed/EM", "dirname: Windows");
eq(P.dirname("C:/x.em.json"), "C:/", "dirname: a file at the drive's root");
eq(P.dirname("/x.em.json"), "/", "dirname: a file at the POSIX root");
eq(P.dirname("//nas/scavi/x.em.json"), "//nas/scavi/", "dirname: a file at a share's root");
eq(P.dirname("x.em.json"), "", "dirname: a bare name has no folder");
eq(P.dirname("/a/b/tileset.json"), "/a/b", "dirname: POSIX");
eq(P.basename("C:\\Users\\ed\\EM\\TempluMare_v4.em.json"), "TempluMare_v4.em.json", "basename: Windows");
eq(P.basename("/a/RB/tiles/"), "tiles", "basename: a folder");
eq(P.leafName("https://x/y/P01%5Bext%5D.jpeg?v=2#a"), "P01[ext].jpeg", "leafName: a URL, decoded, without ?/#");
eq(P.join("C:/Users/ed/EM", "../RB/versions/x.glb"), "C:/Users/ed/RB/versions/x.glb", "join: up from a Windows folder");
eq(P.join("C:\\Users\\ed\\EM\\", "..\\RB\\x.glb"), "C:/Users/ed/RB/x.glb", "join: both Windows-shaped");
eq(P.join("", "x.obj"), "x.obj", "join: an empty base joins nothing (never /x.obj)");
eq(P.join("C:/a", "D:/b/x"), "D:/b/x", "join: an absolute part starts again");

// ── resolveRelative / relativeTo: the em.json and its locators ──────────────
const WIN = "C:\\Users\\Emanuel Demetrescu\\OneDrive - CNR\\T6.5\\TempluMare_v2_for_3DR_2026-10-06\\EM\\TempluMare_v4.em.json";
const WIN_DIR = "C:/Users/Emanuel Demetrescu/OneDrive - CNR/T6.5/TempluMare_v2_for_3DR_2026-10-06";
eq(P.resolveRelative(WIN, "../RB/versions/Architrave@lod0-aton-heriverse.glb"),
   `${WIN_DIR}/RB/versions/Architrave@lod0-aton-heriverse.glb`, "resolveRelative: ../RB from a Windows em.json, with @");
eq(P.resolveRelative(WIN, "proxies/SU002.glb"), `${WIN_DIR}/EM/proxies/SU002.glb`, "resolveRelative: beside it");
eq(P.resolveRelative(WIN, "DosCo/D.05 Diaconescu 2013 Templu Mare.pdf"),
   `${WIN_DIR}/EM/DosCo/D.05 Diaconescu 2013 Templu Mare.pdf`, "resolveRelative: spaces");
eq(P.resolveRelative(WIN, "DosCo\\Fotografía #3 è.jpg"), `${WIN_DIR}/EM/DosCo/Fotografía #3 è.jpg`, "resolveRelative: accents, #, a backslash");
eq(P.resolveRelative(WIN, "D:/altro/x.glb"), "D:/altro/x.glb", "resolveRelative: an absolute locator as it is");
eq(P.resolveRelative(WIN, "blend://../RB/TempluMare_2021.blend#Mesh/x"), "blend://../RB/TempluMare_2021.blend#Mesh/x", "resolveRelative: a scheme untouched");
eq(P.resolveRelative("\\\\nas\\scavi\\TM\\EM\\x.em.json", "../RB/a.obj"), "//nas/scavi/TM/RB/a.obj", "resolveRelative: on a share");
eq(P.resolveRelative(null, "../RB/a.obj"), "../RB/a.obj", "resolveRelative: no em.json, still relative");
eq(P.relativeTo(WIN, `${WIN_DIR}/RB/versions/x.glb`), "../RB/versions/x.glb", "relativeTo: up one");
eq(P.relativeTo(WIN, `${WIN_DIR.toLowerCase()}/em/proxies/SU002.glb`), "proxies/SU002.glb", "relativeTo: Windows ignores case");
eq(P.relativeTo("/Users/ed/T/EM/x.em.json", "/Users/ed/t/EM/a.glb"), "../../t/EM/a.glb", "relativeTo: POSIX keeps case");
eq(P.relativeTo(WIN, "D:/scavi/x.glb"), "D:/scavi/x.glb", "relativeTo: another drive stays absolute");
eq(P.relativeTo(WIN, "C:\\Users\\Emanuel Demetrescu\\Pictures\\D #2 è@.jpg"),
   "../../../../Pictures/D #2 è@.jpg", "relativeTo: up four, with #, accent, @");
for (const loc of ["../RB/versions/x@lod0.glb", "proxies/SU 002.glb", "DosCo/D.05 è #1.pdf", "../SB/cesium/TempluMare.3tz"])
  eq(P.relativeTo(WIN, P.resolveRelative(WIN, loc)), loc, `round trip ${loc}`);
ok(P.isInside(`${WIN_DIR}/EM`, `${WIN_DIR.toUpperCase()}/EM/DosCo/x.pdf`) && !P.isInside(`${WIN_DIR}/EM`, `${WIN_DIR}/EMx/a`),
   "isInside: Windows ignores case; a sibling with a longer name is not inside");
eq(P.toNative("C:/Users/ed/x.json"), "C:\\Users\\ed\\x.json", "toNative: a Windows path back to \\");
eq(P.toNative("//nas/s/x"), "\\\\nas\\s\\x", "toNative: UNC");
eq(P.toNative("/Users/ed/x.json"), "/Users/ed/x.json", "toNative: POSIX untouched");
eq(P.fsAtPath("C:\\Users\\ed\\OneDrive - CNR\\a#b@c.glb"), "C%3A/Users/ed/OneDrive%20-%20CNR/a%23b%40c.glb", "fsAtPath: a drive first");
eq(P.fsAtPath("//nas/scavi/x.glb"), "%5C%5Cnas/scavi/x.glb", "fsAtPath: a share marked by its backslashes");
eq(P.fsAtPath("/tmp/x y.glb"), "tmp/x%20y.glb", "fsAtPath: POSIX without its first /");

// ── the viewer's addresses from a Windows em.json (representation.ts) ───────
const g = Res.plainGraph({
  nodes: [
    { id: "rm1", node_type: "representation_model", name: "RM" },
    { id: "res1", node_type: "resource", name: "Architrave", data: { url: "../SB/versions/Architrave@lod0-aton-heriverse.glb", packaging: "file", kind: "3d_model" } },
  ],
  edges: [{ id: "e1", source: "rm1", target: "res1", edge_type: "has_representation" }],
});
const starts = Res.startResources ? Res.startResources(g, "rm1") : R.startResources(g, "rm1");
const choice = R.chooseModel(g, starts.length ? starts : ["res1"]);
ok(choice.kind === "open", "the fixture's resource opens on the web");
if (choice.kind === "open") {
  for (const [label, emjson, want] of [
    ["Windows", WIN, `/fs/at/C%3A/Users/Emanuel%20Demetrescu/OneDrive%20-%20CNR/T6.5/TempluMare_v2_for_3DR_2026-10-06/SB/versions/Architrave%40lod0-aton-heriverse.glb`],
    ["Mac", "/tmp/winpaths/EM/TempluMare_v4.em.json", "/fs/at/tmp/winpaths/SB/versions/Architrave%40lod0-aton-heriverse.glb"],
    ["UNC", "\\\\nas\\scavi\\TM\\EM\\TempluMare_v4.em.json", "/fs/at/%5C%5Cnas/scavi/TM/SB/versions/Architrave%40lod0-aton-heriverse.glb"],
  ]) {
    const m = R.addressMap(choice, { mode: "offline", baseDir: P.dirname(emjson), fileUrl: (abs) => `/fs/at/${P.fsAtPath(abs)}` });
    eq(m.modifier(m.entryUrl), want, `addressMap from a ${label} em.json: the model under the study`);
  }
}

// ── the rule: one module ────────────────────────────────────────────────────
// a cut or a join of a FILE path outside paths.ts is refused; a line that cuts a
// URL (not a path of the disk) says so with `paths:url`.
const AD_HOC = [
  [/lastIndexOf\(\s*["']\/["']\s*\)/, 'lastIndexOf("/")'],
  [/lastIndexOf\(\s*["']\\\\["']\s*\)/, 'lastIndexOf("\\\\")'],
  [/replace\(\/\[\^\/\\\\\]\*\$\//, "replace(/[^/\\\\]*$/ (the folder of a path)"],
  [/replace\(\/\[\\\\\/\]\[\^\\\\\/\]\*\$\//, "replace(/[\\\\/][^\\\\/]*$/ (the folder of a path)"],
  [/\/\^\\\/\/\.test\(/, "/^\\//.test( (absolute = starts with /)"],
  [/split\(\s*["']\/["']\s*\)\.pop\(\)/, 'split("/").pop() (a name cut on / alone)'],
];
const offenders = [];
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".ts") && x !== "paths.ts")) {
  readFileSync(SRC + f, "utf8").split("\n").forEach((line, i) => {
    if (/paths:url/.test(line)) return;
    for (const [re, what] of AD_HOC) if (re.test(line)) offenders.push(`${f}:${i + 1} ${what}`);
  });
}
eq(offenders, [], "no ad hoc cut of a file path outside paths.ts (a URL's line says `paths:url`)");

if (fails.length) {
  console.log(`check-paths: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-paths: ${checks} checks OK`);
