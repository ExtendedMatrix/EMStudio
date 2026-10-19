// MICRO-DOVE-CHI-MENU p.7 · CHECK FOR UPDATES — the choice of the release, on
// GitHub's list as the API gives it:
//
//   node scripts/check-updates.mjs
//
//   · a dev build is on the dev channel (dev and stable releases count), a
//     stable build on the stable one (pre-releases do not); drafts never;
//   · semver order with `-dev.N` numeric (dev.100 > dev.99, 1.6.0 > dev.99);
//   · newer → its version, its page, «installable» only with a latest.json;
//     not newer → current; no network or a refusal → offline, said.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const out = await esbuild.build({ entryPoints: [`${SRC}updates.ts`], bundle: true, format: "esm", write: false });
const m = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

eq(m.compareVersions("1.6.0-dev.51", "1.6.0-dev.50") > 0, true, "dev.51 > dev.50");
eq(m.compareVersions("1.6.0-dev.100", "1.6.0-dev.99") > 0, true, "dev.100 > dev.99 (numeric, not text)");
eq(m.compareVersions("1.6.0", "1.6.0-dev.99") > 0, true, "the stable 1.6.0 > any 1.6.0-dev");
eq(m.compareVersions("v1.6.0-dev.50", "1.6.0-dev.50"), 0, "a tag's v is not part of the version");
eq(m.compareVersions("1.7.0-dev.1", "1.6.0"), 1, "1.7.0-dev.1 > 1.6.0");
eq(m.channelOf("1.6.0-dev.50"), "dev", "a dev build is on the dev channel");
eq(m.channelOf("1.6.0"), "stable", "a stable build on the stable one");

const rel = (tag, more = {}) => ({ tag_name: tag, html_url: `https://github.com/ExtendedMatrix/EMStudio/releases/tag/${tag}`,
  draft: false, prerelease: tag.includes("-dev."), assets: [], ...more });
const list = [rel("v1.6.0-dev.50"), rel("v1.6.0-dev.51", { assets: [{ name: "latest.json" }] }), rel("v1.6.0-dev.52", { draft: true }), rel("v1.5.2"), rel("nightly")];

let r = m.judge("1.6.0-dev.50", list);
eq([r.kind, r.version, r.tag, r.installable, r.channel], ["newer", "1.6.0-dev.51", "v1.6.0-dev.51", true, "dev"], "dev.50 sees dev.51 (the draft dev.52 does not count)");
eq(r.url, "https://github.com/ExtendedMatrix/EMStudio/releases/tag/v1.6.0-dev.51", "…and its page");
r = m.judge("1.6.0-dev.51", list);
eq([r.kind, r.channel], ["current", "dev"], "dev.51 is the latest");
r = m.judge("1.5.1", list);
eq([r.kind, r.version, r.installable], ["newer", "1.5.2", false], "a stable build sees only stable releases; no latest.json → not installable");
r = m.judge("1.5.2", list);
eq(r.kind, "current", "1.5.2 is the latest stable, whatever the devs");
r = m.judge("1.6.0-dev.50", [...list, rel("v1.6.0")]);
eq([r.kind, r.version], ["newer", "1.6.0"], "on the dev channel a stable 1.6.0 counts too");

// the network: a refusal, a throw, an answer
const answer = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
r = await m.checkForUpdates("1.6.0-dev.50", answer(200, list));
eq(r.kind, "newer", "GitHub answered: judged");
r = await m.checkForUpdates("1.6.0-dev.50", answer(403, { message: "rate limit" }));
eq([r.kind, r.why], ["offline", "GitHub 403"], "a refusal is said, not taken for «latest»");
r = await m.checkForUpdates("1.6.0-dev.50", async () => { throw new TypeError("Load failed"); });
eq([r.kind, r.why], ["offline", "Load failed"], "no network is said");
let asked = null;
await m.checkForUpdates("1.6.0-dev.50", async (url) => { asked = url; return { ok: true, status: 200, json: async () => [] }; });
eq(asked, "https://api.github.com/repos/ExtendedMatrix/EMStudio/releases?per_page=30", "the repository asked is the one the app is built from");

console.log(`updates: ${checks} checks passed`);
