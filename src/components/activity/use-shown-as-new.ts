import { useState } from "react";

/**
 * Which items to badge "New": the unseen ones, plus the ones that were unseen when first shown.
 * `MarkCommentsSeen` revalidates, so the server re-renders the tab with them already seen, and
 * without this memory the badges would vanish a moment after they appeared. A fresh visit
 * (remount) starts over. Returns a predicate over an item.
 */
export function useShownAsNew(items: readonly { id: string; seen: boolean }[]) {
  const unseen = (list: readonly { id: string; seen: boolean }[]) =>
    new Set(list.filter((item) => !item.seen).map((item) => item.id));
  const [shownAsNew, setShownAsNew] = useState<ReadonlySet<string>>(() => unseen(items));
  const arrived = [...unseen(items)].filter((id) => !shownAsNew.has(id));
  // Adjusting state while rendering (React's pattern for state derived from props).
  if (arrived.length > 0) setShownAsNew(new Set([...shownAsNew, ...arrived]));
  return (item: { id: string; seen: boolean }) => !item.seen || shownAsNew.has(item.id);
}
