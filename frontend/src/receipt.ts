/**
 * CATENA · the RECEIPT of a stamped file on the shelf.
 *
 * The receipt is dtcstamp's `receipt(stamp)` — `{id, checksum, stamp, parents,
 * title?, description?}` — stored AS IT CAME on the entry's data under
 * `stamp_receipt` (s3Dgraphy `shelf.STAMP_RECEIPT_KEY`), never rebuilt here:
 * there is one form of it. It is a COPY: the truth stays the `.stamp.json`
 * beside the file. When the sidecar and the bytes are reachable the receipt is
 * compared with them, and a file that changed under its receipt is said so.
 */
import type { ShelfEntry } from "./shelf";
import type { StampReceipt } from "./stamp-compose";

export const RECEIPT_KEY = "stamp_receipt";

export function receiptOf(e: ShelfEntry | undefined): StampReceipt | null {
  const r = e?.extra?.[RECEIPT_KEY];
  return r && typeof r === "object" && typeof (r as StampReceipt).id === "string" ? (r as StampReceipt) : null;
}

/** What `addToShelf` is given for one stamped file. */
export function receiptShelfInput(path: string, receipt: StampReceipt): {
  locator: string; name: string; checksum?: string; extra: Record<string, unknown>;
} {
  const base = path.split("/").pop() || path;
  return {
    locator: path,
    name: receipt.title || base,
    ...(receipt.checksum ? { checksum: receipt.checksum } : {}),
    extra: { [RECEIPT_KEY]: receipt },
  };
}

/** The receipts an emission produced (one per written stamp), for the shelf. */
export function receiptsOfEmission(stamps: Array<{ path: string; receipt?: StampReceipt | null }>):
  Array<ReturnType<typeof receiptShelfInput>> {
  return stamps.filter((s) => s.path && s.receipt).map((s) => receiptShelfInput(s.path, s.receipt!));
}

export type ReceiptCheck =
  | "ok"               // the sidecar and the bytes say what the receipt says
  | "file-changed"     // the bytes' digest is not the receipt's: the file changed
  | "sidecar-differs"  // the sidecar names other bytes (or another id) than the receipt
  | "unreachable";     // nothing to compare with here (no bridge, no file)

/** CAMPAGNA · what the bridge says of a stamp checked by the KIND of thing it
 *  stamped (`/stamp/verify`, dtcstamp `verify_members` / `verify_tree`): a file
 *  set's members one by one, a tree's content digest. */
export interface StampVerdict {
  kind: "members" | "tree" | "file" | "missing";
  result: { ok: boolean; missing?: string[]; changed?: string[]; extra?: string[];
            list_consistent?: boolean; content?: boolean; file?: boolean | null };
}

/** Does this stamp cover more than the bytes of the file it sits beside? Then
 *  the file's own sha256 is NOT its digest: a file set is its members, a folder
 *  its content, and only dtcstamp can say whether they still hold. */
export function coversMoreThanTheFile(
  sidecar: { self?: { digest_covers?: string; packaging?: string; content_digest?: unknown } } | null | undefined,
): boolean {
  const self = sidecar?.self;
  return !!self && (self.digest_covers === "members" || self.packaging === "file_set"
    || self.packaging === "directory" || self.packaging === "archive" || !!self.content_digest);
}

/**
 * Compare a receipt with what is reachable: the sidecar's `self` and the bytes'
 * current digest (either may be missing). The sidecar is the truth: when it
 * disagrees with the receipt the receipt is the stale one.
 *
 * CAMPAGNA (1 ott, difetto 1) · a stamp of SEVERAL files — `digest_covers:
 * members` — has the members digest as its `self.digest`, so the door's sha256
 * never equals it, and comparing the two said «the file changed» right after
 * the stamp. For such a stamp the bytes are judged by `verdict` (the members,
 * each sha256 against its file; a tree's content), never by `fileDigest`.
 */
export function checkReceipt(
  receipt: StampReceipt,
  sidecar: { self?: { resource_id?: string; digest?: string; digest_covers?: string;
                      packaging?: string; content_digest?: unknown } } | null | undefined,
  fileDigest: string | null | undefined,
  verdict?: StampVerdict | null,
): ReceiptCheck {
  const byMembers = coversMoreThanTheFile(sidecar);
  if (byMembers) {
    if (!verdict) return "unreachable";
    if (!verdict.result.ok) return "file-changed";
  } else {
    if (!sidecar && !fileDigest) return "unreachable";
    if (fileDigest && receipt.checksum && fileDigest !== receipt.checksum) return "file-changed";
  }
  const self = sidecar?.self;
  if (self && ((self.resource_id && self.resource_id !== receipt.id)
      || (self.digest && receipt.checksum && self.digest !== receipt.checksum))) return "sidecar-differs";
  return "ok";
}

/** The words for what changed under a file set's stamp: the members missing or
 *  changed, by path — so «the file changed» can name WHICH file. */
export function verdictChanged(verdict: StampVerdict | null | undefined): string[] {
  const r = verdict?.result;
  return r ? [...(r.changed ?? []), ...(r.missing ?? []).map((m) => `${m} ✕`)] : [];
}

/**
 * RIFINITURE · the shelf's COPY after the stamp was retitled: every entry of
 * that file takes the new receipt. Its name follows the title only while it was
 * the receipt's own (the old title, or the file name when there was none): a
 * name somebody gave the entry by hand stays theirs. Pure — the caller applies.
 */
export function refreshedCopies(entries: ShelfEntry[], path: string, next: StampReceipt):
  Array<{ id: string; patch: Partial<ShelfEntry> }> {
  const base = path.split("/").pop() || path;
  return entries.filter((e) => e.locator === path).map((e) => {
    const old = receiptOf(e);
    const followed = e.name === (old?.title || base);
    return { id: e.id, patch: {
      extra: { ...(e.extra ?? {}), [RECEIPT_KEY]: next },
      ...(followed ? { name: next.title || base } : {}),
    } };
  });
}
