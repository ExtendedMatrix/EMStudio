// i18n · English is the DEFAULT and the COVERAGE is total.
//
//   node scripts/check-i18n.mjs
//
// Two facts, both of them E.D.'s decision of 21 Aug 2026 and both easy to lose
// again by writing one convenient literal:
//
//   1. the app starts in ENGLISH — always, and without asking the browser;
//   2. no user-visible string is Italian-only: every key the dictionaries carry
//      has an English value, and no Italian text is written by hand in the code.
//
// The second check is a SWEEP over the sources, and it is deliberately narrow:
// it looks for words that cannot occur in English prose (`nessuna`, `finestra`,
// `perché`…) inside string literals, with comments blanked out so a comment
// written in Italian — or an English one containing "per" — is not a finding.
//
// A genuinely non-UI literal (a developer diagnostic, an em.json field value, a
// datamodel token) can be exempted by putting `ALLOW-IT` in a comment on the same
// line. That is a declaration, not a silencer: it appears in the diff and it says
// somebody looked.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

/**
 * Comments blanked to spaces, so offsets (and line numbers) survive.
 *
 * Two details, both learned by measuring: a `'` is NOT treated as a string
 * delimiter (this codebase quotes with `"` and backticks, and a lone apostrophe
 * is nearly always inside prose — `c'è`, `don't`), and a template literal is
 * walked with `${…}` depth, because a quote inside an interpolation used to end
 * the literal early. Either mistake desynchronises the scan, and a desynchronised
 * scan reports comments as findings — which is how a sweep loses its credibility.
 */
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

const SRC = new URL("../src/", import.meta.url);
const read = (name) => readFileSync(new URL(name, SRC), "utf8");
const i18n = read("i18n.ts");

// ── 1 · English is the default, and the browser is not consulted ────────────
{
  ok(/DEFAULT_LOCALE[^=]*=\s*"en"/.test(i18n),
     "default · the default locale is declared, and it is English");
  const detect = i18n.slice(i18n.indexOf("function detect()"),
                            i18n.indexOf("let locale"));
  ok(detect.includes("return DEFAULT_LOCALE"),
     "default · with nothing stored, `detect` answers the default");
  ok(!/navigator\.language/.test(blankComments(i18n)),
     "default · the browser's language is NOT consulted (an Italian browser " +
     "used to open an Italian app: this project is written and read in English)");
  ok(detect.includes("localStorage.getItem"),
     "default · an explicit choice on this machine is still honoured");
}

// ── 2 · every key has an English value ─────────────────────────────────────
const dicts = (() => {
  const out = {};
  const heads = [...i18n.matchAll(/const (\w+): Dict = \{/g)];
  heads.forEach((h, i) => {
    const from = h.index;
    const to = i + 1 < heads.length ? heads[i + 1].index : i18n.length;
    out[h[1]] = new Map([...i18n.slice(from, to)
      .matchAll(/^\s*"([^"]+)":\s*("(?:[^"\\]|\\.)*")/gm)]
      .map((m) => [m[1], m[2]]));
  });
  return out;
})();
{
  ok(dicts.EN && dicts.EN.size > 300,
     `keys · the English dictionary is the reference (${dicts.EN?.size} keys)`);
  const missing = [];
  for (const [name, dict] of Object.entries(dicts)) {
    if (name === "EN") continue;
    for (const key of dict.keys()) if (!dicts.EN.has(key)) missing.push(`${name}:${key}`);
  }
  eq(missing, [], "keys · no key exists in another language and not in English");
  const empty = [...dicts.EN].filter(([, v]) => v.replace(/"/g, "").trim() === "");
  eq(empty.map(([k]) => k), [], "keys · no English value is empty");
  // …and the one locale that is also validated by a person answers every key
  const itGaps = [...dicts.EN.keys()].filter((k) => !dicts.IT.has(k));
  eq(itGaps, [], "keys · Italian, the other validated locale, is complete too");
}

// ── 3 · no Italian written by hand in the code ─────────────────────────────
//
// Words that do not occur in English prose. Kept short on purpose: a sweep that
// cries wolf gets switched off, and this one has to stay on.
const ITALIAN = new RegExp(String.raw`\b(?:nessun|nessuno|nessuna|questo|questa|quello|quella|della|dello|degli|delle|nella|nelle|senza|perch[eé]|pi[uù]|gi[aà]|apri|trascina|clicca|puoi|serve|sono|salva|scegli|seleziona|impostazioni|posizione|coordinate|epoca|epoche|grafo|narrativa|autore|autori|licenza|risorsa|risorse|verifica|attendi|errore|fallita|fallito|assente|vuoto|vuota|colonna|regione|collezione|riga|righe|foglio|elenco|finestra|finestre|immagine|immagini|cartella|cartelle|stanza|racconto|capitolo|capitoli|raggiungibile|riferimento`
  // …and the words the SCAFFOLD and the EMBEDS used, which the first sweep let
  // through: they are not chrome, so nothing in the earlier pass looked at them,
  // and «Introduzione» / «matrice · epoca» / «A CURA DI» / «da scrivere» sat in an
  // otherwise English app (E.D., measured on Templu Mare, 21 Aug 2026).
  + String.raw`|introduzione|presentazione|scrivere|scritto|cura|matrice|matrici|interrogazione|catena|evidenza|temporale|composto|composti|elemento|elementi|storia|bozza|didascalia|punto|vista|registrato|generata)\b`, "i");

{
  // No literal-parsing here, on purpose. A template literal can contain `${…}`
  // with strings inside it, so matching literals produced findings that spanned
  // a comment and a chunk of code — a sweep that cries wolf gets switched off.
  // With the comments blanked, ANY Italian word left in the file is in code:
  // Italian does not occur in an identifier, an import path or a CSS class.
  const files = readdirSync(SRC).filter((f) => f.endsWith(".ts") && f !== "i18n.ts");
  const findings = [];
  for (const name of files) {
    const src = read(name);
    const code = blankComments(src);
    const lines = code.split("\n");
    const raw = src.split("\n");
    lines.forEach((line, i) => {
      const hit = line.match(ITALIAN);
      if (!hit) return;
      if (/ALLOW-IT/.test(raw[i])) return;          // declared, not hidden
      findings.push(`${name}:${i + 1}: ${raw[i].trim().slice(0, 72)}`);
    });
  }
  eq(findings, [],
     "sweep · no user-visible Italian is written by hand (pass it through " +
     "`t()`, with English as the value and Italian as the translation)");
}

console.log(`i18n: ${checks} checks passed`);
