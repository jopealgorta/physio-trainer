"use client";

import { useEffect } from "react";

import { markCommentsSeenAction } from "@/server/activity/actions";

/**
 * Renders nothing. When the Activity tab has shown new comments (`ids`), tells the server they
 * were seen (the tab itself only reads). The action revalidates, which re-renders the tab with them
 * seen; `SessionFeed` keeps their "New" badges for the rest of the visit.
 */
export function MarkCommentsSeen({
  customerId,
  ids,
  exerciseIds = [],
}: {
  customerId: string;
  ids: string[];
  exerciseIds?: string[];
}) {
  // The ids are the tab's own, stable per render; the key keeps the effect to once per set.
  const key = ids.join(",");
  const exerciseKey = exerciseIds.join(",");
  useEffect(() => {
    if (key === "" && exerciseKey === "") return;
    void markCommentsSeenAction(
      customerId,
      key === "" ? [] : key.split(","),
      exerciseKey === "" ? [] : exerciseKey.split(","),
    );
  }, [customerId, key, exerciseKey]);
  return null;
}
