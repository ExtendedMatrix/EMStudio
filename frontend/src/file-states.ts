// R1/R2 (E.D., 4 Oct 2026) · where each file of the graph is, asked of the
// ONE resolver (s3Dgraphy `resources.locate`) through the bridge — the same
// function EMtools and StratiField call, so the same files give the same state
// in the three. The answers are kept per resource id until asked again
// («Check files»): resolving touches the disk and, in a room, the node.
export interface FileState {
  id: string; name: string; state: string; path: string; sha256: string; note: string;
  node_type: string;
}

const STATES = new Map<string, FileState>();
let lastSummary: Record<string, number> = {};
let projectRoot = "";
/** the state shown in Contents; "" = all */
export let fileFilter = "";
export function setFileFilter(s: string): void { fileFilter = fileFilter === s ? "" : s; }

export function fileStateOf(id: string): FileState | undefined { return STATES.get(id); }
export function fileStates(): FileState[] { return [...STATES.values()]; }
export function fileSummary(): Record<string, number> { return lastSummary; }
export function fileProjectRoot(): string { return projectRoot; }

export interface RoomRef { base: string; room_id: string; token?: string | null }

/** Ask the bridge; never throws (a bridge that is down keeps the old answers) */
export async function refreshFileStates(bridge: string, doc: unknown, opts: {
  folders?: string[]; projectRoot?: string; room?: RoomRef | null;
} = {}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${bridge}/files-state`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc, folders: opts.folders ?? [], project_root: opts.projectRoot ?? "",
                             room: opts.room ?? null }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) return { ok: false, error: String(j.error ?? `bridge ${res.status}`) };
    STATES.clear();
    for (const r of j.results as FileState[]) STATES.set(r.id, r);
    lastSummary = j.summary ?? {};
    projectRoot = String(j.project_root ?? "");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function post(bridge: string, route: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${bridge}${route}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(String(j.error ?? `bridge ${res.status}`));
  return j;
}

/** «Open where it is» */
export const revealFile = (bridge: string, path: string) => post(bridge, "/file-reveal", { path });
/** «Keep it on the disk too»: the node's bytes into the project's tree */
export const keepOnDisk = (bridge: string, room: RoomRef, sha256: string, dest: string) =>
  post(bridge, "/file-keep", { room, sha256, dest });
/** «New EM project…» */
export const newEmProject = (bridge: string, parent: string, name: string) =>
  post(bridge, "/project-new", { parent, name });
/** «Reorder by the EM standard…»: the preview, then (on a yes) the moves */
export const reorderPreview = (bridge: string, root: string) =>
  post(bridge, "/project-reorder", { root });
export const reorderApply = (bridge: string, root: string, plan: unknown) =>
  post(bridge, "/project-reorder", { root, plan, apply: true, confirm: true });
