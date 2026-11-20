/**
 * MICRO-TIL003 (E.D., 20 Nov 2026) · File ▸ «Bring in…»: ONE window, three
 * choices. Before, the File menu had three doors in a row — «Porta dentro…»
 * (files), «Porta dentro una cartella…» (a folder, read by a plugin's reader of
 * folders) and «Read as DosCo…» (a DosCo folder). The three roads stay as they
 * were (`doorFromMenu`, `doorFolderFromMenu`, `doorDoscoFromMenu` in main.ts,
 * and their commands `door`, `doorFolder`, `doorDosco`): only the entry
 * changed. The window asks which one, remembering the last choice.
 *
 * The body is built here; the dialog is the app's own (`app-dialog.ts`).
 */
import { openDialog } from "./app-dialog";
import { t } from "./i18n";

export type BringInChoice = "files" | "folder" | "dosco";
export const BRING_IN_CHOICES: { key: BringInChoice; label: string; hint: string }[] = [
  { key: "files", label: "door.choiceFiles", hint: "door.menuHint" },
  { key: "folder", label: "door.choiceFolder", hint: "door.folderMenuHint" },
  { key: "dosco", label: "door.choiceDosco", hint: "door.doscoMenuHint" },
];

const LAST = "em.bringIn.last";
function lastChoice(): BringInChoice {
  try {
    const v = localStorage.getItem(LAST);
    if (v === "files" || v === "folder" || v === "dosco") return v;
  } catch { /* no storage: the first */ }
  return "files";
}

/** The window: which of the three. Null = cancelled. */
export async function askBringIn(): Promise<BringInChoice | null> {
  const body = document.createElement("div");
  body.className = "bring-in";
  body.setAttribute("role", "radiogroup");
  const first = lastChoice();
  for (const c of BRING_IN_CHOICES) {
    const row = document.createElement("label");
    row.className = "bring-in-choice";
    row.dataset.choice = c.key;
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "bring-in";
    radio.value = c.key;
    radio.checked = c.key === first;
    const text = document.createElement("span");
    text.className = "bring-in-text";
    const name = document.createElement("strong");
    name.textContent = t(c.label);
    const hint = document.createElement("small");
    hint.textContent = t(c.hint);
    text.append(name, hint);
    row.append(radio, text);
    // a double click is the choice and OK
    row.addEventListener("dblclick", () => {
      radio.checked = true;
      (body.closest(".modal-card")?.querySelector("[data-dialog-ok]") as HTMLButtonElement | null)?.click();
    });
    body.appendChild(row);
  }
  const answer = await openDialog({
    title: t("door.bringInTitle"),
    message: t("door.bringInAsk"),
    body,
    ok: t("door.bringInOk"),
    kind: "bring-in",
  });
  if (!answer.ok) return null;
  const picked = body.querySelector<HTMLInputElement>("input[name=bring-in]:checked")?.value as BringInChoice | undefined;
  const choice = picked ?? first;
  try { localStorage.setItem(LAST, choice); } catch { /* not remembered */ }
  return choice;
}
