/**
 * COLLEGARE · «Nuovo documento…» — a new document is always a decision.
 *
 * A document is a SOURCE: it has a name in the study's own numbering (D.nn), a
 * description that says what it is, and usually a file. Creating one as a side
 * effect of a menu pick — a bare «D.04» nobody described — is how a graph fills
 * with documents nobody can tell apart. So every path that creates one (the
 * maniglia of an extractor, Shift+A, the narrative's «Immagine o documento»,
 * a file dropped on a chapter) opens this small form first, and only its
 * submit creates the node.
 *
 * What it asks is what the datamodel HAS: `name`, `description` and
 * `data.filename` (the Documents sheet's own FILENAME column). There is no
 * «supporto» field in the EM datamodel: the medium is read off the file's
 * extension where it matters (`mediumOfFile`), never stored as a second truth.
 *
 * Pure DOM, no store: the caller creates the node with what comes back, so the
 * creation stays one undo step in the caller's batch.
 */
import { t } from "./i18n";

export interface NewDocumentValues {
  name: string;
  description: string;
  filename: string;
}

/** What a file's extension says about what it is, for choosing how to SHOW it
 *  (a 3D model → a scene, anything else → a document card). Not stored. */
export type Medium = "3d" | "image" | "text";
const MEDIUM_BY_EXT: Record<string, Medium> = {
  glb: "3d", gltf: "3d", obj: "3d", ply: "3d", las: "3d", laz: "3d", e57: "3d", fbx: "3d",
  pdf: "text", txt: "text", md: "text", doc: "text", docx: "text", odt: "text", csv: "text",
};
export function mediumOfFile(filename: string | undefined): Medium {
  // MICRO-3DTILES · a tileset's entry point is a .json, and it is a 3D model
  if (/(^|\/)tileset\.json$/i.test(filename ?? "")) return "3d";
  const ext = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  return MEDIUM_BY_EXT[ext] ?? "image";
}

/** A file name as a description to start from: «muro_nord-2026.jpg» → «muro nord 2026». */
export function descriptionFromFile(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

let open: HTMLElement | null = null;

export function closeNewDocumentForm(): void {
  open?.remove();
  open = null;
}

export function newDocumentFormIsOpen(): boolean {
  return !!open;
}

/**
 * Open the form at a client point. `onSubmit` receives the values; Esc,
 * «Annulla» or a click outside close it without creating anything.
 */
export function openNewDocumentForm(
  clientX: number,
  clientY: number,
  preset: Partial<NewDocumentValues> & { name: string },
  onSubmit: (v: NewDocumentValues) => void,
  opts: { title?: string } = {},
): HTMLFormElement {
  closeNewDocumentForm();
  const box = document.createElement("div");
  box.className = "addm docform";
  box.setAttribute("role", "dialog");
  const head = document.createElement("div");
  head.className = "addm-head";
  const b = document.createElement("b");
  b.textContent = opts.title ?? t("doc.formTitle");
  head.appendChild(b);
  box.appendChild(head);

  const form = document.createElement("form");
  form.className = "docform-f";
  const field = (key: keyof NewDocumentValues, label: string, value: string,
                 placeholder = "", required = false): HTMLInputElement => {
    const l = document.createElement("label");
    l.textContent = label;
    const inp = document.createElement("input");
    inp.name = key;
    inp.value = value;
    inp.placeholder = placeholder;
    inp.required = required;
    inp.autocomplete = "off";
    l.appendChild(inp);
    form.appendChild(l);
    return inp;
  };
  field("name", t("doc.name"), preset.name, "", true);
  const desc = field("description", t("doc.desc"), preset.description ?? "", t("doc.descPh"), true);
  field("filename", t("doc.file"), preset.filename ?? "", t("doc.filePh"));
  const acts = document.createElement("div");
  acts.className = "docform-acts";
  const ok = document.createElement("button");
  ok.type = "submit";
  ok.className = "docform-ok";
  ok.textContent = t("doc.create");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("doc.cancel");
  cancel.addEventListener("click", closeNewDocumentForm);
  acts.append(ok, cancel);
  form.appendChild(acts);
  box.appendChild(form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const v: NewDocumentValues = {
      name: String(fd.get("name") ?? "").trim() || preset.name,
      description: String(fd.get("description") ?? "").trim(),
      filename: String(fd.get("filename") ?? "").trim(),
    };
    closeNewDocumentForm();
    onSubmit(v);
  });
  form.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") {
      e.stopPropagation();
      closeNewDocumentForm();
    }
  });
  const outside = (e: PointerEvent): void => {
    if (open !== box) {
      document.removeEventListener("pointerdown", outside, true);
      return;
    }
    if (!box.contains(e.target as Node)) closeNewDocumentForm();
  };
  document.addEventListener("pointerdown", outside, true);

  document.body.appendChild(box);
  const r = box.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(clientX, window.innerWidth - r.width - 8)) + "px";
  box.style.top = Math.max(8, Math.min(clientY, window.innerHeight - r.height - 8)) + "px";
  open = box;
  setTimeout(() => desc.focus(), 0);
  return form;
}
