// MICRO-COR01 · the texts that came OUT of hand-written code and INTO the
// dictionary stay there.
//
//   node scripts/check-dizionario.mjs
//
// check-i18n.mjs sweeps for Italian words; it cannot see an English sentence
// written by hand, and that is how the other seven languages ended up reading
// «Delete connector», «Group into Activity group» or a StratiMiner panel in
// English (MICRO-COR00, section A: «12 checks passed» with all of them out).
//
// Two measures, both simple on purpose:
//
//   1. a SWEEP of the files whose every visible string now goes through `t()`
//      (stratiminer.ts, inspector.ts, narrative-inspector.ts): a literal with a
//      word in it, put where the page shows it — the third argument of `el()`,
//      `.textContent` / `.title` / `.placeholder` =, `toast(…)`, the text
//      between two tags of an HTML template, or a capitalised phrase anywhere in
//      the code — is a finding. A notation that is the same in every language
//      (`#RRGGBB`, `ORCID`) is declared with `ALLOW-TEXT` in a comment on its
//      line: a declaration, not a silencer;
//   2. for main.ts, too large to sweep this way today, the exact literals
//      section A took out must not come back, and the places that now read the
//      dictionary keep reading it.
//
// Then the keys themselves: every key the swept files and the guarded places
// name exists in English and in Italian.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got, null, 1)}`);
  checks++;
};

const SRC = new URL("../src/", import.meta.url);
const read = (name) => readFileSync(new URL(name, SRC), "utf8");

/** Comments blanked to spaces, line numbers kept: check-i18n.mjs's walker
 *  (templates with `${…}` depth, regex literals), copied as it is. */
function blankComments(src) {
  // UTF-16 units, the same the indices below count in: `[...src]` split by code
  // point, so every emoji before a comment shifted the blanking one place (the
  // 🖼/📄/📁 of the Storage made the comments past them half-blanked, measured)
  const out = src.split("");
  const n = src.length;
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    if (src.startsWith("//", i)) {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
      continue;
    }
    if (src.startsWith("/*", i)) {
      let j = src.indexOf("*/", i);
      j = j < 0 ? n : j + 2;
      blank(i, j);
      i = j;
      continue;
    }
    // a REGEX literal: `/…/` can contain quotes and backticks (measured — a
    // `.replace(/`([^`]+)`/g, …)` sent the scan into a phantom template literal
    // and every comment after it read as code). A `/` right after an operator or
    // an opening bracket is a regex; after a value it is a division.
    if (src[i] === "/" && /[(,=:[!&|?{};+\n]\s*$/.test(src.slice(Math.max(0, i - 12), i))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j += 1;
      }
      if (src[j] === "/") { i = j + 1; continue; }
    }
    if (src[i] === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"' && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      i = src[j] === '"' ? j + 1 : i + 1;   // an unterminated quote is not a string
      continue;
    }
    if (src[i] === "`") {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src.startsWith("${", j)) { depth += 1; j += 2; continue; }
        if (depth > 0 && src[j] === "}") { depth -= 1; j += 1; continue; }
        if (depth === 0 && src[j] === "`") break;
        j += 1;
      }
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

// a word of prose: three letters or more (a lone «A», «→», «…» are not words)
const WORD = /[A-Za-zÀ-ÿ]{3,}/;
const withoutInterp = (s) => s.replace(/\$\{[^}]*\}/g, "");

/** The template literals of `code`, as [offset, body] with every `${…}` blanked
 *  to spaces (newlines kept), outermost only. */
function templates(code) {
  const out = [];
  const n = code.length;
  let i = 0;
  while (i < n) {
    if (code[i] === '"') {
      let j = i + 1;
      while (j < n && code[j] !== '"' && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
      i = j + 1; continue;
    }
    if (code[i] !== "`") { i += 1; continue; }
    const start = i + 1;
    let j = start;
    let body = "";
    let depth = 0;
    while (j < n) {
      if (code[j] === "\\") { body += depth ? "  " : code.slice(j, j + 2); j += 2; continue; }
      if (code.startsWith("${", j)) { depth += 1; body += "  "; j += 2; continue; }
      if (depth > 0) {
        if (code[j] === "{") depth += 1;
        else if (code[j] === "}") depth -= 1;
        body += code[j] === "\n" ? "\n" : " ";
        j += 1; continue;
      }
      if (code[j] === "`") break;
      body += code[j];
      j += 1;
    }
    out.push([start, body.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "))]);
    i = j + 1;
  }
  return out;
}

/** The findings of one file, as `file:line: text`. */
function sweep(name) {
  const raw = read(name).split("\n");
  const code = blankComments(read(name));
  const lines = code.split("\n");
  const findings = [];
  const add = (i, why) => {
    if (/ALLOW-TEXT/.test(raw[i])) return;
    findings.push(`${name}:${i + 1}: ${why}: ${raw[i].trim().slice(0, 80)}`);
  };
  const SINK = /(?:\bel\(\s*"[\w-]+"\s*,\s*(?:"[^"]*"|undefined)\s*,\s*|\.(?:textContent|title|placeholder|innerText)\s*=\s*|\btoast\(\s*|setAttribute\(\s*"(?:title|aria-label|placeholder)"\s*,\s*)(["`])((?:[^"`\\]|\\.)*?)\1/g;
  lines.forEach((line, i) => {
    for (const m of line.matchAll(SINK))
      if (WORD.test(withoutInterp(m[2]))) add(i, "a literal shown as it is");
    // a capitalised phrase in a string: «Move this phase up», «Phase bands»
    for (const m of line.matchAll(/"([A-Z][a-z]* [^"]*[a-z]{3,}[^"]*)"/g))
      add(i, "a phrase in the code");
  });
  // the MARKUP of a template literal: the text between two tags (`>Choose a
  // folder<`) and a line that is only words (a paragraph of the panel)
  for (const [from, body] of templates(code)) {
    if (!/<\w/.test(body) || !body.includes("\n")) continue;     // markup, not a class name
    const before = code.slice(0, from).split("\n").length - 1;
    body.split("\n").forEach((line, k) => {
      const i = before + k;
      for (const m of line.matchAll(/>([^<>]*)</g))
        if (WORD.test(m[1])) add(i, "text inside the markup");
      const bare = line.trim();
      if (/^[A-Za-z][^<>=]*[a-z]{3,}[^<>=]*$/.test(bare) && /\s/.test(bare)) add(i, "a line of prose in the markup");
    });
  }
  return findings;
}

const SWEPT = ["stratiminer.ts", "inspector.ts", "narrative-inspector.ts"];
{
  const findings = SWEPT.flatMap(sweep);
  eq(findings, [], "sweep · no visible English written by hand in the swept files " +
     "(pass it through `t()`, English as the value and Italian as the translation)");
}

// ── 2 · main.ts: what section A took out does not come back ─────────────────
const main = read("main.ts");
{
  const GONE = [
    ["StratiMiner: estrazione in corso", "the StratiMiner toasts"],
    ["Prompt StratiMiner copiato", "the StratiMiner toasts"],
    ["Estrazione non riuscita", "the StratiMiner report"],
    ["Prompt non disponibile", "the StratiMiner report"],
    ["Il browser ha negato", "the StratiMiner report"],
    ["Prompt salvato come", "the StratiMiner toasts"],
    ["em_data.xlsx scritta", "the StratiMiner toasts"],
    ["Group into ${", "«Group into …»"],
    ["No legal group for this selection", "«No legal group…»"],
    ["Rinomina a ", "«Rinomina a …» in the English menu"],
    ["Incolla prima la key", "the AI key toasts"],
    ["Key salvata", "the AI key toasts"],
    ["Key rimossa", "the AI key toasts"],
    ["Key di sessione rimossa", "the AI key toasts"],
    ['["docx", "DOCX"', "«DOCX» in the Publish menu"],
    ['["ipynb", "Jupyter"', "«Jupyter» in the Publish menu"],
    ["o.textContent = sc;", "the Fence menu shows own-study / own-HDT / other-HDT"],
    ["label: id, n })", "Unit type shows the datamodel ids"],
    ["already exists`", "«… already exists»"],
    ["say.textContent = ans.say_it", "the «Consolidate for…» line said in s3Dgraphy's Italian"],
    ["edgeTypeLabel(", "the relations said with the datamodel's English label"],
  ];
  const back = GONE.filter(([lit]) => main.includes(lit)).map(([lit, what]) => `${what}: ${lit}`);
  eq(back, [], "main.ts · the literals section A took out are not written again");

  // …and the places that replaced them still read the dictionary
  ok(/o\.textContent = t\(`shelf\.scope\.\$\{sc\}`\)/.test(main),
     "main.ts · the Fence menu says the Shelf's words (shelf.scope.*)");
  ok(/label: datamodelTypeLabel\(id\) \|\| id, title: id/.test(main),
     "main.ts · Unit type says the type's name, its id in the tooltip");
  ok(/createTextNode\(" " \+ edgeLabel\(et\)\)/.test(main),
     "main.ts · the handle's menu says the relation in the page's language (datamodel_translations)");
  ok(/function mediaRoleLabel\(/.test(main) && !/\broleLabel\([^)]*\blang\)/.test(main),
     "main.ts · a media role is said through the dictionary (media.role.*), not it/en only");
  ok(/say\.textContent = assetCountsSay\(ans\.counts\)/.test(main),
     "main.ts · «Consolidate for…» composes its line from the counts, in the page's language");
}

// ── 3 · every key named exists in English and in Italian ────────────────────
const i18n = read("i18n.ts");
const dict = (name) => {
  const from = i18n.indexOf(`const ${name}: Dict = {`);
  const to = i18n.indexOf("\n};", from);
  return new Set([...i18n.slice(from, to).matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]));
};
const EN = dict("EN");
const IT = dict("IT");
{
  const named = new Set();
  for (const f of [...SWEPT, "main.ts"]) {
    const src = read(f);
    for (const m of src.matchAll(/\bt\(\s*"((?:sm|ctx|insp|ai|fmt|ninsp|media|al|edge)\.[\w.-]*\w)"\s*[,)]/g)) named.add(m[1]);
  }
  for (const m of main.matchAll(/\btn\(\s*"((?:sm|ctx|al)\.[\w.]+)"/g)) named.add(`${m[1]}.other`);
  for (const id of ["photogrammetry", "frontispiece", "detail", "vector_drawing", "raster_drawing",
                    "model_3d", "orthophoto", "archival_documentation"]) named.add(`media.role.${id}`);
  for (const sc of ["own-study", "own-HDT", "other-HDT"]) named.add(`shelf.scope.${sc}`);
  ok(named.size > 80, `keys · the keys named by the swept files and main.ts are found (${named.size})`);
  eq([...named].filter((k) => !EN.has(k)), [], "keys · every key named has its English");
  eq([...named].filter((k) => !IT.has(k)), [], "keys · every key named has its Italian");
}

// the media roles of the dictionary are the base vocabulary of media.ts, no more, no less
{
  const media = read("media.ts");
  const base = [...media.slice(media.indexOf("BASE_ROLES"), media.indexOf("];", media.indexOf("BASE_ROLES")))
    .matchAll(/\["(\w+)"/g)].map((m) => m[1]);
  const dictRoles = [...EN].filter((k) => k.startsWith("media.role.")).map((k) => k.slice(11));
  eq(dictRoles.sort(), [...base].sort(), "media roles · one key per base concept of em-media-role");
}

console.log(`dizionario: ${checks} checks passed`);
