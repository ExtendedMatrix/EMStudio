// R2 (E.D., 4 Oct 2026) · the state of the files in EMStudio's desks, with the
// signs of the common list (state-symbols.ts) and the same words as EMtools and
// StratiField. One section, drawn where the files are looked at: the head of
// Contents (Storage), the card of a document, the Inspector of a resource.
// The gestures on one file and on the group: «Find here…» (relink a missing
// one), «Upload to the room», «Keep on the disk too», «Open where it is».
import { t } from "./i18n";
import { stateBadge, stateSign } from "./state-symbols";
import { bucketOf, bucketRows, fileFilter, fileRows, fileStateOf, freeUi, fileStates, fileSummary, filterRows, listFilter,
         movedFiles, setFileFilter, type BucketRow, type FileState, type MovedFile, type StorageRow } from "./file-states";

export interface FileHooks {
  checking: boolean;
  inRoom: boolean;
  onCheck(): void;
  onRelink(f: FileState): void;
  onUpload(fs: FileState[]): void;
  onKeep(fs: FileState[]): void;
  onReveal(f: FileState): void;
  onJump(id: string): void;
  onRefilter(): void;
  /** R2 · what a row says of a file: its name and its document's title */
  describe?(id: string, f?: FileState): { file: string; doc: string };
  /** C1 · the standard tree of an EM project */
  onNewProject?(): void;
  onReorder?(): void;
  /** S1 · «Find moved files…»: look for the missing ones in the project's folders */
  onFindMoved?(): void;
  /** S1 · relink a missing file to where it was found (`path`), or every sure one (null) */
  onRelinkMoved?(m: MovedFile | null, path: string): void;
  /** B1 · the bucket: check it (quick, or byte for byte), free the local copies it proves */
  onBucketCheck?(deep: boolean): void;
  onFreeOpen?(): void;
  onFreeRun?(): void;
  onPromote?(f: FileState): void;
  /** MICRO-CONTENTS-1 D8 · the graph the check works on (the active one), how
   *  many files it cites, and the other open graphs that cite some */
  graph?: string;
  cites?: number;
  elsewhere?: { id: string; name: string; n: number }[];
  onSwitchGraph?(slotId: string): void;
}

const FILE_STATES = ["on_disk", "on_node", "both", "reference_only", "missing", "empty_copy"];

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** the gestures that make sense for ONE file in its state */
export function fileGestures(f: FileState, h: FileHooks): HTMLElement {
  const box = el("span", "fs-gestures");
  const add = (label: string, act: string, fn: () => void, hint?: string): void => {
    const b = el("button", "ghost fs-act", label) as HTMLButtonElement;
    b.dataset.act = act;
    if (hint) b.title = hint;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    box.appendChild(b);
  };
  if (f.state === "missing" || f.state === "empty_copy") add(t("fs.findHere"), "find", () => h.onRelink(f));
  if (f.state === "on_disk" && h.inRoom) add(t("fs.upload"), "upload", () => h.onUpload([f]));
  if (f.state === "on_node") add(t("fs.keep"), "keep", () => h.onKeep([f]), t("fs.keepHint"));
  if (f.path) add(t("fs.reveal"), "reveal", () => h.onReveal(f));
  return box;
}

/** one line: badge, the file's name and its document's title, gestures
 *  (`withDoc` false where the document is already the page: the Doc viewer) */
export function fileRow(f: FileState, h: FileHooks, withDoc = true): HTMLElement {
  const row = el("div", "fs-row");
  row.dataset.state = f.state;
  row.dataset.id = f.id;
  row.appendChild(stateBadge(`file.${f.state}`));
  const said = h.describe?.(f.id, f) ?? { file: f.name || f.id, doc: "" };
  const name = el("button", "ghost fs-name", said.file) as HTMLButtonElement;
  name.title = f.path || f.note || f.id;
  name.addEventListener("click", () => h.onJump(f.id));
  row.appendChild(name);
  if (withDoc && said.doc) row.appendChild(el("span", "fs-doc", said.doc));
  row.appendChild(fileGestures(f, h));
  if (f.note) row.appendChild(el("div", "insp-hint fs-note", f.note));
  return row;
}

/** the section at the head of Contents: the counts as filters, the list */
export function filesSection(h: FileHooks): HTMLElement {
  const box = el("div", "fs-section");
  const head = el("div", "fs-head");
  head.appendChild(el("b", "", t("fs.title")));
  const check = el("button", "ghost", h.checking ? t("fs.checking") : t("fs.check")) as HTMLButtonElement;
  // MICRO-CONTENTS-1 D8 · whose files: the active graph's
  if (h.graph && !h.checking) { check.textContent = t("fs.checkOf", { graph: h.graph }); check.title = t("fs.checkOfTitle", { graph: h.graph }); }
  check.disabled = h.checking || (!!h.graph && h.cites === 0);
  if (!!h.graph && h.cites === 0) check.title = t("fs.noneCited", { graph: h.graph });
  check.dataset.act = "check";
  check.addEventListener("click", () => h.onCheck());
  head.appendChild(check);
  if (h.onNewProject) {
    const b = el("button", "ghost", t("fs.newProject")) as HTMLButtonElement;
    b.dataset.act = "new-project";
    b.addEventListener("click", () => h.onNewProject!());
    head.appendChild(b);
  }
  if (h.onReorder) {
    const b = el("button", "ghost", t("fs.reorder")) as HTMLButtonElement;
    b.dataset.act = "reorder";
    b.addEventListener("click", () => h.onReorder!());
    head.appendChild(b);
  }
  box.appendChild(head);
  const all = fileStates();
  // MICRO-CONTENTS-1 D8 (variant B) · a graph that cites no file says so — a
  // check would come back «not checked yet» forever — and names the open
  // graphs that do cite some, with the way to switch to one
  if (h.graph && h.cites === 0) {
    const none = el("div", "insp-hint fs-none-cited", t("fs.noneCited", { graph: h.graph }));
    box.appendChild(none);
    for (const o of h.elsewhere ?? []) {
      const b = el("button", "ghost fs-switch", t("fs.switchTo", { graph: o.name, n: String(o.n) })) as HTMLButtonElement;
      b.dataset.act = "switch-graph";
      b.title = t("fs.switchToTitle", { graph: o.name });
      b.addEventListener("click", () => h.onSwitchGraph?.(o.id));
      box.appendChild(b);
    }
    return box;
  }
  if (!all.length) {
    box.appendChild(el("div", "insp-hint", h.graph ? t("fs.notCheckedOf", { graph: h.graph }) : t("fs.notChecked")));
    return box;
  }
  const counts = fileSummary();
  const chips = el("div", "fs-chips");
  for (const s of FILE_STATES) {
    const n = counts[s] ?? 0;
    if (!n) continue;
    const sign = stateSign(`file.${s}`);
    const c = el("button", `fs-chip st-${sign.tone}${fileFilter === s ? " is-on" : ""}`,
                  `${sign.glyph} ${n} ${sign.label}`) as HTMLButtonElement;
    c.dataset.filter = s;
    c.title = sign.meaning;
    c.addEventListener("click", () => { setFileFilter(s); h.onRefilter(); });
    chips.appendChild(c);
  }
  box.appendChild(chips);
  const shown = all.filter((f) => !fileFilter || f.state === fileFilter);
  // the gesture on the GROUP shown
  const group = el("div", "fs-group");
  const onDisk = shown.filter((f) => f.state === "on_disk");
  const onNode = shown.filter((f) => f.state === "on_node");
  if (h.inRoom && onDisk.length) {
    const b = el("button", "ghost", t("fs.uploadAll", { n: String(onDisk.length) })) as HTMLButtonElement;
    b.dataset.act = "upload-all";
    b.addEventListener("click", () => h.onUpload(onDisk));
    group.appendChild(b);
  }
  if (onNode.length) {
    const b = el("button", "ghost", t("fs.keepAll", { n: String(onNode.length) })) as HTMLButtonElement;
    b.dataset.act = "keep-all";
    b.title = t("fs.keepHint");
    b.addEventListener("click", () => h.onKeep(onNode));
    group.appendChild(b);
  }
  if (group.childElementCount) box.appendChild(group);
  const lost = all.filter((f) => f.state === "missing" || f.state === "empty_copy");
  if ((lost.length || movedFiles().length) && h.onFindMoved) box.appendChild(movedBox(lost.length, h));
  if (h.onBucketCheck) box.appendChild(bucketBox(h));
  if (fileRows().length) {
    box.appendChild(rowsList(h));
    return box;
  }
  const list = el("div", "fs-list");
  for (const f of shown.slice(0, 200)) list.appendChild(fileRow(f, h));
  if (shown.length > 200) list.appendChild(el("div", "insp-hint", t("insp.andMore", { n: String(shown.length - 200) })));
  box.appendChild(list);
  return box;
}

const SURE = new Set<string>(["exact", "exact_renamed"]);

/** B1 · the sign beside a file for how its disk and bucket copies stand */
const BUCKET_SIGN: Record<BucketRow["state"], string> = {
  aligned: "✓", same_size: "≈", differ: "≠", disk_only: "⌂", bucket_only: "☁", neither: "✕", unknown: "?",
};

/** B1 · the bucket: check, the tally, and the gesture that frees the disk copies the bucket proves */
function bucketBox(h: FileHooks): HTMLElement {
  const box = el("div", "fs-bucket");
  const head = el("div", "fs-head");
  head.appendChild(el("b", "", t("fs.bucket")));
  for (const [deep, label] of [[false, t("fs.bucketCheck")], [true, t("fs.bucketVerify")]] as const) {
    const b = el("button", "ghost", label) as HTMLButtonElement;
    b.dataset.act = deep ? "bucket-verify" : "bucket-check";
    b.title = t(deep ? "fs.bucketVerifyHint" : "fs.bucketCheckHint");
    b.addEventListener("click", () => h.onBucketCheck!(deep));
    head.appendChild(b);
  }
  box.appendChild(head);
  const rows = bucketRows();
  if (!rows.length) { box.appendChild(el("div", "insp-hint", t("fs.bucketNot"))); return box; }
  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.state, (tally.get(r.state) ?? 0) + 1);
  const chips = el("div", "fs-chips");
  for (const [state, n] of tally) {
    const c = el("span", `fs-chip st-${state === "differ" || state === "neither" ? "bad" : "muted"}`,
                 `${BUCKET_SIGN[state as BucketRow["state"]]} ${n} ${t("fs.b." + state)}`);
    c.title = t("fs.bm." + state);
    chips.appendChild(c);
  }
  box.appendChild(chips);
  const aligned = tally.get("aligned") ?? 0;
  if (aligned && h.onFreeOpen) {
    const b = el("button", "ghost fs-danger", t("fs.freeLocal", { n: String(aligned) })) as HTMLButtonElement;
    b.dataset.act = "free-open";
    b.addEventListener("click", () => h.onFreeOpen!());
    box.appendChild(b);
  }
  if (freeUi.open) box.appendChild(freePanel(h));
  return box;
}

/** B1 · the confirmation: a warning first, then what would go, then the yes */
function freePanel(h: FileHooks): HTMLElement {
  const p = el("div", "fs-free");
  p.appendChild(el("div", "fs-free-warn", t("fs.freeWarn")));
  const safe = freeUi.plan.filter((x) => x.level === "safe");
  const conf = freeUi.plan.filter((x) => x.level === "confirm");
  const mb = (xs: typeof safe): string => (xs.reduce((a, x) => a + x.size, 0) / 1e6).toFixed(0);
  p.appendChild(el("div", "", t("fs.freeSafe", { n: String(safe.length), mb: mb(safe) })));
  p.appendChild(el("div", "fs-free-bad", t("fs.freeConf", { n: String(conf.length), mb: mb(conf) })));
  const lonely = conf.filter((x) => x.copies === 0).length;
  const opt = (key: "masters" | "permanent", label: string): HTMLElement => {
    const lab = el("label", "fs-free-opt");
    const cb = el("input") as HTMLInputElement;
    cb.type = "checkbox"; cb.checked = freeUi[key]; cb.dataset.opt = key;
    cb.addEventListener("change", () => { freeUi[key] = cb.checked; h.onRefilter(); });
    lab.append(cb, document.createTextNode(" " + label));
    return lab;
  };
  p.appendChild(opt("masters", t("fs.freeMasters")));
  if (freeUi.masters && lonely)
    p.appendChild(el("div", "fs-free-bad", t("fs.freeLonely", { n: String(lonely) })));
  p.appendChild(opt("permanent", t("fs.freePermanent")));
  if (freeUi.permanent) p.appendChild(el("div", "fs-free-bad", t("fs.freeNoWayBack")));
  const row = el("div", "fs-free-act");
  const go = el("button", "fs-danger", t("fs.freeGo")) as HTMLButtonElement;
  go.dataset.act = "free-run";
  go.disabled = freeUi.busy || !(safe.length || (freeUi.masters && conf.length));
  go.addEventListener("click", () => h.onFreeRun?.());
  const no = el("button", "ghost", t("fs.freeCancel")) as HTMLButtonElement;
  no.addEventListener("click", () => { freeUi.open = false; h.onRefilter(); });
  row.append(go, no);
  p.appendChild(row);
  return p;
}

/** S1 · the files that are not here, and where they may have gone */
function movedBox(lostCount: number, h: FileHooks): HTMLElement {
  const box = el("div", "fs-moved");
  const head = el("div", "fs-head");
  head.appendChild(el("span", "", t("fs.notHere", { n: String(lostCount) })));
  const find = el("button", "ghost", t("fs.findMoved")) as HTMLButtonElement;
  find.dataset.act = "find-moved";
  find.title = t("fs.findMovedHint");
  find.addEventListener("click", () => h.onFindMoved!());
  head.appendChild(find);
  box.appendChild(head);
  const moved = movedFiles();
  const sure = moved.filter((m) => SURE.has(m.matches[0].how));
  if (sure.length && h.onRelinkMoved) {
    const b = el("button", "ghost", t("fs.relinkSure", { n: String(sure.length) })) as HTMLButtonElement;
    b.dataset.act = "relink-sure";
    b.addEventListener("click", () => h.onRelinkMoved!(null, ""));
    box.appendChild(b);
  }
  for (const m of moved.slice(0, 20)) {
    const best = m.matches[0];
    const row = el("div", "fs-row");
    row.dataset.id = m.id;
    row.appendChild(el("span", "fs-name", m.name || m.wanted.name || m.id));
    row.appendChild(el("span", "insp-hint", `${t("fs.how." + best.how)} · ${best.path}`
      + (m.matches.length > 1 ? `  (+${m.matches.length - 1})` : "")));
    if (h.onRelinkMoved) {
      const b = el("button", "ghost fs-act", t("fs.relink")) as HTMLButtonElement;
      b.dataset.act = "relink-moved";
      b.addEventListener("click", () => h.onRelinkMoved!(m, best.path));
      row.appendChild(b);
    }
    box.appendChild(row);
  }
  if (moved.length > 20) box.appendChild(el("div", "insp-hint", t("insp.andMore", { n: String(moved.length - 20) })));
  return box;
}

/** S1 · the list: a search, a kind and a use, the rows by asset (versions hang
 *  under their master), the card of the selected row */
function rowsList(h: FileHooks): HTMLElement {
  const wrap = el("div", "fs-rows");
  const tools = el("div", "fs-tools");
  const q = el("input", "fs-search") as HTMLInputElement;
  q.type = "search";
  q.placeholder = t("fs.search");
  q.value = listFilter.query;
  q.dataset.role = "files-search";
  q.addEventListener("input", () => { listFilter.query = q.value; renderRows(); });
  const kind = el("select", "fs-kind") as HTMLSelectElement;
  kind.dataset.role = "files-kind";
  for (const k of ["", "master", "version", "file", "link"])
    kind.appendChild(new Option(t(k ? `fs.kind.${k}` : "fs.kind.all"), k, false, k === listFilter.kind));
  kind.addEventListener("change", () => { listFilter.kind = kind.value; renderRows(); });
  const uses = [...new Set(fileRows().flatMap((r) => r.use))].sort();
  const use = el("select", "fs-use") as HTMLSelectElement;
  use.dataset.role = "files-use";
  use.appendChild(new Option(t("fs.use.all"), "", false, !listFilter.use));
  for (const u of uses) use.appendChild(new Option(u.replace(/_/g, " "), u, false, u === listFilter.use));
  use.addEventListener("change", () => { listFilter.use = use.value; renderRows(); });
  tools.append(q, kind, use);
  wrap.appendChild(tools);
  const list = el("div", "fs-list");
  wrap.appendChild(list);

  function renderRows(): void {
    list.textContent = "";
    const rows = filterRows(fileRows(), { ...listFilter, state: fileFilter });
    for (const r of rows.slice(0, 300)) list.appendChild(rowItem(r, h, renderRows));
    if (rows.length > 300) list.appendChild(el("div", "insp-hint", t("insp.andMore", { n: String(rows.length - 300) })));
    if (!rows.length) list.appendChild(el("div", "insp-hint", t("fs.noRows")));
  }
  renderRows();
  return wrap;
}

function rowItem(r: StorageRow, h: FileHooks, redraw: () => void): HTMLElement {
  const item = el("div", `fs-item fs-k-${r.kind}${listFilter.selected === r.id ? " is-selected" : ""}`);
  item.dataset.id = r.id;
  item.dataset.kind = r.kind;
  item.dataset.state = r.state;
  const line = el("div", "fs-row");
  if (r.kind === "version" || r.kind === "file") line.appendChild(el("span", "fs-indent", "↳"));
  line.appendChild(stateBadge(`file.${r.state}`));
  const name = el("button", "ghost fs-name", r.file) as HTMLButtonElement;
  name.title = r.where || r.id;
  name.addEventListener("click", () => {
    listFilter.selected = listFilter.selected === r.id ? "" : r.id;
    redraw();
  });
  line.appendChild(name);
  const bk = bucketOf(r.id);
  if (bk) {
    const g = el("span", `fs-bk st-${bk.state}`, BUCKET_SIGN[bk.state]);
    g.title = t("fs.bm." + bk.state);
    line.appendChild(g);
  }
  line.appendChild(el("span", "fs-tag insp-hint", r.tag));
  item.appendChild(line);
  if (listFilter.selected === r.id) item.appendChild(rowCard(r, h, redraw));
  return item;
}

/** the card of the selected row: what it is, where it is, its sibling versions */
function rowCard(r: StorageRow, h: FileHooks, redraw: () => void): HTMLElement {
  const card = el("div", "fs-card");
  const add = (k: string, v: string): void => {
    if (!v) return;
    const d = el("div", "fs-card-line");
    d.append(el("b", "", `${t(k)}: `), document.createTextNode(v));
    card.appendChild(d);
  };
  const f = fileStateOf(r.id);
  const what = r.kind === "master" ? t("fs.is.master")
    : r.kind === "version" ? t("fs.is.version", { asset: r.asset })
    : r.kind === "file" ? t("fs.is.file", { asset: r.asset }) : t("fs.is.link");
  add("fs.card.is", what + (r.level ? ` · ${r.level}` : "") + (r.tier ? ` · tier ${r.tier}` : ""));
  add("fs.card.doc", r.doc);
  add("fs.card.use", r.use.map((u) => u.replace(/_/g, " ")).join(", "));
  add("fs.card.rm", r.rm.join(", "));
  add("fs.card.where", f?.path || r.where);
  if (f?.note) add("fs.card.note", f.note);
  const bkc = bucketOf(r.id);
  if (bkc) add("fs.bucket", `${BUCKET_SIGN[bkc.state]} ${t("fs.bm." + bkc.state)}${bkc.note ? " — " + bkc.note : ""}${bkc.bucket ? "\n" + bkc.bucket : ""}`);
  const near = fileRows().filter((x) => x.asset_id === r.asset_id && x.id !== r.id);
  if (near.length) {
    const box = el("div", "fs-near");
    box.appendChild(el("b", "", t("fs.card.near", { n: String(near.length) })));
    for (const x of near.slice(0, 10)) {
      const b = el("button", "ghost fs-near-item", `${x.file} (${x.tag})`) as HTMLButtonElement;
      b.addEventListener("click", () => { listFilter.selected = x.id; redraw(); });
      box.appendChild(b);
    }
    card.appendChild(box);
  }
  if (f) card.appendChild(fileGestures(f, h));
  if (f && (f.state === "on_disk" || f.state === "both") && h.onPromote
      && !(bkc && (bkc.state === "aligned" || bkc.state === "same_size"))) {
    const b = el("button", "ghost fs-act", t("fs.toBucket")) as HTMLButtonElement;
    b.dataset.act = "to-bucket";
    b.title = t("fs.toBucketHint");
    b.addEventListener("click", () => h.onPromote!(f));
    card.appendChild(b);
  }
  return card;
}

/** the line in a resource's Inspector or a document's card */
export function fileStateLine(id: string, h: FileHooks): HTMLElement | null {
  const f = fileStateOf(id);
  if (!f) return null;
  const line = el("div", "fs-line");
  line.appendChild(stateBadge(`file.${f.state}`));
  line.appendChild(fileGestures(f, h));
  if (f.note) line.appendChild(el("div", "insp-hint fs-note", f.note));
  return line;
}

// ── R2 rimasto (E.D., 4 Oct 2026) · the Doc viewer and the Documents table ──

/** the files of ONE document, in the Doc viewer: each with its sign and its
 *  gestures; a file not asked about yet says so, and «Check files» is here */
export function docFilesBox(ids: string[], h: FileHooks): HTMLElement {
  const box = el("div", "fs-docfiles");
  box.dataset.docFiles = String(ids.length);
  const head = el("div", "doc-links", t("fs.docFiles", { n: String(ids.length) }));
  box.appendChild(head);
  if (!ids.length) {
    box.appendChild(el("div", "insp-hint", t("dcard.nofile")));
    return box;
  }
  let unknown = 0;
  for (const id of ids) {
    const f = fileStateOf(id);
    if (f) { box.appendChild(fileRow(f, h, false)); continue; }
    unknown++;
    const row = el("div", "fs-row");
    row.dataset.id = id;
    row.dataset.state = "";
    row.appendChild(el("span", "state-badge st-muted", t("fs.notCheckedShort")));
    row.appendChild(el("span", "fs-name", h.describe?.(id).file ?? id));
    box.appendChild(row);
  }
  if (unknown) {
    const b = el("button", "ghost", h.checking ? t("fs.checking") : t("fs.check")) as HTMLButtonElement;
    b.disabled = h.checking;
    b.dataset.act = "check";
    b.addEventListener("click", () => h.onCheck());
    box.appendChild(b);
  }
  return box;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** the same, as the HTML of a cell or a card of the Documents table (no
 *  gestures: they are in Contents and in the Doc viewer) */
export function docFilesHtml(ids: string[], describe: (id: string) => { file: string }): string {
  return ids.map((id) => {
    const f = fileStateOf(id);
    const file = esc(describe(id).file);
    if (!f) return `<span class="fs-cell" data-file="${esc(id)}"><span class="fs-file">${file}</span></span>`;
    const s = stateSign(`file.${f.state}`);
    return `<span class="fs-cell" data-file="${esc(id)}" data-state="${esc(f.state)}">` +
      `<span class="state-badge st-${s.tone}" data-state="file.${esc(f.state)}" title="${esc(s.meaning)}">${esc(s.glyph)}</span> ` +
      `<span class="fs-file" title="${esc(f.path || f.note || "")}">${file}</span></span>`;
  }).join(" ");
}

/** the signs of a document's files, for its line in a list: one glyph per state
 *  present; null when none was asked about */
export function docFilesGlyphs(ids: string[]): HTMLElement | null {
  const states = [...new Set(ids.map((id) => fileStateOf(id)?.state).filter((s): s is string => !!s))];
  if (!states.length) return null;
  const span = el("span", "fs-glyphs");
  for (const s of FILE_STATES.filter((x) => states.includes(x))) span.appendChild(stateBadge(`file.${s}`, false));
  return span;
}


// ── the table of resource nodes, across EVERY graph of the em.json ───────────
// (the shelf's graph and the study's: «Shelf» window, Table mode, scope «All
// graphs»). The rows are the library's (`storage_rows`); this draws them, with
// the file's state, the bucket sign, the graph each belongs to, and the gestures.

type SortKey = "file" | "kind" | "level" | "use" | "bucket" | "graph" | "doc" | "state" | "size";
const tableSort: { key: SortKey; dir: 1 | -1 } = { key: "graph", dir: 1 };
const SORT_COLS: Array<[SortKey, string]> = [
  ["state", "fs.col.state"], ["file", "fs.col.file"], ["kind", "fs.col.kind"], ["level", "fs.col.level"],
  ["use", "fs.col.use"], ["bucket", "fs.col.bucket"], ["size", "fs.col.size"], ["graph", "fs.col.graph"],
  ["doc", "fs.col.doc"],
];

function sortValue(r: StorageRow, k: SortKey): string | number {
  switch (k) {
    case "bucket": return bucketOf(r.id)?.state ?? "~";
    case "use": return r.use.join(",");
    case "size": return r.size ?? -1;
    default: return String(r[k as keyof StorageRow] ?? "").toLowerCase();
  }
}

function humanBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

/** the whole resource table: toolbar, moved and bucket boxes, filters, rows */
export function resourcesTable(h: FileHooks, redraw: () => void): HTMLElement {
  const wrap = el("div", "fs-restable");
  const head = el("div", "fs-head");
  const rows = fileRows();
  head.appendChild(el("b", "", rows.length ? t("fs.tableTitle", { n: String(rows.length) }) : t("fs.title")));
  const check = el("button", "ghost", h.checking ? t("fs.checking") : t("fs.check")) as HTMLButtonElement;
  check.disabled = h.checking; check.dataset.act = "check";
  check.addEventListener("click", () => h.onCheck());
  head.appendChild(check);
  wrap.appendChild(head);
  if (!rows.length) {
    wrap.appendChild(el("div", "insp-hint", t("fs.notChecked")));
    return wrap;
  }
  const all = fileStates();
  const lost = all.filter((f) => f.state === "missing" || f.state === "empty_copy");
  if ((lost.length || movedFiles().length) && h.onFindMoved) wrap.appendChild(movedBox(lost.length, h));
  if (h.onBucketCheck) wrap.appendChild(bucketBox(h));
  // filters: the words, the kind, the use, the graph, the state
  const tools = el("div", "fs-tools");
  const q = el("input", "fs-search") as HTMLInputElement;
  q.type = "search"; q.placeholder = t("fs.search"); q.value = listFilter.query; q.dataset.role = "files-search";
  const kind = el("select", "fs-kind") as HTMLSelectElement;
  for (const k of ["", "master", "version", "file", "link"])
    kind.appendChild(new Option(t(k ? `fs.kind.${k}` : "fs.kind.all"), k, false, k === listFilter.kind));
  const use = el("select", "fs-use") as HTMLSelectElement;
  use.appendChild(new Option(t("fs.use.all"), "", false, !listFilter.use));
  for (const u of [...new Set(rows.flatMap((r) => r.use))].sort())
    use.appendChild(new Option(u.replace(/_/g, " "), u, false, u === listFilter.use));
  const graphSel = el("select", "fs-graph") as HTMLSelectElement;
  graphSel.appendChild(new Option(t("fs.graph.all"), "", false, !listFilter.graph));
  for (const g of [...new Set(rows.map((r) => r.graph).filter(Boolean))].sort())
    graphSel.appendChild(new Option(g, g, false, g === listFilter.graph));
  tools.append(q, kind, use);
  if (graphSel.options.length > 2) tools.appendChild(graphSel);
  wrap.appendChild(tools);
  const chips = el("div", "fs-chips");
  const counts = fileSummary();
  for (const s of FILE_STATES) {
    const n = counts[s] ?? 0;
    if (!n) continue;
    const sign = stateSign(`file.${s}`);
    const c = el("button", `fs-chip st-${sign.tone}${fileFilter === s ? " is-on" : ""}`,
                 `${sign.glyph} ${n} ${sign.label}`) as HTMLButtonElement;
    c.dataset.filter = s; c.title = sign.meaning;
    c.addEventListener("click", () => { setFileFilter(s); redraw(); });
    chips.appendChild(c);
  }
  wrap.appendChild(chips);

  const holder = el("div", "fs-table-holder");
  wrap.appendChild(holder);
  const paint = (): void => {
    holder.textContent = "";
    const shown = filterRows(rows, { ...listFilter, state: fileFilter })
      .sort((a, b) => {
        const x = sortValue(a, tableSort.key), y = sortValue(b, tableSort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * tableSort.dir;
      });
    const table = el("table", "shelf-table fs-table");
    const thead = el("thead"), hr = el("tr");
    for (const [key, label] of SORT_COLS) {
      const th = el("th", `c-${key}${tableSort.key === key ? " is-sorted" : ""}`,
                    t(label) + (tableSort.key === key ? (tableSort.dir === 1 ? " ▲" : " ▼") : ""));
      th.addEventListener("click", () => {
        tableSort.dir = tableSort.key === key ? (tableSort.dir === 1 ? -1 : 1) : 1;
        tableSort.key = key; paint();
      });
      hr.appendChild(th);
    }
    hr.appendChild(el("th", "", ""));
    thead.appendChild(hr);
    const tbody = el("tbody");
    for (const r of shown.slice(0, 500)) tbody.appendChild(tableRow(r, h));
    table.append(thead, tbody);
    holder.appendChild(table);
    holder.appendChild(el("div", "insp-hint", t("fs.tableCount", { n: String(shown.length), all: String(rows.length) })));
  };
  q.addEventListener("input", () => { listFilter.query = q.value; paint(); });
  kind.addEventListener("change", () => { listFilter.kind = kind.value; paint(); });
  use.addEventListener("change", () => { listFilter.use = use.value; paint(); });
  graphSel.addEventListener("change", () => { listFilter.graph = graphSel.value; paint(); });
  paint();
  return wrap;
}

function tableRow(r: StorageRow, h: FileHooks): HTMLElement {
  const tr = el("tr", `fs-trow fs-k-${r.kind}`);
  tr.dataset.id = r.id; tr.dataset.kind = r.kind; tr.dataset.state = r.state;
  const td = (cls: string, ...kids: Array<Node | string>): HTMLElement => {
    const c = el("td", `c-${cls}`);
    for (const k of kids) c.append(k);
    return c;
  };
  tr.appendChild(td("state", stateBadge(`file.${r.state}`)));
  const name = el("button", "ghost fs-name", r.file) as HTMLButtonElement;
  name.title = [r.where, r.sha256].filter(Boolean).join("\n");
  name.addEventListener("click", () => h.onJump(r.id));
  tr.appendChild(td("file", name));
  tr.appendChild(td("kind", r.kind === "version" ? "↳ " + t("fs.kind.version") : t("fs.kind." + r.kind)));
  tr.appendChild(td("level", r.level));
  tr.appendChild(td("use", r.use.map((u) => u.replace(/_/g, " ")).join(", ")));
  const bk = bucketOf(r.id);
  const bc = td("bucket");
  if (bk) {
    const g = el("span", `fs-bk st-${bk.state}`, `${BUCKET_SIGN[bk.state]} ${t("fs.b." + bk.state)}`);
    g.title = (t("fs.bm." + bk.state)) + (bk.note ? " — " + bk.note : "") + (bk.bucket ? "\n" + bk.bucket : "");
    bc.appendChild(g);
  }
  tr.appendChild(bc);
  tr.appendChild(td("size", humanBytes(r.size ?? bk?.size_disk ?? null)));
  tr.appendChild(td("graph", r.graph));
  const docc = td("doc", r.doc);
  if (r.rm.length) docc.title = t("fs.card.rm") + ": " + r.rm.join(", ");
  tr.appendChild(docc);
  const f = fileStateOf(r.id);
  const acts = td("acts");
  if (f) {
    acts.appendChild(fileGestures(f, h));
    if ((f.state === "on_disk" || f.state === "both") && h.onPromote
        && !(bk && (bk.state === "aligned" || bk.state === "same_size"))) {
      const b = el("button", "ghost fs-act", t("fs.toBucket")) as HTMLButtonElement;
      b.dataset.act = "to-bucket"; b.title = t("fs.toBucketHint");
      b.addEventListener("click", (e) => { e.stopPropagation(); h.onPromote!(f); });
      acts.appendChild(b);
    }
  }
  tr.appendChild(acts);
  return tr;
}
