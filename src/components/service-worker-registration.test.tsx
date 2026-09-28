import { describe, expect, it, vi } from "vitest";

import { registerServiceWorker } from "./service-worker-registration";

function fakeContainer(register = vi.fn(async () => ({}) as ServiceWorkerRegistration)) {
  return { register } as unknown as ServiceWorkerContainer & { register: typeof register };
}

describe("registerServiceWorker", () => {
  it("registers the versioned worker for the whole origin when enabled", async () => {
    const container = fakeContainer();
    await registerServiceWorker({ enabled: true, buildId: "b1", container });
    expect(container.register).toHaveBeenCalledWith("/sw.js?v=b1", { scope: "/" });
  });

  it("does nothing when disabled (development)", async () => {
    const container = fakeContainer();
    await registerServiceWorker({ enabled: false, buildId: "b1", container });
    expect(container.register).not.toHaveBeenCalled();
  });

  it("does nothing when the browser has no service worker support", async () => {
    await expect(
      registerServiceWorker({ enabled: true, buildId: "b1", container: undefined }),
    ).resolves.toBeUndefined();
  });

  it("swallows registration errors: the app works without a worker", async () => {
    const container = fakeContainer(vi.fn(async () => Promise.reject(new Error("blocked"))));
    await expect(
      registerServiceWorker({ enabled: true, buildId: "b1", container }),
    ).resolves.toBeUndefined();
  });
});
