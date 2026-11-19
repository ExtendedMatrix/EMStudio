/**
 * MICRO-PL16-CONSOLE (W13, E.D. 18 Nov 2026) · the Python console.
 *
 * *Strumenti ▸ Console Python…*, only with «Funzioni sperimentali» on (D-7,
 * W-12): off, there is no button and no word of it. A floating window like
 * «Estensioni» and «Vocabolari», detachable like them (SPEC-plugin §9).
 *
 * What is inside: `em` imported, `g = em.graph`, `sel = em.app.selection()` —
 * the bridge's session (W12, `py-session.ts`, `tools/em_py.py`) on the open
 * document. Every `em.write` comes back as ONE undo step with its Log line and
 * the code that ran in the act's DTC (the bridge writes it, D-8): what the
 * console shows of it is the line «scritto».
 *
 *   · RUN — Enter runs a complete line (a line ending in «:» or with a bracket
 *     still open goes on, as in Python's prompt; a block of several lines runs
 *     on an empty last line); ⌘/Ctrl+Enter always runs; Shift+Enter a new line;
 *   · TRY («Prova») — the same code with every `em.write` a proof (`dry_run`
 *     forced by the host): what it WOULD write, node by node, nothing applied;
 *   · HISTORY — this machine's (`~/.s3dgraphy/console_history`, bridge level
 *     82), ↑/↓ on the first/last line, Ctrl+R searches backwards;
 *   · COMPLETION — Tab (`/py/complete`: the names of the session, the ids and
 *     names of the nodes and the package's qualia inside a string).
 *
 * Pure of `main.ts`: the page gives a {@link ConsoleHost}; the state lives here
 * so a rebuild of the window (a detach, the language) loses nothing.
 */
import type { PyOutcome, PyProofWire } from "./py-session";

/** what a run's proof says (`em_py.proof_of`) */
export type PyProof = PyProofWire;

export interface HistoryEntry { code: string; at?: string | null; dry_run?: boolean }

export interface ConsoleHost {
  t(key: string, vars?: Record<string, string>): string;
  /** null: ready; else why the console cannot run here (said in the window) */
  unavailable(): Promise<string | null>;
  run(code: string, opts: { dryRun?: boolean; history?: boolean }): Promise<PyOutcome>;
  complete(text: string): Promise<string[]>;
  /** this machine's history, the oldest first (empty: none, or an older bridge) */
  history(): Promise<HistoryEntry[]>;
  /** the open document's name (null: none) */
  docName(): string | null;
}

export type LineKind = "in" | "out" | "value" | "error" | "step" | "proof" | "info";
export interface Line { kind: LineKind; text: string; dry?: boolean; detail?: string[] }

/** the console's memory while the page lives */
export interface ConsoleState {
  lines: Line[];
  history: string[];
  historyLoaded: boolean;
  /** -1: the draft; else the index into `history` shown in the input */
  at: number;
  draft: string;
  busy: boolean;
  /** Ctrl+R: the query, and the index of the match shown */
  search: { query: string; at: number } | null;
}

/** the bridge level of the console's history and proofs (/py/history) */
export const CONSOLE_LEVEL = 82;
export const LINES_MAX = 500;
export const HISTORY_KEEP = 1000;

export function newConsoleState(): ConsoleState {
  return { lines: [], history: [], historyLoaded: false, at: -1, draft: "", busy: false, search: null };
}

// ── pure pieces ─────────────────────────────────────────────────────────────

/** Brackets and strings still open at the end of `code` (comments skipped). */
export function openBrackets(code: string): number {
  let depth = 0;
  let quote: string | null = null;
  let triple = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (triple) {
        if (code.startsWith(quote.repeat(3), i)) { quote = null; triple = false; i += 2; }
      } else if (c === quote) quote = null;
      else if (c === "\n") quote = null;   // an unterminated string: Python says so
      continue;
    }
    if (c === "#") { while (i < code.length && code[i] !== "\n") i++; continue; }
    if (c === "'" || c === '"') {
      if (code.startsWith(c.repeat(3), i)) { quote = c; triple = true; i += 2; } else quote = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
  }
  return depth + (quote && triple ? 1 : 0);
}

/** Enter runs the code, as Python's prompt does: a single complete line runs;
 *  a line ending in «:» or «\», or with a bracket open, goes on; a block of
 *  several lines runs once its last line is empty. */
export function enterRuns(code: string): boolean {
  if (!code.trim()) return false;
  if (openBrackets(code) > 0) return false;
  const lines = code.split("\n");
  const last = lines[lines.length - 1];
  if (lines.length === 1) return !/[:\\]\s*$/.test(last.replace(/#.*$/, ""));
  return last.trim() === "";
}

/** The part of `before` a completion replaces: inside an open string the text
 *  after its quote, else the dotted name at the end (the bridge's rule). */
export function completionTail(before: string): string {
  const m = /(["'])([^"']*)$/.exec(before);
  if (m && before.split(m[1]).length % 2 === 0) return m[2];
  return /[A-Za-z_][\w.]*$/.exec(before)?.[0] ?? "";
}

/** The longest start every string shares. */
export function commonPrefix(xs: string[]): string {
  if (!xs.length) return "";
  let p = xs[0];
  for (const x of xs.slice(1)) {
    let i = 0;
    while (i < p.length && i < x.length && p[i] === x[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}

/** What Tab does with the bridge's matches: the text that replaces the tail
 *  (the one match, else their common start when it is longer), and the list
 *  to show when there is more than one. */
export function completeWith(before: string, matches: string[]): { replace: string | null; tail: string; list: string[] } {
  const tail = completionTail(before);
  const ms = [...new Set(matches)];
  if (!ms.length) return { replace: null, tail, list: [] };
  if (ms.length === 1) return { replace: ms[0], tail, list: [] };
  const p = commonPrefix(ms);
  return { replace: p.length > tail.length ? p : null, tail, list: ms };
}

/** Ctrl+R: the newest entry before `from` (exclusive; -1 = from the newest)
 *  that contains `query`, else -1. */
export function searchBack(history: string[], query: string, from = -1): number {
  const start = from < 0 ? history.length - 1 : from - 1;
  if (!query) return start >= 0 ? start : -1;
  const q = query.toLowerCase();
  for (let i = start; i >= 0; i--) if (history[i].toLowerCase().includes(q)) return i;
  return -1;
}

/** The history, one more entry (not twice the same code in a row). */
export function pushHistory(history: string[], code: string): string[] {
  const c = code.replace(/\s+$/, "");
  if (!c.trim() || history[history.length - 1] === c) return history;
  const out = [...history, c];
  return out.length > HISTORY_KEEP ? out.slice(out.length - HISTORY_KEEP) : out;
}

/** ↑ and ↓: where the history goes from `at` (-1 = the draft); null: stay. */
export function historyStep(len: number, at: number, dir: -1 | 1): number | null {
  if (!len) return null;
  if (dir < 0) {
    if (at === -1) return len - 1;
    return at > 0 ? at - 1 : null;
  }
  if (at === -1) return null;
  return at < len - 1 ? at + 1 : -1;
}

/** The code echoed as Python's prompt shows it. */
export function echo(code: string): string {
  return code.replace(/\s+$/, "").split("\n").map((l, i) => (i ? "... " : ">>> ") + l).join("\n");
}

function opText(o: Record<string, unknown>): string {
  const show = (v: unknown): string => {
    const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v ?? null);
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  };
  if (o.op === "update_field") return o.remove ? `~ ${o.node_id} ${o.field} ∅` : `~ ${o.node_id} ${o.field} = ${show(o.value)}`;
  if (o.op === "remove_node") return `− ${o.id}`;
  if (o.op === "remove_edge") return o.id ? `− ${o.id}` : `− ${o.source} —${o.edge_type ?? "?"}→ ${o.target}`;
  return JSON.stringify(o);
}

/** A proof, line by line: what it would add, change, remove. */
export function proofLines(p: PyProof): string[] {
  const out: string[] = [];
  for (const n of p.nodes) out.push(`+ ${n.id}${n.type ? ` (${n.type})` : ""}${n.name && n.name !== n.id ? ` ${n.name}` : ""}`);
  for (const e of p.edges) out.push(`+ ${e.source} —${e.type}→ ${e.target}`);
  for (const o of p.ops) out.push(opText(o));
  const shown = p.nodes.length + p.edges.length + p.ops.length;
  const all = p.counts.nodes + p.counts.edges + p.counts.ops;
  if (all > shown) out.push(`… +${all - shown}`);
  return out;
}

/** What a run shows, after its echo. */
export function outcomeLines(o: PyOutcome, t: ConsoleHost["t"], dry: boolean): Line[] {
  const out: Line[] = [];
  if (o.output) out.push({ kind: "out", text: o.output.replace(/\n$/, "") });
  for (const s of o.steps ?? [])
    out.push({ kind: "step", text: t(s.volatile ? "pyc.stepProposal" : "pyc.step", { label: s.label, n: String(s.ids?.length ?? 0) })
      + (s.refused?.length ? ` · ${t("py.partial", { n: String(s.refused.length) })}` : "") });
  for (const p of o.proofs ?? [])
    out.push({ kind: "proof", dry: true, text: t("pyc.proof", { label: p.label, nodes: String(p.counts.nodes),
      edges: String(p.counts.edges), ops: String(p.counts.ops) }), detail: proofLines(p) });
  if (o.value !== undefined && o.value !== null) out.push({ kind: "value", text: o.value });
  if (!o.ok) out.push({ kind: "error", text: o.error || o.status });
  else if (dry && !(o.proofs ?? []).length && !(o.steps ?? []).length) out.push({ kind: "info", text: t("pyc.proofNone") });
  return out;
}

// ── the window ──────────────────────────────────────────────────────────────

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => HTMLElementTagNameMap[K];
function maker(doc: Document): El {
  return (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
}

function lineEl(el: El, l: Line, t: ConsoleHost["t"]): HTMLElement {
  const row = el("div", `pyc-line pyc-k-${l.kind}${l.dry ? " pyc-dry" : ""}`);
  if (l.kind === "in" && l.dry) row.append(el("span", "pyc-tag", t("pyc.tagTry")));
  row.append(el("span", "pyc-text", l.text));
  if (l.detail?.length) {
    const d = el("div", "pyc-detail");
    for (const x of l.detail) d.append(el("div", "", x));
    row.append(d);
  }
  return row;
}

/**
 * The window's content. Built from `state` whenever the window is rebuilt; a
 * run, a completion, the history move the elements in place (no rebuild
 * under the person typing).
 */
export function consoleContent(doc: Document, host: ConsoleHost, state: ConsoleState): HTMLElement {
  const t = host.t;
  const el = maker(doc);
  const root = el("div", "pyc");
  root.dataset.pyConsole = "1";

  const head = el("div", "pyc-head");
  const where = el("span", "pyc-where", host.docName() ? t("pyc.on", { doc: host.docName()! }) : t("pyc.noDoc"));
  const note = el("span", "pyc-note", t("pyc.experimental"));
  head.append(where, note);

  const out = el("div", "pyc-out");
  out.setAttribute("role", "log");
  out.setAttribute("aria-live", "polite");
  if (!state.lines.length) out.append(lineEl(el, { kind: "info", text: t("pyc.welcome") }, t));
  for (const l of state.lines) out.append(lineEl(el, l, t));

  const list = el("div", "pyc-complete");
  list.hidden = true;
  const searchRow = el("div", "pyc-search");
  searchRow.hidden = !state.search;
  const searchLabel = el("span", "pyc-search-l", t("pyc.search"));
  const searchIn = el("input", "pyc-search-in");
  searchIn.type = "text";
  searchIn.spellcheck = false;
  searchIn.value = state.search?.query ?? "";
  searchRow.append(searchLabel, searchIn);

  const input = el("textarea", "pyc-input");
  input.rows = 3;
  input.spellcheck = false;
  input.autocapitalize = "off";
  input.setAttribute("autocomplete", "off");
  input.placeholder = t("pyc.placeholder");
  input.value = state.at >= 0 ? state.history[state.at] ?? "" : state.draft;

  const bar = el("div", "pyc-bar");
  const btn = (label: string, title: string, fn: () => void, cls = ""): HTMLButtonElement => {
    const b = el("button", cls, label);
    b.type = "button";
    b.title = title;
    b.addEventListener("click", fn);
    return b;
  };
  const runB = btn(t("pyc.run"), t("pyc.runTitle"), () => void go(false), "primary");
  const tryB = btn(t("pyc.try"), t("pyc.tryTitle"), () => void go(true));
  const helpB = btn(t("pyc.help"), t("pyc.helpTitle"), () => void go(false, "em.help()", false));
  const clearB = btn(t("pyc.clear"), t("pyc.clearTitle"), () => { state.lines = []; out.replaceChildren(); });
  runB.dataset.pyc = "run"; tryB.dataset.pyc = "try"; helpB.dataset.pyc = "help"; clearB.dataset.pyc = "clear";
  const status = el("span", "pyc-status");
  bar.append(runB, tryB, helpB, clearB, status);
  root.append(head, out, list, searchRow, input, bar);

  const scrollDown = (): void => { out.scrollTop = out.scrollHeight; };
  const add = (ls: Line[]): void => {
    if (!state.lines.length) out.replaceChildren();
    for (const l of ls) { state.lines.push(l); out.append(lineEl(el, l, t)); }
    const over = state.lines.length - LINES_MAX;
    if (over > 0) { state.lines.splice(0, over); for (let i = 0; i < over; i++) out.firstElementChild?.remove(); }
    scrollDown();
  };
  const setBusy = (on: boolean): void => {
    state.busy = on;
    for (const b of [runB, tryB, helpB]) b.disabled = on;
    status.textContent = on ? t("pyc.running") : "";
  };
  const setInput = (v: string): void => {
    input.value = v;
    input.selectionStart = input.selectionEnd = v.length;
  };
  const hideList = (): void => { list.hidden = true; list.replaceChildren(); };

  void (async () => {
    const why = await host.unavailable();
    if (why) { status.textContent = why; status.classList.add("pyc-why"); runB.disabled = tryB.disabled = helpB.disabled = true; return; }
    if (!state.historyLoaded) {
      state.historyLoaded = true;
      const h = await host.history().catch(() => []);
      // the machine's first, then what this page ran before it answered
      let merged: string[] = [];
      for (const e of h) merged = pushHistory(merged, e.code);
      for (const c of state.history) merged = pushHistory(merged, c);
      state.history = merged;
    }
  })();
  if (state.busy) setBusy(true);

  async function go(dry: boolean, code = input.value, keep = true): Promise<void> {
    if (state.busy || !code.trim()) return;
    const why = await host.unavailable();
    if (why) { add([{ kind: "error", text: why }]); return; }
    hideList();
    where.textContent = host.docName() ? t("pyc.on", { doc: host.docName()! }) : t("pyc.noDoc");
    if (keep) {
      state.history = pushHistory(state.history, code);
      state.at = -1;
      state.draft = "";
      setInput("");
    }
    add([{ kind: "in", text: echo(code), dry }]);
    setBusy(true);
    try {
      const o = await host.run(code.replace(/\s+$/, ""), { dryRun: dry, history: keep });
      add(outcomeLines(o, t, dry));
    } catch (e) {
      add([{ kind: "error", text: String((e as Error)?.message ?? e) }]);
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  async function tab(): Promise<void> {
    const pos = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, pos);
    const lineStart = before.slice(before.lastIndexOf("\n") + 1);
    if (!lineStart.trim()) { input.setRangeText("    ", pos, pos, "end"); return; }
    const matches = await host.complete(before).catch(() => []);
    const c = completeWith(before, matches);
    if (c.replace != null) {
      input.setRangeText(c.replace, pos - c.tail.length, pos, "end");
      state.draft = state.at < 0 ? input.value : state.draft;
    }
    list.replaceChildren();
    if (c.list.length) {
      for (const m of c.list.slice(0, 60)) {
        const b = el("button", "pyc-match", m);
        b.type = "button";
        b.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const p = input.selectionStart ?? input.value.length;
          const tail = completionTail(input.value.slice(0, p));
          input.setRangeText(m, p - tail.length, p, "end");
          hideList();
          input.focus();
        });
        list.append(b);
      }
      if (c.list.length > 60) list.append(el("span", "pyc-more", `… +${c.list.length - 60}`));
      list.hidden = false;
    } else if (c.replace == null) {
      list.append(el("span", "pyc-more", t("pyc.noMatch")));
      list.hidden = false;
      setTimeout(hideList, 1200);
    } else hideList();
  }

  const showSearch = (): void => {
    const s = state.search;
    if (!s) return;
    searchLabel.textContent = s.at < 0 && s.query ? t("pyc.searchNone") : t("pyc.search");
    if (s.at >= 0) setInput(state.history[s.at]);
  };
  const openSearch = (): void => {
    if (state.search) {
      // Ctrl+R again: an older match
      const at = searchBack(state.history, state.search.query, state.search.at < 0 ? -1 : state.search.at);
      if (at >= 0) state.search.at = at;
      showSearch();
      return;
    }
    state.search = { query: "", at: -1 };
    searchRow.hidden = false;
    searchIn.value = "";
    searchIn.focus();
    showSearch();
  };
  const closeSearch = (accept: boolean): void => {
    const s = state.search;
    state.search = null;
    searchRow.hidden = true;
    if (accept && s && s.at >= 0) { state.at = -1; state.draft = state.history[s.at]; setInput(state.draft); }
    else setInput(state.at >= 0 ? state.history[state.at] : state.draft);
    input.focus();
  };
  searchIn.addEventListener("input", () => {
    if (!state.search) return;
    state.search.query = searchIn.value;
    state.search.at = searchBack(state.history, searchIn.value);
    showSearch();
  });
  searchIn.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); closeSearch(false); }
    else if (ev.key === "Enter") { ev.preventDefault(); closeSearch(true); }
    else if ((ev.key === "r" || ev.key === "R") && ev.ctrlKey) { ev.preventDefault(); openSearch(); }
  });

  input.addEventListener("input", () => {
    if (state.at >= 0) state.at = -1;   // an entry of the history edited: it is the draft now
    state.draft = input.value;
    if (!list.hidden) hideList();
  });
  input.addEventListener("keydown", (ev) => {
    // the console keeps its keys: none reaches the page's shortcuts
    ev.stopPropagation();
    const v = input.value;
    const pos = input.selectionStart ?? 0;
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); void go(ev.shiftKey); return; }
    if (ev.key === "Enter" && !ev.shiftKey && !ev.altKey && pos === v.length && enterRuns(v)) { ev.preventDefault(); void go(false); return; }
    if (ev.key === "Tab" && !ev.shiftKey) { ev.preventDefault(); void tab(); return; }
    if (ev.key === "Escape") { if (!list.hidden) { ev.preventDefault(); hideList(); } return; }
    if ((ev.key === "r" || ev.key === "R") && ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); openSearch(); return; }
    if ((ev.key === "l" || ev.key === "L") && ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); clearB.click(); return; }
    const firstLine = !v.slice(0, pos).includes("\n");
    const lastLine = !v.slice(pos).includes("\n");
    if ((ev.key === "ArrowUp" && firstLine) || (ev.key === "ArrowDown" && lastLine)) {
      const next = historyStep(state.history.length, state.at, ev.key === "ArrowUp" ? -1 : 1);
      if (next === null) return;
      ev.preventDefault();
      if (state.at === -1) state.draft = v;
      state.at = next;
      setInput(next >= 0 ? state.history[next] : state.draft);
    }
  });
  // keys typed in the transcript or on the buttons stay in the console too
  root.addEventListener("keydown", (ev) => ev.stopPropagation());

  setTimeout(() => { scrollDown(); if (!state.search) input.focus(); else searchIn.focus(); }, 0);
  return root;
}
