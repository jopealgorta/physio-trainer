import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAsPhysio } from "@/db/rls";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { onCustomerArchived } from "./hooks";
import { createCustomer, setCustomerArchived } from "./mutations";
import { customerSchema } from "./schemas";

vi.mock("./hooks", () => ({ onCustomerArchived: vi.fn(async () => {}) }));

const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("customer archive hook", () => {
  let physio: TestPhysio;
  let customerId: string;

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    const result = await runAsPhysio(physio.claims, (tx, id) =>
      createCustomer(tx, id, customerSchema.parse({ firstName: "Hooked" })),
    );
    if (!result.ok) throw new Error("createCustomer failed");
    customerId = result.data.id;
  });
  afterAll(() => deleteTestPhysios(physio));

  it("runs once when a customer is archived, inside the same transaction", async () => {
    vi.mocked(onCustomerArchived).mockClear();
    let txSeen: unknown;
    await runAsPhysio(physio.claims, async (tx, id) => {
      txSeen = tx;
      await setCustomerArchived(tx, id, customerId, true);
    });
    expect(onCustomerArchived).toHaveBeenCalledTimes(1);
    expect(onCustomerArchived).toHaveBeenCalledWith(txSeen, physio.id, customerId);
  });

  it("does not run when a customer is restored", async () => {
    vi.mocked(onCustomerArchived).mockClear();
    await runAsPhysio(physio.claims, (tx, id) => setCustomerArchived(tx, id, customerId, false));
    expect(onCustomerArchived).not.toHaveBeenCalled();
  });

  it("does not run when the customer is not found", async () => {
    vi.mocked(onCustomerArchived).mockClear();
    const result = await runAsPhysio(physio.claims, (tx, id) =>
      setCustomerArchived(tx, id, RANDOM_ID, true),
    );
    expect(result).toEqual({ ok: false, error: "notFound" });
    expect(onCustomerArchived).not.toHaveBeenCalled();
  });
});
