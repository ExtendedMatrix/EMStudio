// ACQUISITION · executable check of the delivery funnel — F1/F2/F3/F4.
//
//   node scripts/check-acquisition.mjs
//
// The properties here are not about pixels or about the graph; they are about
// WHAT THE APP IS ALLOWED TO ASSERT ON SOMEBODY'S BEHALF. Three of them would be
// re-broken by one convenient line, and one of them WAS broken (the default
// licence shipped, measured, in every fresh panel), which is why they are
// asserted in a file that runs rather than written down in a report:
//
//   1. NO DEFAULT LICENCE. A preselected licence is a legal statement nobody
//      made — the same species of error as a default password;
//   2. THE DEPOSITOR IS NOT A FIELD. It comes from the token; a box for it is a
//      box where a name that is not yours can be typed;
//   3. THE AUTHOR IS NOT ASSUMED TO BE THE DEPOSITOR. One digitises a
//      colleague's photograph, deposits it, answers for having published it, and
//      is not its author;
//   4. A SERIES IS A GROUP. Writing per file must not mint one acquisition per
//      file — which is exactly what the corpus would do with an unnamed lot,
//      because it derives the id from the members when there is no name.
//
// A static read of the sources, like the other checks in here: there is no DOM in
// node, and what is measurable without one is the shape of the code that decides.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SRC = new URL("../src/", import.meta.url).pathname;

/** Comments blanked to spaces — offsets, and therefore brace counting, survive.
 *
 *  Not optional, and the reason is instructive: the very first run of this check
 *  failed on `license: DEFAULT_ASSET_LICENSE` and the finding was a COMMENT four
 *  lines above the field, saying «NOT `DEFAULT_ASSET_LICENSE`». A check whose
 *  prose can trip it reports the opposite of the truth, which is the third time
 *  that has happened in this directory (`check-focus-parity` twice). So the rule
 *  is now a habit: strip first, read second. */
const read = async (name) =>
  (await readFile(`${SRC}${name}`, "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

const MAIN = await read("main.ts");
const INGEST = await read("ingest.ts");
const WS = await read("workspace.ts");
const I18N = await readFile(`${SRC}i18n.ts`, "utf8");   // a dictionary: all data
const CSS = await read("style.css");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const rows = [];

/** A function's body, by name — brace-counted, because these bodies contain
 *  strings with braces in them and a regex for "up to the next `\n}`" stops at
 *  the first nested one. */
function bodyOf(src, signature) {
  const at = src.indexOf(signature);
  assert.ok(at > 0, `${signature} is in the sources`);
  let depth = 0;
  let i = src.indexOf("{", at);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${signature}`);
}

// ── F1 · 1 · the licence has NO DEFAULT ─────────────────────────────────────
{
  const draft = bodyOf(MAIN, "const ingestDraft: IngestDraft =");
  // the exact line that shipped: `license: DEFAULT_ASSET_LICENSE,`
  ok(!/license:\s*DEFAULT_ASSET_LICENSE/.test(draft),
    "the fresh delivery must NOT carry a licence. This is the line that " +
      "shipped — `license: DEFAULT_ASSET_LICENSE`, i.e. CC-BY-SA-4.0 — so every " +
      "panel opened having already made a legal statement on somebody's behalf.");
  ok(/license:\s*""/.test(draft),
    "…and an empty one is what «nobody has said anything» looks like");
  // the constant still EXISTS: offering is not asserting, and deleting it would
  // have thrown away the offer with the default
  ok(/DEFAULT_ASSET_LICENSE\s*=/.test(INGEST),
    "`DEFAULT_ASSET_LICENSE` is still there — it is what the form OFFERS, one " +
      "click away, which is the whole difference between suggesting and asserting");
  ok(/assets\.licenseOffer/.test(MAIN),
    "…and the offer is a BUTTON, where it costs a click and reads as a choice");
  const delivery = bodyOf(MAIN, "function ingestDelivery()");
  ok(!/lic\.placeholder\s*=\s*DEFAULT_ASSET_LICENSE/.test(delivery),
    "the licence box's placeholder must not name a licence either: grey text " +
      "inside a required field is how a hurried reader ends up believing one " +
      "was chosen (it did say `placeholder = DEFAULT_ASSET_LICENSE`)");
  rows.push(["licence", "no default · offered by a button"]);
}

// ── F1 · 2 · the delivery does not sign without one, in ONE place ───────────
{
  const gate = bodyOf(MAIN, "function deliveryProblem()");
  ok(/assets\.needsLicense/.test(gate),
    "`deliveryProblem` is the one place that decides whether a delivery is " +
      "signed, and a missing licence is one of its answers");
  for (const caller of ["function runDelivery()", "function ingestFunnel()",
                        "function ingestPublishBar()"]) {
    ok(/deliveryProblem\(\)/.test(bodyOf(MAIN, caller)),
      `${caller} asks \`deliveryProblem()\` rather than re-deciding. Two copies ` +
        "of a rule like this drift, and the drift is always in the direction of " +
        "letting something through.");
  }
  const bar = bodyOf(MAIN, "function ingestPublishBar()");
  ok(/toast\(why\)/.test(bar),
    "…and a refusal SAYS WHY on the click: a grey button is not a sentence " +
      "somebody can act on (the same rule the window menus follow)");
  rows.push(["the gate", "one decider, three readers, spoken refusal"]);
}

// ── F1 · 3 · the depositor is not a field, and the author is not assumed ────
{
  const delivery = bodyOf(MAIN, "function ingestDelivery()");
  ok(/ing-depositor/.test(delivery) && /assets\.depositorHint/.test(delivery),
    "the DEPOSITOR is shown as a line, with the reason it is not a box");
  // the shipped pre-fill, by its exact shape
  ok(!/ingestDraft\.authorOrcid\s*=\s*me\.orcid/.test(bodyOf(MAIN, "function minioPanel()")),
    "opening the panel must NOT assert that whoever is logged in made the " +
      "files. It did: `if (!ingestDraft.authorOrcid) { ingestDraft.authorOrcid " +
      "= me.orcid; … }` ran on every open, which is the confusion between " +
      "depositor and author made comfortable.");
  ok(/assets\.authorIsMe/.test(delivery),
    "…and the convenience survives as a one-click «it was me», because a click " +
      "is a declaration and a pre-fill is not");
  rows.push(["the three roles", "depositor a line · author never assumed"]);
}

// ── F1 · 4 · the editor is REFUSED, not smuggled ────────────────────────────
{
  const gate = bodyOf(MAIN, "function deliveryProblem()");
  ok(/editor === "other"/.test(gate) && /assets\.editorNotYet/.test(gate),
    "an editor who is not the depositor has no field in the acts " +
      "(`enrich_asset_dtc` carries the author and the attributor, full stop), " +
      "so it is refused with the reason");
  const land = bodyOf(MAIN, "async function landRow(");
  ok(!/editorName/.test(land),
    "…and NOT written into `metadata`, which travels verbatim and would look " +
      "recorded while `asset_rights` never looks there. A claim that reads as " +
      "stored and is not enforceable is worse than a refusal.");
  ok(/assets\.editorNotYet/.test(I18N),
    "…with the sentence in the dictionary, so it says what to do next");
  rows.push(["the editor", "refused with its reason, never smuggled"]);
}

// ── F2 · 5 · the row is written PER FILE, in the order that cannot lie ──────
{
  const land = bodyOf(MAIN, "async function landRow(");
  const order = ["resource", "attribution", "acquisition"].map(
    (act) => land.indexOf(`registerAppend("${act}"`));
  ok(order.every((at) => at > 0),
    "one file's row is the three acts the register accepts");
  ok(order[0] < order[1] && order[1] < order[2],
    "…in THIS order: the register has to know the file before anything can be " +
      "said about it (the library refuses to invent a resource to hold a " +
      "licence), and the lot is last");
  const publish = bodyOf(MAIN, "async function publishQueue(");
  ok((publish.match(/await landRow\(/g) ?? []).length >= 2,
    "and it is called from BOTH paths — the uploaded file and the referenced " +
      "one — as each lands, not once at the end. An interrupted delivery of 400 " +
      "photographs used to leave 200 objects the register had never heard of.");
  ok(!/pushLotToRegister/.test(MAIN),
    "…and the end-of-lot version is GONE, not kept beside it: two places that " +
      "know the order of the acts is one place too many");
  rows.push(["per file", "resource → attribution → acquisition, as it lands"]);
}

// ── F2 · 6 · a series is a GROUP — the trap this would fall into ────────────
{
  const publish = bodyOf(MAIN, "async function publishQueue(");
  ok(/ingestDraft\.lotId\s*=\s*crypto\.randomUUID\(\)/.test(publish),
    "the delivery mints ONE acquisition id");
  const land = bodyOf(MAIN, "async function landRow(");
  ok(/acquisition_id:\s*ingestDraft\.lotId/.test(land),
    "…and every per-file act carries it. WITHOUT this the corpus derives the " +
      "id from the sorted MEMBERS when the lot has no name, so appending one " +
      "file at a time would mint two hundred one-file acquisitions — which is " +
      "precisely the property «una serie è un gruppo» forbids.");
  ok(/acquisitionId:\s*ingestDraft\.lotId/.test(land),
    "…on the file corpus too, which derives its id the same way");
  rows.push(["one lot", "an explicit id, or 200 files become 200 events"]);
}

// ── F2 · 7 · the funnel, and where it does not appear ───────────────────────
{
  const funnel = bodyOf(MAIN, "function ingestFunnel()");
  ok(/ing-funnel/.test(funnel) && /<svg/.test(funnel),
    "the funnel is an icon big enough to aim at, not a paragraph");
  ok(/dataTransfer\?\.files/.test(funnel),
    "it accepts a drop from the OPERATING SYSTEM — which it already did before " +
      "tonight, and is asserted here so it stays true");
  ok(/storageDragPayload/.test(funnel),
    "…and a drag out of the disk pane, which carries a path rather than bytes");
  const panel = bodyOf(MAIN, "function minioPanel()");
  const gateAt = panel.indexOf("storage.minioNeedsRoom");
  const funnelAt = panel.indexOf("ingestFunnel()");
  ok(gateAt > 0 && funnelAt > gateAt,
    "the store belongs to a ROOM: standalone, the panel says so and the funnel " +
      "is not built at all. A funnel greyed out with no explanation is worse " +
      "than no funnel.");
  const deliveryAt = panel.indexOf("ingestDelivery()");
  ok(deliveryAt > 0 && deliveryAt < funnelAt,
    "…and the delivery form is ABOVE it: a file inherits the signature at the " +
      "moment it lands, which is only possible if the signature already exists");
  rows.push(["the funnel", "OS drop · room-gated · below the signature"]);
}

// ── F3 · 8 · states, and a debt that survives a tidy-up ────────────────────
{
  const tally = bodyOf(MAIN, "function queueTally()");
  for (const state of ["pending", "stored", "signed", "failed"]) {
    ok(new RegExp(`${state}`).test(tally),
      `the queue counts «${state}» — four STATES, because three hundred files ` +
        "do not have a percentage");
  }
  ok(/item\.signed/.test(tally),
    "«deposited» means arrived-and-unsigned, which needs the paper side to be " +
      "its own fact: no single status enum could say it (`done` would read as " +
      "«arrived» to one person and «finished» to another)");
  const debt = bodyOf(MAIN, "function ingestDebt()");
  ok(/=\s*ingestDraft;/.test(debt) && /stored/.test(debt) && /signed/.test(debt),
    "the DEBT is read off the cumulative counters on the DRAFT (destructured or " +
      "not — what matters is that the source is the draft)");
  ok(!/items\.filter/.test(debt),
    "…and NOT derived from `items`, which «Clear done» empties. A debt that " +
      "disappears because you swept the desk is the palude it exists to prevent.");
  const clear = MAIN.slice(MAIN.indexOf("assets.clearDone"));
  ok(!/ingestDraft\.(stored|signed)\s*=\s*0/.test(clear.slice(0, 600)),
    "…so clearing the finished rows must not reset it");
  ok(/ing-tally-none/.test(CSS),
    "a state with nothing in it stays visible and quiet: hiding the empty ones " +
      "makes the row jump about and hides that nothing has failed");
  rows.push(["the debt", "cumulative, and it outlives «Clear done»"]);
}

// ── F4 · 9 · the tab, and what it is called now ─────────────────────────────
//
// COLLEGARE (29 set 2026, E.D.) · the four spaces are named after the ACTIVITY
// and the question it answers: `assets` came back to the bar as «Contenuti»
// («Quali file ho, e cosa è diventato documento?»). The funnel is one of the
// things done there, no longer the name of the place; «Acquisition» stays the
// model's word for the MOMENT (`DTCAcquisitionNode`, crmdig:D12).
{
  ok(/id: "assets", labelKey: "ws\.contents", hintKey: "ws\.qContents"/.test(WS),
    "the `assets` space is «Contenuti», and its tooltip is its question");
  ok(/"ws\.contents": "Contents"/.test(I18N) && /"ws\.contents": "Contenuti"/.test(I18N),
    "…in both complete dictionaries");
  ok(!/ws\.documentation/.test(WS) && !/ws\.documentation"/.test(I18N),
    "…and the old «Documentation» key is gone, not left beside it");
  // its block runs from its id to the next preset's id
  const from = WS.indexOf('id: "assets"');
  const preset = WS.slice(from, WS.indexOf("id: ", from + 1));
  ok(/id: "assets"/.test(preset),
    "the ID stays `assets`: saved arrangements and the tiling checks are keyed " +
      "by it, and renaming an id to match a label would discard somebody's " +
      "layouts for a word nobody sees");
  ok(/name: "chain", type: "graph", state: \{ mode: "dtc" \}/.test(preset),
    "…and the arrangement gains the CHAIN, so the story being written is " +
      "visible while it is written — the other half of yesterday's reading. " +
      "The key is the BARE `mode`: a graph window's slot has always been that " +
      "one (`modeKey`), and `mode.graph` is silently ignored — measured, this " +
      "window opened in Matrix Mode.");
  ok(!/"mode\.graph"/.test(WS),
    "…and no arrangement anywhere still uses the dead `mode.graph` key. The " +
      "DTC tab did, and got away with it only because its graph window is the " +
      "ANCHOR, which `seedWindows` hands the preset's `graphMode`: reordering " +
      "those two windows would have opened it in the wrong mode with nothing " +
      "on screen to explain why.");
  rows.push(["the tab", "Contenuti · id unchanged · the chain beside it"]);
}

console.log("\n  property × verdict");
for (const [what, verdict] of rows) {
  console.log(`    ${what.padEnd(17)} ${verdict}`);
}
console.log(`\nacquisition: ${checks} checks passed`);
