/**
 * Getting an exported PDF or Excel file to the physio (spec 14). A plain `<a download>` opens the
 * file in a viewer with no way back in the installed iPhone app, so on touch screens the file is
 * fetched first and handed to the system share sheet (Save to Files, WhatsApp, Print…); anywhere
 * else, or where files cannot be shared, it downloads as usual.
 */

/** The export endpoint answered with an error (or not at all). */
export class ExportFetchError extends Error {
  constructor(readonly status: number | null) {
    super(`Export failed${status === null ? "" : ` (${status})`}`);
    this.name = "ExportFetchError";
  }
}

/**
 * The file name a `Content-Disposition` header carries (`filename*` first), or null. Parameter
 * names are case-insensitive, and `filename*` may carry a language tag (`UTF-8'en'…`).
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*([\w!#$%&+^`{}~-]+)'[^']*'([^;\s]+)/i.exec(header);
  if (extended) {
    try {
      // Only UTF-8 is sent by our server; another charset is read as best it can be.
      return decodeURIComponent(extended[2]!);
    } catch {
      // A malformed encoding: try the plain name.
    }
  }
  const plain =
    /(?:^|;)\s*filename\s*=\s*"([^"]*)"/i.exec(header) ??
    /(?:^|;)\s*filename\s*=\s*([^;\s"]+)/i.exec(header);
  return plain?.[1] ? plain[1] : null;
}

/** Fetches an export as a `File`, named as the server names it. */
export async function fetchExportFile(
  url: string,
  fallbackName: string,
  fetcher: typeof fetch = fetch,
): Promise<File> {
  let response: Response;
  try {
    response = await fetcher(url, { credentials: "same-origin" });
  } catch {
    throw new ExportFetchError(null);
  }
  if (!response.ok) throw new ExportFetchError(response.status);
  const blob = await response.blob();
  const name = filenameFromDisposition(response.headers.get("Content-Disposition")) ?? fallbackName;
  return new File([blob], name, {
    type: response.headers.get("Content-Type") ?? blob.type,
  });
}

/** Touch screens and the installed app: where an export goes to the share sheet. */
export const SHARE_SHEET_QUERIES = ["(pointer: coarse)", "(display-mode: standalone)"] as const;

/**
 * Whether to offer the share sheet (see `SHARE_SHEET_QUERIES`). A desktop browser may support
 * sharing too, but there a plain download is what people expect.
 */
export function prefersShareSheet(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return SHARE_SHEET_QUERIES.some((query) => window.matchMedia(query).matches);
}

/** `busy`: a share sheet is still open (a second tap), which is left to finish. */
export type ShareOutcome = "shared" | "cancelled" | "busy" | "needsTap" | "failed";
export type DeliverOutcome = Exclude<ShareOutcome, "failed"> | "downloaded";

const canShareFile = (file: File) =>
  typeof navigator.share === "function" &&
  typeof navigator.canShare === "function" &&
  navigator.canShare({ files: [file] });

/**
 * Opens the share sheet with the file. The browser only allows it right after a tap: when the
 * fetch took too long it refuses (`needsTap`), and the caller asks for another tap.
 */
export async function shareFile(file: File): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    if (error instanceof DOMException && error.name === "NotAllowedError") return "needsTap";
    if (error instanceof DOMException && error.name === "InvalidStateError") return "busy";
    return "failed";
  }
}

/** How long a downloaded file's object URL is kept, so the browser can finish reading it. */
const REVOKE_AFTER_MS = 10_000;

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** Shares the file when asked and possible, else downloads it. */
export async function deliverFile(
  file: File,
  { share }: { share: boolean },
): Promise<DeliverOutcome> {
  if (share && canShareFile(file)) {
    const outcome = await shareFile(file);
    if (outcome !== "failed") return outcome;
  }
  downloadFile(file);
  return "downloaded";
}
