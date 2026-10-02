// NIGHT-RISORSA-FILE · the inspector of a resource and of a file: its files,
// the resources a file belongs to, the chain of revisions, and the question a
// replacement asks («who points at the old one, and which of them move?»).
//
// `resourceSummary` is PURE (it reads a ResourceGraph and answers data), so
// `check-resources.mjs` asks it directly; `renderResourcePanel` only draws it.
import { t } from "./i18n";
import { addresses } from "./addresses";
import { COMMON_LANGUAGES, contentLanguages, contentLanguagesValue, isLanguageTag } from "./translation";
import { contentDigestOf, formsOf } from "./pack3tz";
import type { DocumentStore } from "./model";
import {
  EDGE_DERIVED_FROM,
  RevisionFork,
  parseBlendLocator,
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
  /** CAMPAGNA · a tileset (folder or .3tz) opened in a Scene window */
  onOpenInScene?(resId: string): void;
  /** dev27 · «controlla»: whether an address answers (the caller fetches, or
   *  asks the bridge, and records it with `checkAddress`) */
  onCheckAddress?(resId: string, locator: string): void;
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
  // ── declared, not stamped ────────────────────────────────────────────────
  const d = (g.node(id)?.data ?? {}) as Record<string, unknown>;
  // ── dev27 · the language of the CONTENT (data.lang on a resource: one tag or
  //    a sorted list, «latino e italiano a fronte»), seen and declared here ──
  panel.appendChild(contentLanguageSection(store, id));
  // ── dev27 · the ADDRESSES of this one resource (same bytes, several places)
  panel.appendChild(addressSection(store, id, h));
  if (d.declared_only) {
    const line = el("div", "insp-hint res-declared", `◌ ${t("declared.notStamped")}`);
    line.dataset.declared = String(d.declared_kind ?? "");
    panel.appendChild(line);
  }
  const blend = typeof d.url === "string" ? parseBlendLocator(d.url) : null;
  if (blend) {
    const line = el("div", "insp-hint res-blend",
      t("declared.onlyBlender", { file: `${blend[0].split("/").pop()} · ${blend[2]}` }));
    line.dataset.blend = blend[0];
    panel.appendChild(line);
  }
  // ── the FORMS: the same content in another packaging (equal content_digest)
  const forms = formsOf(g, id);
  if (forms.length > 1) {
    panel.appendChild(el("h3", "insp-sect", t("res.formsTitle", { n: String(forms.length) })));
    const fl = el("div", "res-forms");
    for (const f of forms) {
      const fd = (f.data ?? {}) as Record<string, unknown>;
      const b = el("button", `insp-btn${f.id === id ? " is-current" : ""}`,
        `${String(f.name ?? f.id)} · ${String(fd.packaging ?? "")}`) as HTMLButtonElement;
      b.dataset.form = String(fd.packaging ?? "");
      if (typeof fd.checksum === "string") b.title = fd.checksum;
      if (f.id === id) b.disabled = true;
      b.addEventListener("click", () => h.onJump(f.id));
      fl.appendChild(b);
    }
    const cd = contentDigestOf(g.node(id));
    fl.appendChild(el("div", "insp-hint", t("res.formsHint", { cd: (cd ?? "").slice(0, 19) })));
    panel.appendChild(fl);
  }
  // ── CAMPAGNA · a TREE opens in the Scene: the root first, the tiles asked
  //    as the camera needs them (never the whole archive)
  if (h.onOpenInScene && (d.packaging === "archive" || d.packaging === "directory"
      || /(\.3tz|(^|\/)tileset\.json)$/i.test(String(d.url ?? "")))) {
    const b = el("button", "insp-btn", t("scene.openHere")) as HTMLButtonElement;
    b.dataset.action = "open-in-scene";
    b.title = t("scene.openHereHint");
    b.addEventListener("click", () => h.onOpenInScene!(id));
    panel.appendChild(b);
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


/** dev27 · «Lingua del contenuto»: a pill per language of the file, × to take
 *  one away, and a menu to add one. The language of the resource's own
 *  description is another thing: it is in the cascade, this is not. */
function contentLanguageSection(store: DocumentStore, id: string): HTMLElement {
  const box = el("div", "res-langs");
  box.dataset.resLangs = "1";
  box.appendChild(el("h3", "insp-sect", t("res.contentLang")));
  const now = contentLanguages(store.node(id));
  const row = el("div", "tr-row");
  const write = (tags: string[]): void => {
    const n = store.node(id);
    if (!n) return;
    const data = { ...((n.data ?? {}) as Record<string, unknown>) };
    const v = contentLanguagesValue(tags);
    if (v === undefined) delete data.lang; else data.lang = v;
    store.updateNode(id, { data } as Partial<import("./types").EmNode>);
  };
  for (const tag of now) {
    const pill = el("button", "tr-pill orig", `${tag} ×`) as HTMLButtonElement;
    pill.type = "button";
    pill.dataset.resLang = tag;
    pill.title = t("res.contentLangRemove", { lang: tag });
    pill.addEventListener("click", () => write(now.filter((x) => x !== tag)));
    row.appendChild(pill);
  }
  const sel = document.createElement("select");
  sel.className = "ing-select";
  sel.dataset.resLangAdd = "1";
  sel.setAttribute("aria-label", t("res.contentLangAdd"));
  const head = document.createElement("option");
  head.value = ""; head.textContent = now.length ? t("res.contentLangAdd") : t("res.contentLangNone");
  sel.appendChild(head);
  for (const l of COMMON_LANGUAGES.filter((x) => !now.includes(x))) {
    const o = document.createElement("option");
    o.value = l; o.textContent = l;
    sel.appendChild(o);
  }
  const other = document.createElement("option");
  other.value = "__other__"; other.textContent = t("res.contentLangOther");
  sel.appendChild(other);
  sel.addEventListener("change", () => {
    let v = sel.value;
    if (v === "__other__") v = (window.prompt(t("res.contentLangOther")) ?? "").trim();
    if (!v) return;
    if (!isLanguageTag(v)) { window.alert(t("tr.err.lang")); return; }
    write([...now, v]);
  });
  row.appendChild(sel);
  box.appendChild(row);
  box.appendChild(el("div", "insp-hint", t("res.contentLangHint")));
  return box;
}

/** dev27 · «Indirizzi»: every place the same bytes are, with its state —
 *  reachable / dead / not checked — and «controlla». A dead address is a
 *  WARNING while a live one remains, never a removal. */
function addressSection(store: DocumentStore, id: string, h: ResourcePanelHooks): HTMLElement {
  const box = el("div", "res-addresses");
  box.dataset.resAddresses = "1";
  const list = addresses(store.node(id));
  box.appendChild(el("h3", "insp-sect", t("res.addresses", { n: String(list.length) })));
  if (!list.length) {
    // DEV29 B3 · a file set whose files are known does not «point nowhere»:
    // its files are listed below, each with its digest
    const files = store.liveEdges().filter((e) => e.source === id && e.edge_type === "has_file").length;
    box.appendChild(el("div", "insp-hint", files ? t("res.addressesFiles", { n: String(files) }) : t("res.addressesNone")));
    return box;
  }
  for (const a of list) {
    const row = el("div", "res-addr");
    row.dataset.addr = a.locator;
    row.dataset.addrState = a.ok === true ? "ok" : a.ok === false ? "dead" : "unchecked";
    row.appendChild(el("span", "res-addr-loc", a.locator));
    if (a.residency) row.appendChild(el("span", "res-addr-res", t(`assets.residency.${a.residency}`)));
    const when = a.checked_at ? ` · ${a.checked_at.slice(0, 16).replace("T", " ")}` : "";
    row.appendChild(el("span", `res-addr-state st-${row.dataset.addrState}`,
      a.ok === true ? `✓ ${t("res.addrOk")}${when}` : a.ok === false ? `✗ ${t("res.addrDead")}${when}` : `◌ ${t("res.addrUnchecked")}`));
    if (h.onCheckAddress) {
      const b = el("button", "insp-btn", t("res.addrCheck")) as HTMLButtonElement;
      b.type = "button";
      b.dataset.addrCheck = a.locator;
      b.addEventListener("click", () => h.onCheckAddress!(id, a.locator));
      row.appendChild(b);
    }
    box.appendChild(row);
  }
  const dead = list.filter((a) => a.ok === false).length;
  const live = list.length - dead;
  if (dead) {
    const w = el("div", live ? "insp-hint res-addr-warn" : "insp-hint res-addr-warn none", live
      ? t("res.addrWarn", { dead: String(dead), live: String(live) })
      : t("res.addrNoneAlive"));
    w.dataset.addrWarning = live ? "dead" : "none-alive";
    box.appendChild(w);
  }
  return box;
}
