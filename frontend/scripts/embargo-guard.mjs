// MICRO-SEG30 (E.D., 22 Nov 2026) · THE RELEASE GUARD OF THE EMBARGO.
//
//   node scripts/embargo-guard.mjs [path…]          the community build: refuse
//   node scripts/embargo-guard.mjs --expect [path…] the lab build: every marker there
//   node scripts/embargo-guard.mjs --expect --bundle [path…]   …only the bundle's markers
//                                                    (a dist-lab/ alone has no binary)
//   node scripts/embargo-guard.mjs --list           the markers, one per line
//
// The community build (what `./em.sh devrel` / `ghrelease` tag and release.yml
// builds) must neither contain nor show a function under embargo
// (src/features.ts). This looks, in the bundle (dist/index.html and whatever
// else is given) and in the binaries (the .app, the sidecar em-bridge), for the
// MARKERS of the embargo:
//
//   · one SENTINEL per function: `em-embargo:<id>`, for every entry of the
//     register's EMBARGO block (read from src/features.ts — publishing a
//     function, moving it out of the block, takes it out of the guard by itself);
//   · the i18n key of each one's title (`feat.<name>.title`);
//   · the embargo's own words: the key of its switch (`emstudio.embargo`), its
//     section's key (`settings.embargo`), the desktop's sentinel
//     (`em-embargo:desktop`, main.rs `--features lab`), and the module of the
//     lab's em.app APIs (`em_py_lab`, in the sidecar's table of modules).
//
// A path may be a file or a folder (read whole, every file in it: an .app is a
// folder). Bytes are searched as bytes, so a binary is read as it is. Exit:
// 0 clean · 1 a marker found (the release stops, with which marker and where)
// · 2 nothing to look at (a path missing: an unchecked build is not released).
// With `--expect` the opposite: 0 when EVERY marker is found somewhere (the lab
// build has them all), 1 when one is missing.
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FE = path.resolve(HERE, "..");

/** The EMBARGO block of the register, and its entries' ids and title keys. */
export function embargoEntries(src = fs.readFileSync(path.join(FE, "src/features.ts"), "utf8")) {
  const start = src.indexOf("const EMBARGO: readonly Feature[] = LAB ? [");
  if (start < 0) throw new Error("src/features.ts: the EMBARGO block (`const EMBARGO: readonly Feature[] = LAB ? [`) is not there");
  const end = src.indexOf("] : [];", start);
  if (end < 0) throw new Error("src/features.ts: the EMBARGO block does not end with `] : [];`");
  const block = src.slice(start, end);
  const entries = [...block.matchAll(/\{\s*id:\s*"([^"]+)",\s*state:\s*"([^"]+)",\s*title:\s*"([^"]+)"[^}]*sentinel:\s*"([^"]+)"/g)]
    .map((m) => ({ id: m[1], state: m[2], title: m[3], sentinel: m[4] }));
  return { block, start, end, entries };
}

/** Every marker the community build must not contain. */
export function markers(src) {
  const { entries } = embargoEntries(src);
  const out = [];
  for (const e of entries) {
    out.push({ marker: e.sentinel, what: `the sentinel of «${e.id}»`, in: "bundle" });
    out.push({ marker: e.title, what: `the title of «${e.id}» (i18n key)`, in: "bundle" });
  }
  out.push({ marker: "emstudio.embargo", what: "the key of the embargo's switch (Preferences ▸ Advanced)", in: "bundle" });
  out.push({ marker: "settings.embargo", what: "the embargo's section of the Preferences (i18n key)", in: "bundle" });
  out.push({ marker: "em-embargo:desktop", what: "the desktop's sentinel (main.rs, --features lab)", in: "binary" });
  out.push({ marker: "em_py_lab", what: "the lab's em.app APIs (tools/em_py_lab.py, in the sidecar)", in: "binary" });
  return out;
}

function* filesUnder(p) {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p).sort()) yield* filesUnder(path.join(p, name));
  } else if (st.isFile()) {
    yield p;
  }
}

/** Where each marker is: [{marker, what, file}] */
export function scan(paths, list = markers()) {
  const found = [];
  const needles = list.map((m) => ({ ...m, bytes: Buffer.from(m.marker, "utf8") }));
  let files = 0;
  for (const root of paths) {
    for (const f of filesUnder(root)) {
      files++;
      const buf = fs.readFileSync(f);
      for (const n of needles) if (buf.indexOf(n.bytes) >= 0) found.push({ marker: n.marker, what: n.what, file: f });
    }
  }
  return { found, files };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const expect = args.includes("--expect");
  if (args.includes("--list")) {
    for (const m of markers()) console.log(`${m.marker}\t${m.what}`);
    process.exit(0);
  }
  let paths = args.filter((a) => !a.startsWith("--"));
  if (!paths.length) paths = [path.join(FE, "dist/index.html")];
  const missing = paths.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.error(`✗ embargo guard: nothing to look at — ${missing.join(", ")} does not exist. An unchecked build is not released: build it first.`);
    process.exit(2);
  }
  const list = markers().filter((m) => !(expect && args.includes("--bundle") && m.in !== "bundle"));
  const { found, files } = scan(paths, list);
  if (expect) {
    const seen = new Set(found.map((f) => f.marker));
    const absent = list.filter((m) => !seen.has(m.marker));
    if (absent.length) {
      console.error(`✗ embargo guard (--expect): the lab build lacks ${absent.length} marker(s):\n`
        + absent.map((m) => `    ${m.marker} — ${m.what}`).join("\n"));
      process.exit(1);
    }
    console.log(`✓ embargo guard (--expect): all ${list.length} markers in ${files} file(s)`);
    process.exit(0);
  }
  if (found.length) {
    console.error(`✗ EMBARGO: the community build contains ${found.length} marker(s) of the functions under embargo — the release stops here.\n`
      + found.map((f) => `    ${f.marker} — ${f.what}\n      in ${f.file}`).join("\n")
      + `\n  A function under embargo is only in EMStudio lab (./em.sh build --lab). Look for code that reaches it without\n`
      + `  \`LAB\` / \`featureOn\` (frontend/src/features.ts), a text outside i18n.ts's LAB_TEXTS blocks, a sidecar built\n`
      + `  with EM_LAB=1 or a desktop built with --features lab. To PUBLISH a function, change its state in the register.`);
    process.exit(1);
  }
  console.log(`✓ embargo guard: none of the ${list.length} markers in ${files} file(s) — the community build holds no function under embargo`);
}
