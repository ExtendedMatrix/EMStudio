/**
 * MICRO-CONTENTS-2 D4/D17 · the app's own picker of a folder or a file, walked
 * through the bridge (E.D.: «aprire un selettore di percorso, non incollare un
 * percorso»). In a browser a page cannot be handed a location by the system's
 * dialog — that is the browser's rule — so the app shows the folders the bridge
 * serves (the allowed folders, «Cartelle consentite») and lets one be walked
 * and chosen. The desktop keeps the system's dialog (`tauri.ts`); this is the
 * same gesture where the system cannot answer.
 *
 * One dialog (`app-dialog.ts`), its body the listing: a click on a folder
 * enters it, ↑ goes up (to the allowed folders from a root), a file is chosen
 * with a click (mode «file»), and OK takes the folder shown (mode «folder») or
 * the file chosen. Cancel answers null.
 */
import { openDialog } from "./app-dialog";
import { t } from "./i18n";
import { fsList, type FsListing } from "./storage";

export interface PathPick {
  mode: "folder" | "file";
  /** where it opens; null or a refused path = the allowed folders */
  start?: string | null;
  title?: string;
  message?: string;
}

export async function pickPathInApp(o: PathPick): Promise<string | null> {
  const body = document.createElement("div");
  body.className = "path-picker";
  body.dataset.pathPicker = o.mode;
  const where = document.createElement("div");
  where.className = "path-picker-where";
  const up = document.createElement("button");
  up.type = "button";
  up.className = "ghost path-picker-up";
  up.textContent = "↑";
  const here = document.createElement("code");
  here.className = "path-picker-here";
  where.append(up, here);
  const list = document.createElement("div");
  list.className = "path-picker-list";
  list.tabIndex = -1;
  const chosenLine = document.createElement("div");
  chosenLine.className = "insp-hint path-picker-chosen";
  body.append(where, list, chosenLine);

  let listing: FsListing | null = null;
  let chosen: string | null = null;

  const show = async (path: string | null): Promise<void> => {
    list.textContent = t("storage.loading");
    let next: FsListing;
    try {
      next = await fsList(path ?? undefined);
    } catch (e) {
      if (path) { await show(null); return; }      // refused: the allowed folders
      list.textContent = String((e as Error).message ?? e);
      return;
    }
    listing = next;
    chosen = null;
    here.textContent = next.roots ? t("storage.roots") : next.path;
    here.title = next.roots ? "" : next.path;
    up.disabled = next.roots;
    up.title = next.parent ? t("storage.up") : t("storage.upToRoots");
    up.onclick = () => { if (listing && !listing.roots) void show(listing.parent); };
    chosenLine.textContent = o.mode === "folder" && !next.roots ? t("picker.folderHere", { path: next.path }) : "";
    list.textContent = "";
    const rows = next.entries.filter((e) => e.type === "dir" || (o.mode === "file" && !/\.stamp\.json$/i.test(e.name)));
    if (!rows.length) {
      const none = document.createElement("i");
      none.className = "insp-hint";
      none.textContent = t(o.mode === "folder" ? "picker.noFolders" : "storage.emptyFolder");
      list.appendChild(none);
    }
    for (const e of rows) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ghost path-picker-row" + (e.type === "dir" ? " is-dir" : "");
      b.dataset.path = e.path;
      b.textContent = (e.type === "dir" ? "📁 " : "") + e.name;
      b.disabled = !!e.outside;
      b.onclick = () => {
        if (e.type === "dir") { void show(e.path); return; }
        chosen = e.path;
        list.querySelectorAll(".is-chosen").forEach((x) => x.classList.remove("is-chosen"));
        b.classList.add("is-chosen");
        chosenLine.textContent = t("picker.fileChosen", { name: e.name });
      };
      list.appendChild(b);
    }
  };
  void show(o.start ?? null);

  const a = await openDialog({
    title: o.title ?? t(o.mode === "folder" ? "picker.folderTitle" : "picker.fileTitle"),
    message: o.message,
    body,
    ok: t(o.mode === "folder" ? "picker.chooseFolder" : "picker.chooseFile"),
    kind: "path-picker",
    validate: () => {
      if (o.mode === "file") return chosen ? null : t("picker.pickAFile");
      return listing && !listing.roots ? null : t("picker.enterAFolder");
    },
  });
  if (!a.ok) return null;
  const at = listing as FsListing | null;
  return o.mode === "file" ? chosen : (at && !at.roots ? at.path : null);
}
