/**
 * The app's OWN question — one dialog for every «are you sure?», «what name?»
 * and «this went wrong» (MICRO contenuti-workspace-elimina-grafo, 26 Oct 2026).
 *
 * Why it exists: the desktop is a WKWebView (Tauri), and there `window.prompt`
 * opens nothing and returns `null` — the workspace bar's «+» asked a name with
 * it, got `null`, and did nothing, silently (E.D.: «il + non funziona»). The
 * same family as the detached window of dev.71 (`window.open`). `confirm` and
 * `alert` fare no better there (measured in the report), so EVERY native dialog
 * of the frontend passes through here, and `scripts/check-no-native-dialogs.mjs`
 * keeps it that way.
 *
 * One component, three uses: {@link askText} (a field), {@link askConfirm} (yes /
 * no) and {@link tell} (OK alone); {@link openDialog} is the general form, with a
 * body of one's own (the report of «Delete the graph…»). Asynchronous: a caller
 * awaits the answer. From the keyboard: the field (or OK) has the focus, Enter
 * is OK, Escape is Cancel, Tab stays inside, and the focus goes back where it
 * was. A dialog is `role="dialog"` + `aria-modal`, its title labels it.
 *
 * For a test: every dialog carries `data-app-dialog` (its kind) and its buttons
 * `data-dialog-ok` / `data-dialog-cancel`; `window.__EM_DIALOGS__` lists the
 * questions asked (message, kind, answer), the trace a bench reads instead of
 * Playwright's `page.on("dialog")`, which no longer fires.
 */
import { t } from "./i18n";

export interface DialogOptions {
  /** the head of the card; default: the app's name for a question */
  title?: string;
  /** the question, in words (newlines kept) */
  message?: string;
  /** a body of the caller's own, under the message */
  body?: HTMLElement;
  /** a text field, with its proposal */
  input?: { value?: string; placeholder?: string; label?: string };
  /** the label of OK (default «OK») */
  ok?: string;
  /** the label of Cancel; `null` = no Cancel (a notice) */
  cancel?: string | null;
  /** OK takes something away: drawn as a danger, and the focus starts on Cancel */
  danger?: boolean;
  /** `data-app-dialog` — what a test looks for */
  kind?: string;
  /** refuse OK while this says why (the field's value given) */
  validate?: (value: string) => string | null;
}

export interface DialogAnswer {
  ok: boolean;
  /** the field's value (trimmed only by the caller), "" without a field */
  value: string;
}

interface Trace { kind: string; message: string; ok: boolean; value: string }

function trace(): Trace[] {
  const w = window as unknown as { __EM_DIALOGS__?: Trace[] };
  return (w.__EM_DIALOGS__ ??= []);
}

const FOCUSABLE = "button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex='-1'])";

/** The general dialog. Resolves once, when it closes. */
export function openDialog(o: DialogOptions): Promise<DialogAnswer> {
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null;
    const back = document.createElement("div");
    back.className = "modal app-dialog";
    back.dataset.appDialog = o.kind ?? (o.input ? "text" : o.cancel === null ? "notice" : "confirm");
    const card = document.createElement("div");
    card.className = "modal-card";
    card.setAttribute("role", o.cancel === null ? "alertdialog" : "dialog");
    card.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.className = "modal-head";
    head.id = `app-dialog-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    head.textContent = o.title ?? t("dlg.title");
    card.setAttribute("aria-labelledby", head.id);
    const body = document.createElement("div");
    body.className = "modal-body";
    if (o.message) {
      const p = document.createElement("p");
      p.className = "app-dialog-msg";
      p.textContent = o.message;
      body.appendChild(p);
    }
    if (o.body) body.appendChild(o.body);
    let field: HTMLInputElement | null = null;
    const err = document.createElement("div");
    err.className = "app-dialog-err";
    err.setAttribute("role", "alert");
    if (o.input) {
      const label = document.createElement("label");
      label.className = "app-dialog-field";
      if (o.input.label) label.append(o.input.label);
      field = document.createElement("input");
      field.type = "text";
      field.value = o.input.value ?? "";
      field.placeholder = o.input.placeholder ?? "";
      field.dataset.dialogInput = "1";
      field.spellcheck = false;
      if (o.message) field.setAttribute("aria-label", o.message);
      label.appendChild(field);
      body.appendChild(label);
    }
    body.appendChild(err);
    const foot = document.createElement("div");
    foot.className = "modal-foot";
    let cancelBtn: HTMLButtonElement | null = null;
    if (o.cancel !== null) {
      cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.dataset.dialogCancel = "1";
      cancelBtn.textContent = o.cancel ?? t("common.cancel");
      foot.appendChild(cancelBtn);
    }
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = o.danger ? "primary danger" : "primary";
    okBtn.dataset.dialogOk = "1";
    okBtn.textContent = o.ok ?? t("dlg.ok");
    foot.appendChild(okBtn);
    card.append(head, body, foot);
    back.appendChild(card);

    let done = false;
    const close = (ok: boolean): void => {
      if (done) return;
      const value = field?.value ?? "";
      if (ok && o.validate) {
        const why = o.validate(value);
        if (why) { err.textContent = why; field?.focus(); return; }
      }
      done = true;
      document.removeEventListener("keydown", onKey, true);
      back.remove();
      trace().push({ kind: back.dataset.appDialog!, message: o.message ?? o.title ?? "", ok, value });
      if (before && before.isConnected) before.focus();
      resolve({ ok, value });
    };
    // capture, so a canvas's own Enter/Escape never sees a key meant for the
    // dialog; everything else the dialog swallows too — it is modal
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        close(o.cancel === null);   // a notice: Escape is its only OK
      } else if (e.key === "Enter" && !e.isComposing
                 && !(e.target instanceof HTMLTextAreaElement)
                 && !(e.target instanceof HTMLButtonElement && e.target !== okBtn)) {
        e.preventDefault(); e.stopPropagation();
        close(true);
      } else if (e.key === "Tab") {
        const items = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
        e.preventDefault(); e.stopPropagation();
        items[next].focus();
      } else if (card.contains(e.target as Node)) {
        e.stopPropagation();          // typing in the field reaches only the field
      }
    };
    okBtn.addEventListener("click", () => close(true));
    cancelBtn?.addEventListener("click", () => close(false));
    back.addEventListener("mousedown", (e) => { if (e.target === back && o.cancel !== null) close(false); });
    document.body.appendChild(back);
    document.addEventListener("keydown", onKey, true);
    if (field) { field.focus(); field.select(); }
    else (o.danger && cancelBtn ? cancelBtn : okBtn).focus();
  });
}

/** `prompt` of the app: the typed text, or `null` on Cancel. */
export async function askText(message: string, value = "", opts: Omit<DialogOptions, "message" | "input"> = {}): Promise<string | null> {
  const a = await openDialog({ ...opts, message, input: { value } });
  return a.ok ? a.value : null;
}

/** `confirm` of the app: true on OK. */
export async function askConfirm(message: string, opts: Omit<DialogOptions, "message"> = {}): Promise<boolean> {
  return (await openDialog({ ...opts, message })).ok;
}

/** `alert` of the app: a notice with OK alone; resolves when it is closed. */
export async function tell(message: string, opts: Omit<DialogOptions, "message" | "cancel"> = {}): Promise<void> {
  await openDialog({ ...opts, message, cancel: null });
}
