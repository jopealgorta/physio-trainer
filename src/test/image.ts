import { vi } from "vitest";

/**
 * jsdom never loads images, so Radix Avatar (which preloads with `new window.Image()`) would
 * always show its fallback. This stub loads every URL except those `fails` picks, which error.
 * Undo with `vi.unstubAllGlobals()`.
 */
export function stubImageLoading(fails: (src: string) => boolean = () => false) {
  class FakeImage extends EventTarget {
    complete = false;
    naturalWidth = 0;
    referrerPolicy = "";
    crossOrigin: string | null = null;
    set src(value: string) {
      queueMicrotask(() => {
        this.complete = true;
        if (fails(value)) {
          this.dispatchEvent(new Event("error"));
        } else {
          this.naturalWidth = 96;
          this.dispatchEvent(new Event("load"));
        }
      });
    }
  }
  vi.stubGlobal("Image", FakeImage);
}
