#!/usr/bin/env node
/**
 * V1 — one command to set EMStudio's APP version.
 *
 * The app version lived in three files that nobody kept in sync:
 *
 *   frontend/package.json                    → Vite inlines it as
 *                                              __EMSTUDIO_VERSION__ → the UI badge
 *   apps/desktop/src-tauri/Cargo.toml        → the crate version
 *   apps/desktop/src-tauri/tauri.conf.json   → the bundle version (.app/.dmg/.msi)
 *
 * Three copies with no command to move them is a version that stays where it is,
 * which is exactly what happened (1.6.0-dev.1 for the whole of the geo + narrative
 * arc). One argument in, three files out.
 *
 * NOT to be confused with `EM_VERSION` — the version of the **EM language**, which
 * is data-driven from the vendored datamodels (`rules.ts`) and must never be
 * written by hand. This script does not touch it, and there is a check that it
 * cannot: it only ever writes the three paths listed above.
 *
 *   node scripts/set-version.mjs 1.6.0-dev.2      # set exactly
 *   node scripts/set-version.mjs --bump-dev       # 1.6.0-dev.1 → 1.6.0-dev.2
 *   node scripts/set-version.mjs --print          # what is set now
 *   node scripts/set-version.mjs 1.6.0-dev.2 --dry-run
 *
 * or, from `frontend/`: `npm run set-version -- <args>` (same script, same args).
 *
 * The npm script is deliberately NOT called `version`: npm reserves that name as a
 * LIFECYCLE HOOK, run automatically in the middle of `npm version <x>`. A script
 * called `version` would therefore fire during an unrelated npm command, with no
 * arguments — which here means printing usage from inside somebody else's
 * operation. `set-version` says what it does and collides with nothing.
 *
 * ## The `-dev.N` suffix and Tauri
 *
 * `1.6.0-dev.2` is valid semver, and Cargo accepts it. **Tauri's bundlers do
 * not**: a macOS `CFBundleShortVersionString` and a Windows MSI ProductVersion are
 * numeric (`x.y.z`), and a pre-release suffix either fails the build or is silently
 * truncated — silently being the worse of the two, because the .dmg then claims a
 * version nobody chose.
 *
 * So the suffix is **kept where it is read and dropped where it is built**:
 *
 *   package.json     1.6.0-dev.2   ← the UI badge shows the full, honest version
 *   Cargo.toml       1.6.0-dev.2   ← Cargo speaks semver; the crate keeps it
 *   tauri.conf.json  1.6.0         ← the bundle gets the numeric core only
 *
 * The dev counter is therefore visible exactly where a tester reads it (the badge)
 * and absent exactly where an installer format cannot carry it. `--print` shows
 * all three so the difference is never a surprise.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGE_JSON = join(ROOT, "frontend", "package.json");
const CARGO_TOML = join(ROOT, "apps", "desktop", "src-tauri", "Cargo.toml");
const TAURI_CONF = join(ROOT, "apps", "desktop", "src-tauri", "tauri.conf.json");

/**
 * semver with an optional `-dev.N` — or `-lab.N`, which only `./em.sh labrel`
 * sets, for the length of a local build of EMStudio Lab, and puts back
 * afterwards (docs/LAB.md): no committed file ever carries it.
 */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(dev|lab)\.(\d+))?$/;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** The numeric core, for formats that cannot carry a pre-release suffix. */
function numericCore(version) {
  const m = VERSION_RE.exec(version);
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function readCurrent() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  const cargo = readFileSync(CARGO_TOML, "utf8");
  const tauri = JSON.parse(readFileSync(TAURI_CONF, "utf8"));
  // The FIRST `version =` under [package] — a dependency's version must never be
  // mistaken for the crate's own.
  const cargoMatch = /^\s*\[package\][\s\S]*?^\s*version\s*=\s*"([^"]+)"/m.exec(cargo);
  return {
    packageJson: pkg.version,
    cargo: cargoMatch ? cargoMatch[1] : null,
    tauri: tauri.version,
  };
}

function bumpDev(version) {
  const m = VERSION_RE.exec(version);
  if (!m) fail(`cannot bump ${version}: not x.y.z or x.y.z-dev.N`);
  if (m[4] === "lab") {
    fail(`cannot bump the dev counter of ${version}: a lab version is set only for `
         + "the length of a labrel build — put the committed version back first");
  }
  if (m[4] === undefined) {
    // A release with no dev counter starts one rather than inventing a patch
    // bump: "the next dev build of this version" is what the caller asked for.
    return `${m[1]}.${m[2]}.${m[3]}-dev.1`;
  }
  return `${m[1]}.${m[2]}.${m[3]}-dev.${Number(m[5]) + 1}`;
}

/** Rewrite the crate version, and ONLY the one under [package]. */
function writeCargo(text, version) {
  let inPackage = false;
  let written = false;
  const lines = text.split("\n").map((line) => {
    const section = /^\s*\[([^\]]+)\]/.exec(line);
    if (section) {
      inPackage = section[1] === "package";
      return line;
    }
    if (inPackage && !written && /^\s*version\s*=\s*"/.test(line)) {
      written = true;
      return line.replace(/"[^"]*"/, `"${version}"`);
    }
    return line;
  });
  if (!written) fail(`no [package] version = "..." found in ${CARGO_TOML}`);
  return lines.join("\n");
}

/**
 * Replace a top-level JSON string value while preserving the file's formatting.
 *
 * Deliberately a targeted textual edit rather than JSON.parse → stringify: a
 * re-serialisation reformats the whole file, and a version bump should be a
 * one-line diff. (The same rule the datamodel JSONs are edited by.)
 */
function replaceJsonField(text, field, value) {
  const re = new RegExp(`("${field}"\\s*:\\s*)"[^"]*"`);
  if (!re.test(text)) fail(`no "${field}" field found`);
  return text.replace(re, `$1"${value}"`);
}

// ── arguments ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const rest = args.filter((a) => a !== "--dry-run");
const current = readCurrent();

if (rest.includes("--print") || rest.length === 0) {
  console.log(`frontend/package.json   ${current.packageJson}   (UI badge)`);
  console.log(`src-tauri/Cargo.toml    ${current.cargo}`);
  console.log(`src-tauri/tauri.conf    ${current.tauri}   (bundle: numeric core)`);
  if (rest.length === 0) {
    console.log("\nusage: node scripts/set-version.mjs <x.y.z[-dev.N]> | --bump-dev"
                + " | --print  [--dry-run]");
  }
  process.exit(0);
}

let target;
if (rest.includes("--bump-dev")) {
  // The dev counter follows package.json: it is the one a human reads on the
  // badge, so it is the one that defines "the current version".
  target = bumpDev(current.packageJson);
} else {
  target = rest.find((a) => !a.startsWith("--"));
  if (!target) fail("give a version, or --bump-dev");
  if (!VERSION_RE.test(target)) {
    fail(`"${target}" is not x.y.z, x.y.z-dev.N or x.y.z-lab.N (the only forms this app uses)`);
  }
}

const bundleVersion = numericCore(target);

// ── write (idempotent: same input, same files, no diff) ──────────────────────

const edits = [
  [PACKAGE_JSON, (t) => replaceJsonField(t, "version", target), target],
  [CARGO_TOML, (t) => writeCargo(t, target), target],
  [TAURI_CONF, (t) => replaceJsonField(t, "version", bundleVersion), bundleVersion],
];

let changed = 0;
for (const [path, transform, shown] of edits) {
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  const label = path.replace(`${ROOT}/`, "");
  if (before === after) {
    console.log(`  = ${label}  ${shown}`);
    continue;
  }
  changed += 1;
  if (!dryRun) writeFileSync(path, after);
  console.log(`  ${dryRun ? "~" : "→"} ${label}  ${shown}`);
}

console.log(
  changed === 0
    ? `already at ${target} — nothing to do`
    : `${dryRun ? "would set" : "set"} app version ${target}`
      + (bundleVersion === target ? "" : ` (bundle ${bundleVersion})`),
);
if (!dryRun && changed > 0) {
  console.log("run `cd frontend && npm run build` for the badge to pick it up");
}
