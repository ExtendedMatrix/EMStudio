// CMD1 · executable check of src/commands.ts — the command channel's ids.
//
//   node scripts/check-commands.mjs
//
// The one thing here that MUST be right is the id: EMStudio and EMtools mint it
// independently, and idempotence is only real if the two agree. So the values
// below are pinned against Python's `uuid.uuid5` (see sync_manager/commands.py)
// plus the RFC 4122 test vector — if either implementation drifts, this fails
// instead of quietly building a second proxy in somebody's scene.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}commands.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const C = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

// RFC 4122 §A: uuid5(DNS, "www.example.com"). If this is wrong, everything
// below is wrong for a reason that has nothing to do with EM.
eq(C.uuid5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com"),
   "2ed6657d-e927-568b-95e1-2665a8aea6a2",
   "uuid5 matches the RFC test vector");

// pinned against Python: uuid5(CMD_NAMESPACE, "verb|target|<canonical params>")
eq(C.commandId("create_proxy_for_unit", "US101", {}),
   "80ebec5d-ae21-51ca-bb9d-b4dccb8cd644",
   "the command id is the one Blender computes for the same command");
eq(C.commandId("create_proxy_for_unit", "US101", { size: 2, name: "x" }),
   "4a0ea710-527d-5e94-9415-ad72f4ef53ef",
   "…params included, canonically");

// the id is about WHAT is asked, not about how the dict was typed
eq(C.commandId("create_proxy_for_unit", "US101", { size: 2, name: "x" }),
   C.commandId("create_proxy_for_unit", "US101", { name: "x", size: 2 }),
   "key order does not change the command");
ok(C.commandId("create_proxy_for_unit", "US101", {}) !==
   C.commandId("create_proxy_for_unit", "US102", {}),
   "a different target is a different command");
ok(C.commandId("create_proxy_for_unit", "US101", {}) !==
   C.commandId("import_geometry", "US101", {}),
   "a different verb is a different command");

// the message a caller sends
{
  const msg = C.buildCommand("create_proxy_for_unit", "US101");
  eq(msg.type, "command", "it is a command message");
  eq(msg.source, "emstudio", "…and the ENVELOPE says who asked");
  // WIRE 2 · the command's own words live in the payload, where a `target` or a
  // `source` parameter cannot be mistaken for one of the wire's
  eq(msg.payload.cmd_id, C.commandId("create_proxy_for_unit", "US101", {}),
     "…carrying the deterministic id, so a re-send is recognised");
  eq(msg.payload.params, {}, "no params is an empty object, not undefined");
}

eq([...C.COMMAND_VERBS], ["create_proxy_for_unit", "import_geometry", "blend_apply"],
   "three verbs — the vocabulary is small on purpose");

console.log(`commands: ${checks} checks passed`);
