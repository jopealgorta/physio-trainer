import "server-only";

import type { Tx } from "@/db/rls";
import { revokeCustomerLinks } from "@/server/sharing/mutations";

/**
 * Called after a customer is archived: revokes every share link they were sent (spec 10).
 * Restoring a customer never re-enables them; the physio creates a new link.
 */
export async function onCustomerArchived(
  tx: Tx,
  physioId: string,
  customerId: string,
): Promise<void> {
  await revokeCustomerLinks(tx, physioId, customerId);
}
