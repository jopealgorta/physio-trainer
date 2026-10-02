"use client";

import { useEffect } from "react";

import { markCommentsSeenAction } from "@/server/activity/actions";

/**
 * Renders nothing. When the Activity tab has shown new comments (`ids`), tells the server they
 * were seen (the tab itself only reads). The action revalidates, which re-renders the tab with them
 * seen; `CommentsFeed` keeps their "New" badges for the rest of the visit.
 */
export function MarkCommentsSeen({ customerId, ids }: { customerId: string; ids: string[] }) {
  // The ids are the tab's own, stable per render; the key keeps the effect to once per set.
  const key = ids.join(",");
  useEffect(() => {
    if (key !== "") void markCommentsSeenAction(customerId, key.split(","));
  }, [customerId, key]);
  return null;
}
