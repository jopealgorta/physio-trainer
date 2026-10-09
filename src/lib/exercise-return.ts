import { safeNextPath } from "@/lib/redirects";

const LIBRARY = "/library";

/**
 * An exercise page opened from `from` (a filtered library list, a routine): saving or cancelling
 * the form goes back there. The plain library needs no parameter.
 */
export function exerciseHref(id: string, from?: string): string {
  const path = `${LIBRARY}/${id}`;
  return from && from !== LIBRARY ? `${path}?${new URLSearchParams({ from })}` : path;
}

/** Where the exercise form returns to: a validated same-origin `from`, else the library. */
export function exerciseReturnPath(from: string | null | undefined): string {
  return safeNextPath(from, LIBRARY);
}
