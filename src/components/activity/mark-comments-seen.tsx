"use client";

import { useEffect } from "react";

import { markCommentsSeenAction } from "@/server/activity/actions";

/**
 * Renders nothing. When the Activity tab has shown `pending` new comments, tells the server they
 * were seen (the tab itself only reads). The "New" badges on this render stay until the next one.
 */
export function MarkCommentsSeen({ customerId, pending }: { customerId: string; pending: number }) {
  useEffect(() => {
    if (pending > 0) void markCommentsSeenAction(customerId);
  }, [customerId, pending]);
  return null;
}
