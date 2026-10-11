// R2 (E.D., 4 Oct 2026) · the state of the files in EMStudio's desks, with the
// signs of the common list (state-symbols.ts) and the same words as EMtools and
// StratiField. One section, drawn where the files are looked at: the head of
// Contents (Storage), the card of a document, the Inspector of a resource.
// The gestures on one file and on the group: «Find here…» (relink a missing
// one), «Upload to the room», «Keep on the disk too», «Open where it is».
import { t } from "./i18n";
import { stateBadge, stateSign } from "./state-symbols";
import { fileFilter, fileRows, fileStateOf, fileStates, fileSummary, filterRows, listFilter,
         movedFiles, setFileFilter, type FileState, type MovedFile, type StorageRow } from "./file-states";

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
  check.disabled = h.checking;
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
  if (!all.length) {
    box.appendChild(el("div", "insp-hint", t("fs.notChecked")));
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
