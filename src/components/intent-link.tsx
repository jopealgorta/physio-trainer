"use client";

import Link, { type LinkProps } from "next/link";
import { useState } from "react";

/**
 * A `<Link>` for list rows. A default link prefetches its route (down to the `loading.tsx`) as
 * soon as it scrolls into view: one server render, and one database transaction, per row. This
 * one waits for intent (hover, keyboard focus or touch) and then prefetches as usual.
 *
 * A click that beats its own prefetch still shows the skeleton when any link to the same route
 * was prefetched before (the loading state is shared by the route), so lists mark their first
 * row `eager`: one prefetch per list instead of one per row.
 */
export function IntentLink<RouteType>({
  eager = false,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Omit<LinkProps<RouteType>, "prefetch"> & {
  /** Prefetch as soon as it is on screen, like a plain `<Link>`. */
  eager?: boolean;
}) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={eager || intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
