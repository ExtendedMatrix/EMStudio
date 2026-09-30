// NIGHT-RISORSA-FILE · the inspector of a resource and of a file: its files,
// the resources a file belongs to, the chain of revisions, and the question a
// replacement asks («who points at the old one, and which of them move?»).
//
// `resourceSummary` is PURE (it reads a ResourceGraph and answers data), so
// `check-resources.mjs` asks it directly; `renderResourcePanel` only draws it.
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import {
  EDGE_DERIVED_FROM,
  RevisionFork,
  resourceFiles,
  resourcesOfFile,
  revisionsOf,
  storeGraph,
  type Pointer,
  type ResourceGraph,
} from "./resources";

export interface FileRow {
  id: string; role: string; path: string; implicit: boolean;
  size: number | null; checksum: string | null;
  /** the OTHER resources that hold the same file node */
  sharedWith: Array<{ id: string; name: string }>;
}

export interface ResourceSummary {
  kind: "resource" | "file";
  files: FileRow[];
  /** oldest first; `at` = where this resource sits in it */
  revisions: { chain: Array<{ id: string; name: string }>; at: number; fork: string | null };
  /** for a file: the resources that hold it, with its path in each */
  fileOf: Array<{ id: string; name: string; path: string; role: string }>;
  /** for a file: the file it replaced (`dtc_derived_from` file → file) */
  replaces: string | null;
}

const nameOf = (g: ResourceGraph, id: string): string => String(g.node(id)?.name ?? id);

export function resourceSummary(g: ResourceGraph, id: string): ResourceSummary | null {
  const n = g.node(id);
  if (!n) return null;
  if (n.node_type === "resource_file") {
    const fileOf = g.edges().filter((e) => e.edge_type === "has_file" && e.target === id)
      .map((e) => {
        const a = (e.attributes ?? {}) as Record<string, unknown>;
        return { id: e.source, name: nameOf(g, e.source), path: String(a.path ?? ""),
                 role: String(a.role ?? "member") };
      });
    const rep = g.edges().find((e) => e.edge_type === EDGE_DERIVED_FROM && e.source === id
      && g.node(e.target)?.node_type === "resource_file");
    return { kind: "file", files: [], revisions: { chain: [], at: -1, fork: null },
             fileOf, replaces: rep?.target ?? null };
  }
  if (n.node_type !== "resource") return null;
  const family = new Set<string>([id]);
  try { for (const r of revisionsOf(g, id)) family.add(r); } catch { /* a fork: said below */ }
  for (const e of g.edges())
    if (e.edge_type === "was_revision_of" && (e.source === id || e.target === id)) {
      family.add(e.source); family.add(e.target);
    }
  const files: FileRow[] = resourceFiles(g, id).map((f) => {
    const d = (f.node.data ?? {}) as Record<string, unknown>;
    return {
      id: f.node.id, role: f.role, path: f.path, implicit: f.implicit,
      size: typeof d.size_bytes === "number" ? d.size_bytes : null,
      checksum: typeof d.checksum === "string" ? d.checksum : null,
      // a revision shares the files it did not replace: that is the same thing,
      // not another one, and «also in OB_PODIO_LOD1» would say the opposite
      sharedWith: f.implicit ? [] : resourcesOfFile(g, f.node.id).filter((r) => !family.has(r))
        .map((r) => ({ id: r, name: nameOf(g, r) })),
    };
  });
  let chain: string[] = [id];
  let fork: string | null = null;
  try {
    chain = revisionsOf(g, id);
  } catch (e) {
    fork = e instanceof RevisionFork
      ? `${nameOf(g, e.at)} → ${e.branches.map((b) => nameOf(g, b)).join(", ")}`
      : String(e instanceof Error ? e.message : e);
  }
  return { kind: "resource", files,
           revisions: { chain: chain.map((c) => ({ id: c, name: nameOf(g, c) })),
                        at: chain.indexOf(id), fork },
           fileOf: [], replaces: null };
}

export interface ResourcePanelHooks {
  onJump(id: string): void;
  isOpen(id: string): boolean;
  onToggleFiles(id: string): void;
  /** absent = this build cannot read new bytes (the button is not drawn) */
  onReplaceFile?(resId: string, fileId: string | null): void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const kb = (n: number | null): string =>
  n === null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} kB`
    : `${(n / 1048576).toFixed(1)} MB`;
const shortSum = (c: string | null): string =>
  c ? `${c.split(":")[0]}:${(c.split(":")[1] ?? "").slice(0, 8)}…` : "";

export function renderResourcePanel(store: DocumentStore, id: string, h: ResourcePanelHooks): HTMLElement | null {
  const g = storeGraph(store);
  const s = resourceSummary(g, id);
  if (!s) return null;
  const panel = el("div", "insp-canvas res-panel");
  panel.dataset.resPanel = s.kind;
  if (s.kind === "file") {
    panel.appendChild(el("h3", "insp-sect", t("res.fileOf")));
    for (const r of s.fileOf) {
      const b = el("button", "insp-btn", `${r.name} · ${r.path}`) as HTMLButtonElement;
      b.dataset.go = r.id;
      if (r.role === "entry_point") b.title = t("res.entry");
      b.addEventListener("click", () => h.onJump(r.id));
      panel.appendChild(b);
    }
    if (s.replaces) {
      panel.appendChild(el("div", "insp-hint", t("res.replaces")));
      const b = el("button", "insp-btn", nameOf(g, s.replaces)) as HTMLButtonElement;
      b.addEventListener("click", () => h.onJump(s.replaces!));
      panel.appendChild(b);
    }
    return panel;
  }
  // ── the files ────────────────────────────────────────────────────────────
  panel.appendChild(el("h3", "insp-sect", t("res.filesTitle", { n: String(s.files.length) })));
  if (s.files.length === 1 && s.files[0].implicit)
    panel.appendChild(el("div", "insp-hint", t("res.implicit")));
  const list = el("div", "res-files");
  for (const f of s.files) {
    const row = el("div", "res-file");
    row.dataset.role = f.role;
    row.dataset.path = f.path;
    const head = el("div", "res-file-head");
    head.appendChild(el("span", "res-role", f.role === "entry_point" ? "◆" : "·"));
    const name = f.implicit ? el("span", "res-path", f.path)
      : el("button", "insp-btn res-path", f.path) as HTMLButtonElement;
    name.title = f.role === "entry_point" ? t("res.entry") : t("res.member");
    if (!f.implicit) name.addEventListener("click", () => h.onJump(f.id));
    head.appendChild(name);
    if (h.onReplaceFile) {
      const rb = el("button", "insp-btn res-replace", t("res.replace")) as HTMLButtonElement;
      rb.dataset.replace = f.implicit ? "" : f.id;
      rb.addEventListener("click", () => h.onReplaceFile!(id, f.implicit ? null : f.id));
      head.appendChild(rb);
    }
    row.appendChild(head);
    const meta = [kb(f.size), shortSum(f.checksum)].filter(Boolean).join(" · ");
    if (meta) row.appendChild(el("div", "insp-hint", meta));
    if (f.sharedWith.length) {
      const sh = el("div", "insp-hint res-shared",
        t("res.sharedWith", { names: f.sharedWith.map((r) => r.name).join(", ") }));
      row.appendChild(sh);
    }
    list.appendChild(row);
  }
  panel.appendChild(list);
  if (s.files.length > 1) {
    const open = h.isOpen(id);
    const tb = el("button", "insp-btn", open ? t("res.close") : t("res.open")) as HTMLButtonElement;
    tb.dataset.action = "toggle-files";
    tb.addEventListener("click", () => h.onToggleFiles(id));
    panel.appendChild(tb);
  }
  // ── the revisions ────────────────────────────────────────────────────────
  const rv = s.revisions;
  if (rv.fork) {
    const w = el("div", "insp-hint res-fork", `⚠ ${t("res.fork", { detail: rv.fork })}`);
    panel.appendChild(w);
  } else if (rv.chain.length > 1) {
    panel.appendChild(el("h3", "insp-sect", t("res.revisions")));
    const ol = el("ol", "res-revisions");
    rv.chain.forEach((r, i) => {
      const li = el("li");
      const b = el("button", `insp-btn${i === rv.at ? " is-current" : ""}`, `${i + 1} · ${r.name}`) as HTMLButtonElement;
      b.dataset.go = r.id;
      if (i === rv.at) b.disabled = true;
      b.addEventListener("click", () => h.onJump(r.id));
      li.appendChild(b);
      if (i === rv.at) li.appendChild(el("span", "insp-hint", ` ${t("res.here")}`));
      ol.appendChild(li);
    });
    panel.appendChild(ol);
    if (rv.at < rv.chain.length - 1) {
      const last = rv.chain.at(-1)!;
      const go = el("button", "insp-btn", t("res.goLatest")) as HTMLButtonElement;
      go.dataset.action = "latest";
      go.addEventListener("click", () => h.onJump(last.id));
      panel.appendChild(go);
    }
  }
  return panel;
}

/** What a pointer is, for the question: «RM PODIO (RM) — has_linked_resource». */
export function describePointer(g: ResourceGraph, p: Pointer): string {
  const src = g.node(p.source);
  return `${String(src?.name ?? p.source)} (${String(src?.node_type ?? "?")}) — ${p.edge_type}`;
}

/** The question after a replacement: who points at the old resource, and which
 *  of them move to the new one. «All» is the proposal. Resolves the chosen edge
 *  ids ([] = leave them all on the old one). */
export function askWhichPointersMove(g: ResourceGraph, name: string, pointers: Pointer[],
    staying: Pointer[] = []): Promise<string[]> {
  return new Promise((resolve) => {
    const back = el("div", "res-modal-back");
    const box = el("div", "res-modal");
    box.setAttribute("role", "dialog");
    box.dataset.dialog = "replace-pointers";
    box.appendChild(el("h3", "insp-sect", t("res.replaceTitle", { name })));
    if (!pointers.length) {
      box.appendChild(el("div", "insp-hint", t("res.nobodyPoints")));
      const ok = el("button", "insp-btn", "OK") as HTMLButtonElement;
      ok.addEventListener("click", () => { back.remove(); resolve([]); });
      box.appendChild(ok);
    } else {
      box.appendChild(el("div", "insp-hint", t("res.replaceHint")));
      const all = document.createElement("input");
      all.type = "checkbox"; all.checked = true; all.dataset.all = "1";
      const allRow = el("label", "res-ptr res-ptr-all");
      allRow.append(all, ` ${t("res.moveAll")}`);
      box.appendChild(allRow);
      const boxes: HTMLInputElement[] = [];
      for (const p of pointers) {
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = true; cb.value = p.edge_id;
        boxes.push(cb);
        const row = el("label", "res-ptr");
        row.append(cb, ` ${describePointer(g, p)}`);
        box.appendChild(row);
        cb.addEventListener("change", () => { all.checked = boxes.every((b) => b.checked); });
      }
      all.addEventListener("change", () => { for (const b of boxes) b.checked = all.checked; });
      const bar = el("div", "insp-actions");
      const move = el("button", "insp-btn", t("res.move")) as HTMLButtonElement;
      move.dataset.action = "move";
      move.addEventListener("click", () => {
        back.remove(); resolve(boxes.filter((b) => b.checked).map((b) => b.value));
      });
      const keep = el("button", "insp-btn", t("res.keep")) as HTMLButtonElement;
      keep.dataset.action = "keep";
      keep.addEventListener("click", () => { back.remove(); resolve([]); });
      bar.append(move, keep);
      box.appendChild(bar);
    }
    if (staying.length) {
      const st = el("div", "insp-hint res-ptr-staying",
        t("res.chainStays", { who: staying.map((p) => describePointer(g, p)).join("; ") }));
      box.insertBefore(st, box.querySelector(".insp-actions") ?? null);
    }
    back.appendChild(box);
    document.body.appendChild(back);
    (box.querySelector("button") as HTMLButtonElement | null)?.focus();
  });
}
