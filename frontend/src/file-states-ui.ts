// R2 (E.D., 4 Oct 2026) · the state of the files in EMStudio's desks, with the
// signs of the common list (state-symbols.ts) and the same words as EMtools and
// StratiField. One section, drawn where the files are looked at: the head of
// Contents (Storage), the card of a document, the Inspector of a resource.
// The gestures on one file and on the group: «Find here…» (relink a missing
// one), «Upload to the room», «Keep on the disk too», «Open where it is».
import { t } from "./i18n";
import { stateBadge, stateSign } from "./state-symbols";
import { fileFilter, fileStateOf, fileStates, fileSummary, setFileFilter,
         type FileState } from "./file-states";

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
  /** C1 · the standard tree of an EM project */
  onNewProject?(): void;
  onReorder?(): void;
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

/** one line: badge, name, gestures */
export function fileRow(f: FileState, h: FileHooks): HTMLElement {
  const row = el("div", "fs-row");
  row.dataset.state = f.state;
  row.dataset.id = f.id;
  row.appendChild(stateBadge(`file.${f.state}`));
  const name = el("button", "ghost fs-name", f.name || f.id) as HTMLButtonElement;
  name.title = f.path || f.note || f.id;
  name.addEventListener("click", () => h.onJump(f.id));
  row.appendChild(name);
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
  const list = el("div", "fs-list");
  for (const f of shown.slice(0, 200)) list.appendChild(fileRow(f, h));
  if (shown.length > 200) list.appendChild(el("div", "insp-hint", t("insp.andMore", { n: String(shown.length - 200) })));
  box.appendChild(list);
  return box;
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
