import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react's auto-cleanup only registers when `afterEach` is a global (it checks
// `typeof afterEach`), which vitest does not provide unless `test.globals: true` is set. Without
// this, unmounted trees from earlier tests stay in the document and pollute later queries.
afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver. Radix's RadioGroup (via `@radix-ui/react-use-size`) calls it on
// mount to measure the checked indicator, which throws `ReferenceError` without this stub.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
