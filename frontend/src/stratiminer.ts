/**
 * StratiMiner — assisted graph creation from a folder of unstructured sources.
 *
 * The panel makes a two-step pipeline visible instead of hiding it behind one
 * button:
 *
 *     a folder of sources  --(AI)-->  em_data.xlsx  --(deterministic)-->  em.json
 *
 * Both halves are here, and the seam between them is a FILE the archaeologist
 * can open. That is the whole design: the model canonises source material into a
 * typed table, the table is reviewed, and only then does a plain importer turn
 * it into a graph. **The AI never writes the graph.** A model asked for em.json
 * directly would put an unreviewed guess straight into the language's own
 * format, where a wrong node type reads exactly like a right one.
 *
 * Two paths reach the table, and neither is a fallback for the other:
 *
 *  * **Path A (API)** — the bridge calls a model itself and materialises the
 *    workbook. Fast, but it only sees what the bridge can decode as text: PDFs
 *    need an extractor this build does not bundle, and the panel says so per
 *    run rather than letting a table built from filenames look complete.
 *  * **Path B (Cowork)** — copy the prompt, run it in a session that has the
 *    filesystem, get the workbook back. Slower, and the only honest answer today
 *    for a folder of PDFs.
 *
 * Both end at the same field: a path to em_data.xlsx, and one button that
 * converts it.
 *
 * **The panel asks the question first (POL3).** The steps used to be numbered
 * 1 · 2 · 3 as if everyone had to walk all three, so a user who already had a
 * table met two AI-shaped steps before the one they needed — and the fact that
 * the AI is *optional* was invisible. Now the first thing on screen is «how do
 * you have the table?», with two answers that converge on one **Graph creator**:
 *
 *     by hand ────────────────────┐
 *                                 ├──► em_data.xlsx ──► Graph creator ──► em.json
 *     a folder of sources ─(AI)───┘
 *
 * A relabel and a reorder of the pieces that were already here: the extract, the
 * prompt and the transform calls are untouched.
 *
 * Why this is a panel and not a modal: the source folder and the table are
 * things you come back to across a working session — a modal would make the
 * pipeline feel like a one-shot import, which is exactly the reading the
 * intermediate table exists to prevent.
 */

import type { EmDocument } from "./types";
// i18n is a leaf module (imports nothing), so this cannot cycle. Only the new
// browser-path hint goes through it for now — converting the rest of this
// panel's strings is the I18N1 follow-up.
import { t, tn } from "./i18n";

/** `POST /stratiminer-prompt` — Path B. */
export interface PromptResult {
  ok: boolean;
  prompt: string;
  chars: number;
  folder: string;
}

/** `POST /stratiminer-extract` — Path A. */
export interface ExtractResult {
  ok: boolean;
  provider: string;
  model: string;
  xlsx_path: string;
  rows: Record<string, number>;
  /** Columns the writer refused because no sheet declares them. */
  warnings: string[];
  /**
   * Files whose text never reached the model, each with the REASON. A name alone
   * would not tell the user whether to install an extra, re-scan a document with
   * OCR, or accept the gap.
   */
  unread_files: { name: string; why: string }[];
  /** False when this build has no PDF text extractor at all. */
  pdf_text: boolean;
  /** The extractor and its version, or null. */
  extractor: string | null;
  sent: Record<string, unknown>;
}

/** `POST /import-em-data` — the deterministic half. */
export interface ImportResult {
  ok: boolean;
  stats: Record<string, number>;
  warnings: string[];
  doc: EmDocument;
}

/** What the panel remembers between renders. Deliberately not persisted: a
 *  source folder is per-investigation, and silently reopening last week's path
 *  would be a worse default than an empty field. */
export interface StratiMinerState {
  /**
   * Which answer to «how do you have the table?» is open (POL3).
   *
   * `manual` is the default because it is the honest one: the deterministic half
   * is the tool, the AI half is an assistant for when the sources are a mess.
   * Opening on the AI panel would suggest the model is a step you have to go
   * through — the exact reading the intermediate table exists to prevent.
   */
  source: "manual" | "ai";
  folder: string;
  xlsxPath: string;
  language: string;
  //: `stage` is the browser handing a workbook to the bridge — a wait like the
  //: others, so the panel disables the same buttons while it happens.
  busy: "" | "extract" | "prompt" | "import" | "stage";
  /** Last outcome, shown inline. Cleared when a new run starts. */
  report: string;
  warnings: string[];
  /**
   * The prompt text, held ONLY when the clipboard write failed.
   *
   * Path B's whole output is this string, so a denied clipboard — routine in a
   * browser without a permission grant, or over plain http — would otherwise
   * turn the path into a dead end with an apology. Showing it in a selectable
   * field costs nothing and keeps the path usable by hand.
   */
  promptFallback: string;
}

export function initialState(): StratiMinerState {
  return { source: "manual", folder: "", xlsxPath: "", language: "", busy: "",
           report: "", warnings: [], promptFallback: "" };
}

export interface StratiMinerHandlers {
  /** Which answer to «how do you have the table?» the user picked (POL3). */
  onSourceChange(value: "manual" | "ai"): void;
  onFolderChange(value: string): void;
  onXlsxChange(value: string): void;
  onLanguageChange(value: string): void;
  /** Path A: ask the bridge to call a model and write the table. */
  onExtract(): void;
  /** Path B: put the prompt on the clipboard. */
  onCopyPrompt(): void;
  /** The deterministic half: table → graph, loaded into the editor. */
  onTransform(): void;
  /** Native folder/file pickers, when running in Tauri. */
  onPickFolder?(): void;
  onPickXlsx?(): void;
  /** A workbook chosen in the browser's SYSTEM dialog. The browser gives bytes
   *  and no location, so the caller stages them through the bridge and gets back
   *  a real path — the same trick the mapping editor uses. Without it this
   *  picker could only prefill a NAME, and the panel had to warn that the path
   *  needed completing by hand. */
  onStageXlsx?(file: File): void;
  /** Last resort for Path B: put the prompt in a file. */
  onSavePrompt?(): void;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the panel into `host` and wire the controls.
 *
 * Rebuilt wholesale on each state change, like the inspector: the panel is a
 * handful of fields, and a diffing scheme here would be more code than the
 * thing it optimises.
 *
 * **EMTree seam.** Half done, and the half that is done needed no code here: the
 * produced document goes through `loadDocument`, which since ET1 registers every
 * incoming graph as a workspace SLOT — so a StratiMiner run now opens beside the
 * graphs you had open instead of replacing them. What is still missing is the
 * other half: carrying the source folder and the em_data.xlsx along as the new
 * slot's two `auxiliaryFiles`. They are what the graph was made from, which is
 * exactly what an aux file records, but an aux file is only meaningful once the
 * mapping and the bake exist (ET2). The `sm-todo` line below tells the user the
 * same thing, so neither the current behaviour nor the gap is a surprise.
 */
export function renderStratiMiner(host: HTMLElement, state: StratiMinerState,
                                  handlers: StratiMinerHandlers,
                                  opts: { native: boolean }): void {
  const busy = state.busy !== "";
  const canExtract = state.folder.trim() !== "" && !busy;
  const canPrompt = state.folder.trim() !== "" && !busy;
  const canTransform = state.xlsxPath.trim() !== "" && !busy;

  const ai = state.source === "ai";

  host.innerHTML = `
    <div class="sm-panel">
      <p class="sm-intro">${t("sm.intro")}</p>

      <h4>${esc(t("sm.howHead"))}</h4>
      <div class="sm-choice">
        <label class="sm-opt${ai ? "" : " active"}">
          <input type="radio" name="sm-source" value="manual"
                 ${ai ? "" : "checked"} />
          <span>${esc(t("sm.byHand"))}</span>
        </label>
        <label class="sm-opt${ai ? " active" : ""}">
          <input type="radio" name="sm-source" value="ai" ${ai ? "checked" : ""} />
          <span>${esc(t("sm.byAi"))}</span>
        </label>
      </div>

      ${ai ? `
      <div class="sm-branch">
        <h5>${esc(t("sm.folderHead"))}</h5>
        <div class="sm-row">
          <input id="sm-folder" type="text" spellcheck="false"
                 placeholder="${esc(t("sm.folderPh"))}"
                 value="${esc(state.folder)}" />
          <button id="sm-pick-folder" title="${esc(t("sm.pickFolder"))}">…</button>
          <!-- The BROWSER picker cannot give an absolute path (see onPickFolder):
               it is a hidden input that fills in what it can, and the hint below
               says so. On desktop the native dialog gives the real path. -->
          <input id="sm-folder-file" type="file" webkitdirectory
                 class="sm-hidden-file" />
        </div>
        ${opts.native ? "" : `<span class="sm-hint">${
          esc(t("stratiminer.browserPathHint"))}</span>`}
        <label class="sm-lang">
          ${esc(t("sm.outLang"))}
          <input id="sm-language" type="text" spellcheck="false"
                 placeholder="${esc(t("sm.outLangPh"))}"
                 value="${esc(state.language)}" />
        </label>
        <div class="sm-paths">
          <div class="sm-path">
            <button id="sm-extract" ${canExtract ? "" : "disabled"}>
              ${esc(state.busy === "extract" ? t("sm.extracting") : t("sm.extract"))}
            </button>
            <span class="sm-hint">${t("sm.extractHint")}</span>
          </div>
          <div class="sm-path">
            <button id="sm-prompt" ${canPrompt ? "" : "disabled"}>
              ${esc(state.busy === "prompt" ? t("sm.copying") : t("sm.copyPrompt"))}
            </button>
            <span class="sm-hint">${esc(t("sm.copyPromptHint"))}</span>
          </div>
        </div>
        <span class="sm-hint">${esc(t("sm.landsBelow"))}</span>
      </div>` : `
      <div class="sm-branch">
        <span class="sm-hint">${esc(t("sm.manualHint"))}</span>
      </div>`}

      <h4>${esc(t("sm.creatorHead"))}</h4>
      <div class="sm-row">
        <input id="sm-xlsx" type="text" spellcheck="false"
               placeholder="${esc(t("sm.xlsxPh"))}"
               value="${esc(state.xlsxPath)}" />
        <button id="sm-pick-xlsx" title="${esc(t("sm.pickXlsx"))}">…</button>
        <input id="sm-xlsx-file" type="file" accept=".xlsx"
               class="sm-hidden-file" />
      </div>
      <button id="sm-transform" class="sm-primary"
              ${canTransform ? "" : "disabled"}>
        ${esc(state.busy === "import" ? t("sm.converting") : t("sm.transform"))}
      </button>
      <span class="sm-hint">${esc(t("sm.deterministic"))}</span>

      ${state.report ? `<div class="sm-report">${esc(state.report)}</div>` : ""}
      ${state.promptFallback
      ? `<div class="sm-fallback">
           <label>
             ${esc(t("sm.selectAll"))}
             <textarea id="sm-prompt-text" readonly rows="6"
               >${esc(state.promptFallback)}</textarea>
           </label>
           <button id="sm-prompt-save">${esc(t("sm.savePrompt"))}</button>
           <span class="sm-hint">${esc(t("sm.savePromptHint"))}</span>
         </div>`
      : ""}
      ${state.warnings.length
      ? `<ul class="sm-warnings">${state.warnings
        .map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : ""}

      <p class="sm-todo">${esc(t("sm.todo"))}</p>
    </div>`;

  const on = <T extends HTMLElement>(id: string, ev: string,
                                     fn: (el: T) => void): void => {
    const el = host.querySelector<T>(`#${id}`);
    if (el) el.addEventListener(ev, () => fn(el));
  };

  // The two answers to «how do you have the table?» (POL3). Radios rather than
  // two toggle buttons: they are mutually exclusive, and a radio group is the one
  // control that says so to the keyboard and to a screen reader without extra work.
  host.querySelectorAll<HTMLInputElement>('input[name="sm-source"]').forEach(
    (radio) => radio.addEventListener("change", () => {
      if (radio.checked)
        handlers.onSourceChange(radio.value === "ai" ? "ai" : "manual");
    }),
  );
  // Only the AI branch renders the folder/extract/prompt controls; `on` is a
  // no-op when the element is absent, so the manual branch needs no special case.
  on<HTMLInputElement>("sm-folder", "change",
    (el) => handlers.onFolderChange(el.value));
  on<HTMLInputElement>("sm-xlsx", "change",
    (el) => handlers.onXlsxChange(el.value));
  on<HTMLInputElement>("sm-language", "change",
    (el) => handlers.onLanguageChange(el.value));
  on("sm-extract", "click", () => handlers.onExtract());
  on("sm-prompt", "click", () => handlers.onCopyPrompt());
  on("sm-transform", "click", () => handlers.onTransform());
  // Pre-select the fallback text: the user is here because copying failed, so
  // the next thing they need is a selection they did not have to make.
  const fallback = host.querySelector<HTMLTextAreaElement>("#sm-prompt-text");
  if (fallback) fallback.addEventListener("focus", () => fallback.select());
  if (handlers.onSavePrompt) {
    on("sm-prompt-save", "click", () => handlers.onSavePrompt?.());
  }
  // The pickers exist in BOTH deliveries, and the difference is what they can
  // deliver rather than whether they are offered:
  //
  //  * **desktop** — the native dialog returns a real absolute path, which is
  //    exactly what the bridge needs (it reads the folder server-side).
  //  * **browser** — `<input type=file>` deliberately withholds the path; all it
  //    exposes is a name (and `webkitRelativePath`'s first segment for a
  //    directory). So it prefills what it can and the hint says the path may need
  //    completing. Hiding the button instead would leave a text field with no
  //    affordance at all, which is worse than a partial one that explains itself.
  const wireFallback = (buttonId: string, inputId: string,
                        onPicked: (value: string) => void): void => {
    const fileInput = host.querySelector<HTMLInputElement>(`#${inputId}`);
    on(buttonId, "click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      // For a directory pick, `webkitRelativePath` is "<folder>/<file>"; the first
      // segment is the only thing the browser tells us about the folder.
      const relative = (file as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      onPicked(relative ? relative.split("/")[0] : file.name);
      fileInput.value = ""; // so picking the same thing again still fires
    });
  };

  if (opts.native) {
    on("sm-pick-folder", "click", () => handlers.onPickFolder?.());
    on("sm-pick-xlsx", "click", () => handlers.onPickXlsx?.());
  } else {
    wireFallback("sm-pick-folder", "sm-folder-file",
      (v) => handlers.onFolderChange(v));
    // the WORKBOOK can do better than a name: its bytes are staged and the
    // path that comes back is real (`onStageXlsx`). The folder above cannot —
    // a directory picker hands over the files, never the folder's location.
    if (handlers.onStageXlsx) {
      const input = host.querySelector<HTMLInputElement>("#sm-xlsx-file");
      on("sm-pick-xlsx", "click", () => input?.click());
      input?.addEventListener("change", () => {
        const file = input.files?.[0];
        input.value = "";
        if (file) handlers.onStageXlsx?.(file);
      });
    } else {
      wireFallback("sm-pick-xlsx", "sm-xlsx-file",
        (v) => handlers.onXlsxChange(v));
    }
  }
}

/**
 * A one-line account of an extraction, for the panel.
 *
 * Reports the unread files as prominently as the rows written. A run over a
 * folder of PDFs legitimately produces a nearly-empty table, and without this
 * line that reads as "the sources held little" instead of "nothing read them".
 */
export function describeExtraction(r: ExtractResult): string {
  const rows = Object.entries(r.rows)
    .filter(([, n]) => n > 0)
    .map(([sheet, n]) => `${sheet} ${n}`)
    .join(" · ");
  const parts = [t("sm.wrote", { model: r.model || r.provider, rows: rows || t("sm.noRows") })];
  if (r.unread_files.length) {
    parts.push(tn("sm.unread", r.unread_files.length));
  }
  if (r.pdf_text === false) {
    // The actionable one: this is a missing optional dependency, not a bad
    // folder, and the fix is one install away.
    parts.push(t("sm.noPdfText"));
  }
  return parts.join(". ") + ".";
}

/**
 * The per-file reasons, for the warnings list.
 *
 * Kept apart from the one-line report because they are a *checklist*: each line
 * is a file somebody may want to do something about (install an extra, OCR a
 * scan, ignore a spreadsheet). Folded into a sentence they would read as noise.
 */
export function unreadWarnings(r: ExtractResult): string[] {
  return r.unread_files.map((f) => `${f.name}: ${f.why}`);
}

/** Same, for the deterministic half. */
export function describeImport(r: ImportResult): string {
  const s = r.stats;
  return t("sm.importStats", {
    units: s.rows_units ?? 0, epochs: s.rows_epochs ?? 0, claims: s.rows_claims ?? 0,
    nodes: s.nodes_total ?? 0, edges: s.edges_total ?? 0,
  });
}
