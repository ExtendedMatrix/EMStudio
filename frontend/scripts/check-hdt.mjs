// THE ATTRIBUTION · three states, a register that suggests, and no gate.
//
//   node scripts/check-hdt.mjs
//
// A digital twin is not found lying in the ground: it is ATTRIBUTED, and the
// attribution matures downstream of the study. E.D., 30 September 2026, and it
// is archaeology and not software — *when I open a trench I do not yet know what
// I am finding.* What is pinned here follows from that:
//
//  1. **THREE STATES LIVE IN THE DOCUMENT** — no twin, provisional, registered —
//     and the third is only ever claimed when a shared identity supports it. A
//     status that outran its identity would read as certainty on the panel and
//     as a bare uuid in the Catalog.
//
//  2. **NOTHING FORCES A CHOICE.** The whole lap of somebody who does not know
//     yet — title, entity, authority, save — runs end to end with no twin, and
//     the state is drawn and named rather than left as an empty field. The panel
//     offers «create a provisional twin» with no register present at all.
//
//  3. **A BUG THIS FILE EXISTS TO KEEP BURIED** (measured, 30 September 2026):
//     typing the entity's NAME used to mint an HC2 on the spot — an attribution
//     nobody had made, which then travelled to a catalogue and keyed a monument
//     on it. That is a required field arrived at from the other side: instead of
//     forcing a choice it made one, silently.
//
//  4. **«NO REGISTER ANSWERED» IS NOT «THERE IS NONE».** The client keeps them
//     apart, and a reply that does not carry the federated shape (`sources`) is
//     treated as a register that could not be read rather than one that knows
//     nothing.
//
//  5. **THE DOCUMENT DOES NOT GET DIRTY**: committing the panel with nothing
//     changed changes nothing, and attaching a twin adds the twin and its two
//     edges and touches nothing else.
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { parseHTML } from "linkedom";

const { window, document } = parseHTML("<html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};
// linkedom exposes `<select>.value` as a getter ONLY; a browser lets you write
// it, and the panel does (it preselects the WHERE facet). Not a product fact —
// a gap in the stand-in — so it is shimmed rather than worked around in the
// code under test, which would let the DOM dictate the source.
Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
  configurable: true,
  get() {
    const chosen = [...this.querySelectorAll("option")]
      .find((o) => o.hasAttribute("selected"));
    return chosen ? chosen.getAttribute("value") ?? chosen.textContent : "";
  },
  set(v) {
    for (const o of this.querySelectorAll("option")) {
      const val = o.getAttribute("value") ?? o.textContent;
      if (val === String(v)) o.setAttribute("selected", "");
      else o.removeAttribute("selected");
    }
  },
});

const SRC = new URL("../src/", import.meta.url).pathname;
//: `./icons` uses `import.meta.glob` (Vite-only) — stubbed the way the other
//: DOM guards do it. Nothing under test here draws an icon.
const STUB_ICONS = {
  name: "stub-icons",
  setup(build) {
    build.onResolve({ filter: /\.\/icons$/ }, () => ({
      path: "icons-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export const ICON_NODE_TYPES = new Set();
export const imageFor = () => null;
export const imageForUrl = () => null;
export const dtcGlyphUrl = () => null;
export const iconUrl = () => null;`,
      loader: "ts" }));
  },
};

const load = async (entry) => {
  const b = await esbuild.build({
    entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
    plugins: [STUB_ICONS],
  });
  return import("data:text/javascript;base64,"
    + Buffer.from(b.outputFiles[0].text).toString("base64"));
};

const M = await load("model.ts");
const T = await load("twins.ts");
//: WIN·STUDY — the HDT-O panel moved OUT of the inspector into a window of
//: its own (`study-panel.ts`). This fence went red the moment it did, which is
//: what it is for; it now renders the panel where the panel lives. Every
//: assertion below is unchanged.
const S = await load("study-panel.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const fresh = () => new M.DocumentStore({
  graph: { graph_id: "g1", name: "Villa di Aiano", nodes: [], edges: [] },
});
//: MICRO studio-luogo · an HC1 exists by the explicit gesture
//: (`heritageDeclared`), not because the name field is filled: these laps are
//: the laps of somebody who DID say «this is a recognised heritage asset».
const FIELDS = {
  studyTitle: "Campagna 2026", studyAuthors: "Rossi", studyDate: "2026",
  heritageDeclared: true,
  heritageName: "Villa di Aiano", heritageUri: "", heritageAuthorityRef: undefined,
  parentName: "", parentUri: "", parentAuthorityRef: undefined,
  projectName: "", twin: { state: "none", name: "", key: "" },
};
const typed = (s, t) => s.doc.graph.nodes.filter((n) => n.node_type === t);
const twinNode = (s) => typed(s, "hdt")[0];

// ── 1 · the three states, in the data ────────────────────────────────────────
console.log("\n1 · three states, and the document holds them");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS });
  eq(typed(s, "hdt").length, 0,
     "no twin · an entity with no attribution mints NO HC2");
  eq(s.readHdto().twin.state, "none",
     "no twin · and the state reads back as `none`, not as an empty field");
  ok(typed(s, "heritage_entity").length === 1 && typed(s, "study").length === 1,
     "no twin · the rest of the study is complete — this is a finished lap");
}
{
  const s = fresh();
  s.applyHdto({ ...FIELDS,
                twin: { state: "provisional", name: "Aiano HDT", key: "" } });
  const n = twinNode(s);
  ok(n, "provisional · a twin the excavator made themselves exists");
  eq(n.data.hdt_status, "provisional", "provisional · and says so in the data");
  eq(n.data.heritage_entity_iri, undefined,
     "provisional · with NO shared identity — that is what makes it provisional");
  eq(s.readHdto().twin.state, "provisional", "provisional · reads back");
}
{
  const s = fresh();
  s.applyHdto({ ...FIELDS, twin: {
    state: "registered", name: "Villa di Aiano HDT",
    key: "https://vocab.getty.edu/tgn/7000874",
    registry: { source: "catalog", label: "this catalogue" } } });
  const n = twinNode(s);
  eq(n.data.hdt_status, "registered", "registered · the status is written");
  eq(n.data.heritage_entity_iri, "https://vocab.getty.edu/tgn/7000874",
     "registered · in the field s3dgraphy already reads, so a catalogue keys "
     + "two campaigns of one monument on ONE identity");
  eq(n.data.hdt_registry.source, "catalog",
     "registered · and WHICH register said so travels with it");
  const back = s.readHdto().twin;
  eq([back.state, back.key], ["registered", "https://vocab.getty.edu/tgn/7000874"],
     "registered · reads back whole");
}

// ── 2 · the invariant, fired on a case that breaks it ────────────────────────
console.log("\n2 · `registered` iff there is a shared identity");
{
  const s = fresh();
  // the breaking case: a caller (a panel, a remote op, a hand-edited file)
  // claiming a registration with nothing to register
  s.applyHdto({ ...FIELDS,
                twin: { state: "registered", name: "Wishful", key: "  " } });
  eq(twinNode(s).data.hdt_status, "provisional",
     "a status that outruns its identity is written down as what it IS");
  eq(s.readHdto().twin.state, "provisional", "…and reads back as that");
  eq(twinNode(s).data.hdt_registry, undefined,
     "…and it carries no register: nobody registered it");
}
{
  // the legacy case: documents written before the three states existed have a
  // twin node with no marker at all. It was always a provisional one.
  const s = fresh();
  s.applyHdto({ ...FIELDS,
                twin: { state: "provisional", name: "Old", key: "" } });
  delete twinNode(s).data.hdt_status;
  eq(s.readHdto().twin.state, "provisional",
     "legacy · a twin with no marker reads as provisional, which is what it was");
}
{
  // …and the identity wins over the marker when they disagree
  const s = fresh();
  s.applyHdto({ ...FIELDS,
                twin: { state: "registered", name: "X", key: "https://x/1" } });
  twinNode(s).data.hdt_status = "provisional";
  eq(s.readHdto().twin.state, "registered",
     "the FACT (a shared key) beats the DECLARATION when they disagree");
}

// ── 3 · the silent attribution, kept buried ──────────────────────────────────
console.log("\n3 · typing a name attributes nothing");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS, heritageName: "Colosseo",
                heritageUri: "https://vocab.getty.edu/tgn/7000874" });
  eq(typed(s, "hdt").length, 0,
     "an entity NAMED and RESOLVED still mints no twin — the attribution is an "
     + "act, and it used not to be");
}

// ── 4 · detaching says «not this one» and deletes nothing else ───────────────
console.log("\n4 · detaching");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS,
                twin: { state: "registered", name: "T", key: "https://x/1" } });
  const before = s.doc.graph.nodes.length;
  s.applyHdto({ ...FIELDS, twin: { state: "none", name: "", key: "" } });
  eq(typed(s, "hdt").length, 0, "detach · the twin is gone");
  eq(s.doc.graph.nodes.length, before - 1,
     "detach · and NOTHING else is: the study, the entity and the graph stay");
  ok(typed(s, "study").length === 1 && typed(s, "heritage_entity").length === 1,
     "detach · study and entity survive by name");
}

// ── 5 · the document does not get dirty ──────────────────────────────────────
console.log("\n5 · only what had to change changed");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS, twin: { state: "provisional", name: "T", key: "" } });
  const before = JSON.parse(JSON.stringify(s.doc));
  s.applyHdto({ ...FIELDS, twin: { state: "provisional", name: "T", key: "" } });
  eq(s.doc.graph.nodes.length, before.graph.nodes.length,
     "idempotent · committing the panel unchanged adds no node");
  eq(JSON.stringify(s.doc.graph.edges), JSON.stringify(before.graph.edges),
     "idempotent · …and no edge");
}
{
  const s = fresh();
  s.applyHdto({ ...FIELDS });                       // the lap with no twin
  const before = JSON.parse(JSON.stringify(s.doc.graph));
  s.applyHdto({ ...FIELDS,
                twin: { state: "registered", name: "T", key: "https://x/1",
                        registry: { source: "catalog" } } });
  const addedNodes = s.doc.graph.nodes.filter(
    (n) => !before.nodes.some((b) => b.id === n.id));
  const addedEdges = s.doc.graph.edges.filter(
    (e) => !before.edges.some((b) => b.id === e.id));
  eq(addedNodes.map((n) => n.node_type), ["hdt"],
     "attaching adds ONE node, and it is the twin");
  eq(addedEdges.map((e) => e.edge_type).sort(),
     ["contains_proposition_set", "has_digital_twin"],
     "…and exactly its two edges");
  const untouched = before.nodes.every((b) => {
    const now = s.doc.graph.nodes.find((n) => n.id === b.id);
    return JSON.stringify(now) === JSON.stringify(b);
  });
  ok(untouched, "…and every node that was already there is byte-identical");
}

// ── 6 · §5 · the parent gets the same authority treatment ────────────────────
console.log("\n6 · the whole is resolved like the part");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS, parentName: "Poggibonsi",
                parentUri: "https://vocab.getty.edu/tgn/7010191",
                parentAuthorityRef: { uri: "https://vocab.getty.edu/tgn/7010191",
                                      authority: "tgn", label: "Poggibonsi",
                                      match: "exact" } });
  const parent = s.doc.graph.nodes.find((n) => n.data?.hdto_role === "parent");
  eq(parent.data.authority_refs[0].authority, "tgn",
     "the parent stores a resolved ref, verbatim, like the entity does");
  const back = s.readHdto();
  eq(back.parentUri, "https://vocab.getty.edu/tgn/7010191",
     "…and reads back");
  ok(back.parentAuthorityRef?.label === "Poggibonsi",
     "…with the pick, so the badge can say which authority answered");
}
{
  // …and free text keeps working and stays nameable as unresolved
  const s = fresh();
  s.applyHdto({ ...FIELDS, parentName: "Roma", parentUri: "urn:local:roma" });
  const back = s.readHdto();
  eq(back.parentUri, "urn:local:roma", "free text survives untouched");
  eq(back.parentAuthorityRef, undefined,
     "…and is NOT dressed up as a resolved pick");
}

// ── 7 · the register client · absent is not empty ────────────────────────────
console.log("\n7 · «no register answered» ≠ «there is none»");
const reply = (payload, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => payload,
});
const BODY = {
  query: "aiano", untwinned: 3,
  sources: [{ id: "catalog", kind: "catalog", label: "this catalogue",
              status: "ok", count: 1 },
            { id: "cloud", kind: "collaborative-cloud", label: "the cloud",
              status: "not_configured", count: 0, detail: "not here yet" }],
  twins: [{ key: "https://x/1", label: "Villa di Aiano HDT", source: "catalog",
            studies: 4, custodians: [{ name: "Rossi", orcid: "0000-0002-1825-0097" }],
            custodians_from: "study-authors", provisional: false }],
};
{
  const thrown = await T.searchTwins("aiano", {
    base: "", fetcher: async () => { throw new Error("offline"); } });
  ok(thrown.unreachable && thrown.twins.length === 0,
     "a network failure is UNREACHABLE, and the panel says so in its own words");
  const notFound = await T.searchTwins("aiano", {
    base: "", fetcher: async () => reply({ detail: "no" }, 404) });
  ok(notFound.unreachable, "a 404 is unreachable too, not «none found»");
  const shapeless = await T.searchTwins("aiano", {
    base: "", fetcher: async () => reply({ twins: [] }) });
  ok(shapeless.unreachable,
     "a reply with no `sources` is not this contract — read as unreadable, "
     + "never as a register that knows nothing");
  const empty = await T.searchTwins("stonehenge", {
    base: "", fetcher: async () => reply({ ...BODY, twins: [] }) });
  ok(!empty.unreachable && empty.twins.length === 0,
     "…while a register that answered and found nothing is NOT unreachable");
}
{
  let asked = "";
  const r = await T.searchTwins("aiano", {
    base: "https://cat.example",
    fetcher: async (url) => { asked = String(url); return reply(BODY); },
  });
  ok(asked.startsWith("https://cat.example/catalog/twins?"),
     "it asks the Catalog's register");
  ok(asked.includes("q=aiano"), "…with the term");
  const twin = r.twins[0];
  eq([twin.source, twin.studies, twin.custodians[0].name],
     ["catalog", 4, "Rossi"],
     "the three facts an attachment is decided on: register, custodians, count");
  eq(r.untwinned, 3, "…and how many studies over there have no twin yet");
  const { answering, absent } = T.describeSources(r);
  eq([answering.map((s) => s.id), absent.map((s) => s.id)],
     [["catalog"], ["cloud"]],
     "asked-and-absent is kept apart from answered: one register must not look "
     + "like all of them");
}
{
  const partial = await T.searchTwins("x", {
    base: "", fetcher: async () => reply({ ...BODY,
      twins: [{ label: "no key", source: "catalog", studies: 1 }] }) });
  eq(partial.twins.length, 0,
     "a record with no identity is dropped, not shown with a blank where the "
     + "identity should be");
}
{
  eq(T.catalogBase("?catalog=https://cat.example/"), "https://cat.example",
     "the catalogue is read off the same `?catalog=` the study links use");
}

// ── 8 · the panel · three states drawn, and no gate anywhere ─────────────────
console.log("\n8 · the panel says the state and never blocks");
const CB = {
  onJump() {}, onClose() {}, onDeleteNode() {}, onDeleteEdge() {},
  onToggleFold() {}, onEnterGroup() {}, onAddPhase() {}, onTogglePhases() {},
  isPhasesVisible: () => false, onDeletePhase() {}, onDeleteEpoch() {},
  onReorderEpoch() {}, onReorderPhase() {}, onAssignEpoch() {},
  onTogglePin() {}, isPinned: () => false,
};
const render = (store, cb = CB) => {
  const root = document.createElement("div");
  S.renderStudyPanel(root, store, cb);
  return root;
};
const textOf = (root, sel) =>
  [...root.querySelectorAll(sel)].map((e) => e.textContent.trim());

{
  const s = fresh();
  s.applyHdto({ ...FIELDS });
  const root = render(s);
  const badge = root.querySelector(".insp-twin-state");
  ok(badge && /not attributed yet/i.test(badge.textContent),
     "no twin · the state is NAMED on the panel, not shown as a blank field");
  ok(root.querySelector(".insp-twin-none"),
     "…and drawn as its own state");
  const buttons = textOf(root, ".insp-twin button");
  ok(buttons.some((b) => /provisional/i.test(b)),
     "…and the act that needs no register is offered right there");
  ok([...root.querySelectorAll(".insp-twin button, .insp-twin input")]
       .every((e) => !e.disabled),
     "NO GATE · nothing in the attribution box is disabled, ever");
}
{
  const s = fresh();
  s.applyHdto({ ...FIELDS,
                twin: { state: "provisional", name: "Aiano HDT", key: "" } });
  const root = render(s);
  ok(root.querySelector(".insp-twin-provisional"),
     "provisional · drawn as provisional");
  ok(/made yourself/i.test(root.querySelector(".insp-twin .insp-hint").textContent),
     "…and explained as an ordinary act rather than a defect");
}
{
  const s = fresh();
  s.applyHdto({ ...FIELDS, twin: {
    state: "registered", name: "Aiano HDT", key: "https://x/1",
    registry: { source: "catalog", label: "this catalogue" } } });
  const root = render(s);
  ok(root.querySelector(".insp-twin-registered"), "registered · drawn as such");
  ok(/this catalogue/.test(root.textContent),
     "…and it says WHICH register knows it");
  ok([...root.querySelectorAll(".insp-id")].some(
       (e) => e.textContent === "https://x/1"),
     "…and shows the shared identity, which is the thing others can agree on");
}
{
  // MEASURED IN THE BROWSER, 30 September 2026, and it is the bug this block
  // exists for: «create a provisional twin» was drawn before the thing had a
  // name, and pressing it did nothing at all — `applyHdto` writes the twin
  // inside the branch that needs a heritage entity, because in HDT-O a twin is
  // the twin OF something. An act offered and then silently refused is worse
  // than one not offered.
  const s = fresh();
  s.applyHdto({ ...FIELDS, heritageName: "", studyTitle: "Trincea 1" });
  const root = render(s);
  eq(textOf(root, ".insp-twin button").filter((b) => /provisional/i.test(b)), [],
     "with nothing named, the act that could not work is NOT offered");
  ok(/a twin is a twin OF something/i.test(root.textContent),
     "…and where the button was there is the sentence saying what to do first");
  // …and the underlying refusal is real, not a UI opinion
  const bare = fresh();
  bare.applyHdto({ ...FIELDS, heritageName: "", studyTitle: "Trincea 1",
                   twin: { state: "provisional", name: "Orphan", key: "" } });
  eq(typed(bare, "hdt").length, 0,
     "…the model refuses a twin of nothing, which is why the button had to go");
}
{
  // the register is absent: the search is not offered, and everything else works
  const s = fresh();
  s.applyHdto({ ...FIELDS });
  const root = render(s, { ...CB, searchTwins: undefined });
  ok(!/is there one already/i.test(root.textContent),
     "no register wired · no search is drawn (nothing is simulated)");
  ok(textOf(root, ".insp-twin button").some((b) => /provisional/i.test(b)),
     "…and a provisional twin can STILL be made — the register was never a "
     + "precondition");
}

// ── 8b · a result row shows the three facts, and attaching writes them ───────
console.log("\n8b · what a result says, and what clicking it does");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS });
  const answer = {
    twins: [
      { key: "https://x/1", label: "Villa di Aiano HDT", source: "catalog",
        studies: 4, custodians: [{ name: "Rossi" }, { name: "Bianchi" }],
        custodians_from: "study-authors", provisional: false },
      { key: "local-uuid-2", label: "Appunto di Caio", source: "catalog",
        studies: 1, custodians: [], custodians_from: "study-authors",
        provisional: true },
    ],
    sources: [{ id: "catalog", label: "Catalogo ISPC", status: "ok", count: 2 },
              { id: "cloud", label: "the cloud", status: "not_configured",
                count: 0 }],
    untwinned: 3,
    unreachable: false,
  };
  const root = render(s, { ...CB, searchTwins: async () => answer });
  const box = root.querySelector(".insp-twin");
  [...box.querySelectorAll("button")].find((b) => b.textContent === "Look").click();
  await new Promise((r) => setTimeout(r, 0));
  const rows = textOf(root, ".insp-twin .insp-auth-item");
  ok(/Catalogo ISPC/.test(rows[0]), `row · which register — ${rows[0]}`);
  ok(/Rossi, Bianchi/.test(rows[0]), "row · who is already working on it");
  ok(/4 studies/.test(rows[0]), "row · how many studies hang on it");
  ok(/somebody else's working record/.test(rows[1]),
     `row · and a provisional one warns — ${rows[1]}`);
  ok(!/somebody else's working record/.test(rows[0]),
     "…only the provisional one");
  const body = root.querySelector(".insp-twin").textContent;
  ok(/the cloud: not configured/.test(body),
     "…the register that was asked and is absent is NAMED, not hidden");
  ok(/3 studies in that register have no twin yet/.test(body),
     "…and the homeless are reported: not knowing yet is the ordinary case");

  // …and clicking a row attaches, with everything the row promised
  root.querySelectorAll(".insp-twin .insp-auth-item")[0].click();
  const attached = s.readHdto().twin;
  eq([attached.state, attached.key, attached.registry?.source],
     ["registered", "https://x/1", "catalog"],
     "clicking a result attaches to it, WITH the register it came from");
}

// ── 9 · §5 · the project keeps its free text, and the refusal is measurable ──
console.log("\n9 · no facet is forced on a project");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS });
  const root = render(s);
  eq(root.querySelectorAll(".insp-facet-select").length, 2,
     "exactly two authority fields — the entity and its whole. A project hung "
     + "on WHERE/WHEN/WHAT/WHO would LOOK resolved, which is worse than text");
  const hints = textOf(root, ".insp-hint");
  ok(hints.some((h) => /a research project is none of those/i.test(h)),
     "…and the panel says why, where somebody reads it");
}

// ── 10 · §6 · the codes are in the glossary, not on the labels ───────────────
console.log("\n10 · the words a director of excavations reads");
{
  const s = fresh();
  s.applyHdto({ ...FIELDS });
  const root = render(s);
  const titles = textOf(root, ".insp-group-title");
  ok(titles.every((x) => !/HC\d+/.test(x)),
     `no code on a label — got ${JSON.stringify(titles)}`);
  const glossaries = [...root.querySelectorAll(".insp-group-title")]
    .map((e) => e.getAttribute("title") || "");
  ok(glossaries.filter((g) => /HC\d+/.test(g)).length === 4,
     "…and all four codes are still one hover away: they are what the ontology "
     + "and the papers use");
  ok(/not knowing yet is normal/i.test(root.textContent),
     "…and the section's own sentence says the thing the old one did not: the "
     + "twin is what makes eight campaigns one place, and not knowing yet is "
     + "normal");
  ok(!/Optional — links this graph/.test(root.textContent),
     "…the old «Optional» hint is gone: it called the thing that gives a site "
     + "its identity a checkbox");
}

console.log(`\nhdt: ${checks} checks passed`);
