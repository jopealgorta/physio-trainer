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

// jsdom lacks the pointer-capture and scroll APIs Radix Select calls when it opens.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// jsdom has no matchMedia. Default to a desktop-sized screen (nothing matches, so `useIsMobile`
// is false); tests that need a phone override `window.matchMedia`.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
