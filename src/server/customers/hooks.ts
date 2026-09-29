/* eslint-disable @typescript-eslint/no-unused-vars -- placeholder until spec 10 fills it in */
import "server-only";

import type { Tx } from "@/db/rls";

/**
 * Called after a customer is archived. Spec 10 (sharing) revokes the customer's share links
 * here; restoring a customer never re-enables them.
 */
export async function onCustomerArchived(
  _tx: Tx,
  _physioId: string,
  _customerId: string,
): Promise<void> {
  // TODO(spec 10): revoke the customer's share links.
}
