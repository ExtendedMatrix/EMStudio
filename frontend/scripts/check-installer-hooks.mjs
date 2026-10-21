// MICRO-INSTALLER-PULSANTE p.1 · the Windows installer closes em-bridge before
// it copies (apps/desktop/src-tauri/windows/installer-hooks.nsh):
//   1. tauri.conf.json names the hooks file under bundle > windows > nsis, and
//      the file is there;
//   2. it defines NSIS_HOOK_PREINSTALL and NSIS_HOOK_PREUNINSTALL, the two
//      tauri-cli inserts before its own «is the app running» and before any
//      file is copied or deleted;
//   3. what it closes is the sidecar's installed name: `externalBin`'s last
//      segment + `.exe` (tauri strips the target triple), for this user only,
//      and it waits on that file in $INSTDIR;
//   4. with makensis and nsis_tauri_utils.dll at hand (NSIS_TAURI_UTILS, or
//      tauri's own cache), it compiles inside a script shaped like tauri's
//      (`Section Install` / `Section Uninstall`), warnings as errors.
// What it cannot prove here: that it closes a real em-bridge.exe on Windows —
// left to E.D. The release's Windows job checks that the script tauri-cli
// handed to makensis includes it (release.yml).
//
//   node scripts/check-installer-hooks.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

const TAURI = new URL("../../apps/desktop/src-tauri/", import.meta.url).pathname;
let checks = 0;
const fails = [];
const notes = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); };

const conf = JSON.parse(readFileSync(join(TAURI, "tauri.conf.json"), "utf8"));
const rel = conf.bundle?.windows?.nsis?.installerHooks;
ok(typeof rel === "string", "tauri.conf.json: bundle > windows > nsis > installerHooks is set");
const hooks = rel ? join(TAURI, rel) : "";
ok(!!rel && existsSync(hooks), `the hooks file is there (${rel})`);
const nsh = hooks && existsSync(hooks) ? readFileSync(hooks, "utf8") : "";
const code = nsh.split("\n").filter((l) => !/^\s*;/.test(l)).join("\n");
for (const m of ["NSIS_HOOK_PREINSTALL", "NSIS_HOOK_PREUNINSTALL"])
  ok(new RegExp(`!macro ${m}\\s*\\n\\s*!insertmacro EM_STOP_BRIDGE`).test(code), `${m} closes the bridge`);

const sidecar = (conf.bundle?.externalBin ?? []).find((b) => /em-bridge$/.test(b));
const exe = sidecar ? `${sidecar.split("/").pop()}.exe` : "";
ok(exe === "em-bridge.exe", `the sidecar installs as em-bridge.exe (externalBin: ${sidecar})`);
ok(code.includes(`!define EM_BRIDGE_EXE "${exe}"`), "the hooks close that name");
ok(/nsis_tauri_utils::KillProcessCurrentUser "\$\{EM_BRIDGE_EXE\}"/.test(code), "every em-bridge.exe of this user, through tauri's own plugin");
ok(/taskkill \/F \/T \/IM "\$\{EM_BRIDGE_EXE\}" \/FI "USERNAME eq/.test(code), "the fallback is the tree, and this user's only");
ok(/FileOpen \$R2 "\$INSTDIR\\\$\{EM_BRIDGE_EXE\}" a/.test(code), "it waits until the installed file opens for writing");
ok(/\$\{IfThen\} \$R1 >= \d+ \$\{\|\} \$\{Break\}/.test(code), "the wait is bounded");
ok(/Push \$R0[\s\S]*Pop \$R0\s*\n!macroend/.test(code), "the registers it uses are given back");

// the compile, when the tools are here
let makensis = null;
try { execFileSync("makensis", ["-VERSION"], { stdio: "pipe" }); makensis = "makensis"; } catch { /* none */ }
const dllCandidates = [
  process.env.NSIS_TAURI_UTILS,
  join(process.env.LOCALAPPDATA ?? "", "tauri/NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll"),
  join(homedir(), ".cache/tauri/NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll"),
  join(homedir(), "Library/Caches/tauri/NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll"),
].filter(Boolean);
const dll = dllCandidates.find((p) => existsSync(p));
if (makensis && dll && nsh) {
  const dir = mkdtempSync(`${tmpdir()}/nsis-hooks-`);
  const nsi = join(dir, "stub.nsi");
  writeFileSync(nsi, [
    "Unicode true",
    `!addplugindir /x86-unicode "${dirname(dll)}"`,
    `!include "${hooks}"`,
    'Name "EMStudio"',
    `OutFile "${join(dir, "stub-setup.exe")}"`,
    'InstallDir "$LOCALAPPDATA\\EMStudio"',
    "RequestExecutionLevel user",
    "Section Install",
    "  SetOutPath $INSTDIR",
    "  !ifmacrodef NSIS_HOOK_PREINSTALL",
    "    !insertmacro NSIS_HOOK_PREINSTALL",
    "  !endif",
    '  WriteUninstaller "$INSTDIR\\uninstall.exe"',
    "SectionEnd",
    "Section Uninstall",
    "  !ifmacrodef NSIS_HOOK_PREUNINSTALL",
    "    !insertmacro NSIS_HOOK_PREUNINSTALL",
    "  !endif",
    "SectionEnd",
    "",
  ].join("\n"));
  let out = "";
  let compiled = true;
  try { out = execFileSync(makensis, ["-V2", "-WX", nsi], { stdio: "pipe" }).toString(); }
  catch (e) { compiled = false; out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
  ok(compiled, `makensis compiles the hooks, warnings as errors${compiled ? "" : `:\n${out}`}`);
} else {
  notes.push(`compile skipped: ${!makensis ? "no makensis" : "no nsis_tauri_utils.dll (set NSIS_TAURI_UTILS)"}`);
}

if (fails.length) {
  console.log(`check-installer-hooks: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-installer-hooks: ${checks} checks OK${notes.length ? ` (${notes.join("; ")})` : ""}`);
