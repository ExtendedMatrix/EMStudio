// No native dialog in the frontend — the app asks with its own.
//
//   node scripts/check-no-native-dialogs.mjs
//
// MICRO contenuti-workspace-elimina-grafo (26 Oct 2026): in the desktop
// (Tauri, WKWebView on macOS) `window.prompt` opens nothing and returns null,
// so the workspace bar's «+» did nothing; `confirm` and `alert` are no safer
// there. Every question now goes through `src/app-dialog.ts` (askText,
// askConfirm, tell, openDialog). This check keeps it so: a call to `prompt(`,
// `confirm(` or `alert(` — bare, or on `window.` / `globalThis.` / `self.` —
// anywhere in `src/` (comments and string literals blanked out first) is a
// finding — with no exemption: a local function of one of those names would hide
// a native call in the same file (it did, in main.ts), so none may be declared.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Comments and string/template literals → spaces (lines kept). */
function blank(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const keep = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      const j = src.indexOf("\n", i);
      const end = j < 0 ? n : j;
      out += keep(src.slice(i, end)); i = end;
    } else if (c === "/" && d === "*") {
      const j = src.indexOf("*/", i + 2);
      const end = j < 0 ? n : j + 2;
      out += keep(src.slice(i, end)); i = end;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      out += c + keep(src.slice(i + 1, j)) + c; i = j + 1;
    } else { out += c; i++; }
  }
  return out;
}

const CALL = /(^|[^A-Za-z0-9_$.])((?:window|globalThis|self)\s*\.\s*)?(prompt|confirm|alert)\s*\(/g;
const findings = [];
let scanned = 0;
for (const f of files(SRC)) {
  const text = blank(readFileSync(f, "utf8"));
  scanned++;
  for (const m of text.matchAll(/\b(?:function\s+(prompt|confirm|alert)\s*\(|(?:const|let|var)\s+(prompt|confirm|alert)\s*=\s*(?:async\s*)?(?:\(|function\b|[A-Za-z_$][\w$]*\s*=>))/g)) {
    findings.push(`${f.replace(SRC, "src/")}: a local function «${m[1] ?? m[2]}» shadows the native one — rename it`);
  }
  const lines = text.split("\n");
  lines.forEach((line, k) => {
    for (const m of line.matchAll(CALL)) {
      const name = m[3];
      findings.push(`${f.replace(SRC, "src/")}:${k + 1}: ${(m[2] ?? "") + name}(`);
    }
  });
}

// the component exists and is the one door
const dialog = readFileSync(join(SRC, "app-dialog.ts"), "utf8");
for (const fn of ["openDialog", "askText", "askConfirm", "tell"]) {
  assert.ok(new RegExp(`export (async )?function ${fn}\\b`).test(dialog), `app-dialog.ts exports ${fn}`);
}
assert.ok(/data-dialog-ok|dialogOk/.test(dialog) && /Escape/.test(dialog) && /Enter/.test(dialog),
  "app-dialog.ts: OK/Cancel markers, Enter and Escape");

// the check itself sees what it must
const probe = blank('x = window.prompt("a"); // confirm(\nif (!confirm(1)) alert(2); s = ".confirm(";');
assert.equal([...probe.matchAll(CALL)].length, 3, "the probe: three native calls found, the comment and the string not");

assert.deepEqual(findings, [], `native dialogs in the frontend:\n${findings.join("\n")}`);
console.log(`check-no-native-dialogs: ${scanned} files, no window.prompt / confirm / alert`);
