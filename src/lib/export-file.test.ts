import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deliverFile,
  ExportFetchError,
  fetchExportFile,
  filenameFromDisposition,
  prefersShareSheet,
  shareFile,
} from "./export-file";

const PDF = "application/pdf";

function response(body: string, headers: Record<string, string>, status = 200) {
  return new Response(body, { status, headers });
}

describe("filenameFromDisposition", () => {
  it("prefers the UTF-8 name", () => {
    expect(
      filenameFromDisposition(
        `attachment; filename="rodilla-2026-10-07.pdf"; filename*=UTF-8''rodilla-%C3%B1-2026-10-07.pdf`,
      ),
    ).toBe("rodilla-ñ-2026-10-07.pdf");
  });

  it("falls back to the quoted ASCII name", () => {
    expect(filenameFromDisposition(`attachment; filename="knee-rehab.xlsx"`)).toBe(
      "knee-rehab.xlsx",
    );
  });

  it("reads the parameter names in any case, and a language tag", () => {
    expect(filenameFromDisposition(`ATTACHMENT; FileName="knee.pdf"`)).toBe("knee.pdf");
    expect(
      filenameFromDisposition(`attachment; FILENAME*=utf-8'es'r%C3%A9sum%C3%A9.pdf; filename="x"`),
    ).toBe("résumé.pdf");
  });

  it("returns null without a usable name", () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
    expect(filenameFromDisposition(`attachment; filename*=UTF-8''%E0%A4%A`)).toBeNull();
  });
});

describe("fetchExportFile", () => {
  it("builds a file named by the response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response("%PDF", {
        "Content-Type": PDF,
        "Content-Disposition": `attachment; filename="knee.pdf"; filename*=UTF-8''knee.pdf`,
      }),
    );
    const file = await fetchExportFile("/api/export/routines/1?format=pdf", "export.pdf", fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/export/routines/1?format=pdf", {
      credentials: "same-origin",
    });
    expect(file.name).toBe("knee.pdf");
    expect(file.type).toBe(PDF);
    expect(await file.text()).toBe("%PDF");
  });

  it("uses the fallback name when the response has none", async () => {
    const fetcher = vi.fn().mockResolvedValue(response("x", { "Content-Type": PDF }));
    expect((await fetchExportFile("/x", "export.pdf", fetcher)).name).toBe("export.pdf");
  });

  it("throws on an error status", async () => {
    const fetcher = vi.fn().mockResolvedValue(response("no", {}, 404));
    await expect(fetchExportFile("/x", "export.pdf", fetcher)).rejects.toBeInstanceOf(
      ExportFetchError,
    );
  });
});

describe("prefersShareSheet", () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });
  const matching = (...queries: string[]) => {
    window.matchMedia = ((query: string) => ({
      matches: queries.includes(query),
    })) as unknown as typeof window.matchMedia;
  };

  it("is true on a touch screen or in the installed app", () => {
    matching("(pointer: coarse)");
    expect(prefersShareSheet()).toBe(true);
    matching("(display-mode: standalone)");
    expect(prefersShareSheet()).toBe(true);
  });

  it("is false with a mouse in a browser tab", () => {
    matching();
    expect(prefersShareSheet()).toBe(false);
  });
});

describe("delivering a file", () => {
  const file = new File(["%PDF"], "knee.pdf", { type: PDF });
  // Writable stand-ins for the Web Share API, which jsdom lacks.
  const nav = navigator as unknown as { share?: unknown; canShare?: unknown };
  let click: ReturnType<typeof vi.fn<(link: object) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    click = vi.fn<(link: object) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      click({ href: this.href, download: this.download, attached: this.isConnected });
    });
    URL.createObjectURL = vi.fn(() => "blob:knee");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete nav.share;
    delete nav.canShare;
  });

  it("downloads through a temporary link, then frees the file", async () => {
    expect(await deliverFile(file, { share: false })).toBe("downloaded");
    expect(click).toHaveBeenCalledWith({ href: "blob:knee", download: "knee.pdf", attached: true });
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:knee");
  });

  it("opens the share sheet when asked and the browser can share files", async () => {
    nav.canShare = vi.fn(() => true);
    nav.share = vi.fn().mockResolvedValue(undefined);
    expect(await deliverFile(file, { share: true })).toBe("shared");
    expect(nav.canShare).toHaveBeenCalledWith({ files: [file] });
    expect(nav.share).toHaveBeenCalledWith({ files: [file] });
    expect(click).not.toHaveBeenCalled();
  });

  it("is quiet when the person closes the share sheet", async () => {
    nav.canShare = vi.fn(() => true);
    nav.share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    expect(await deliverFile(file, { share: true })).toBe("cancelled");
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves it to the share already open when one is in progress", async () => {
    nav.canShare = vi.fn(() => true);
    nav.share = vi.fn().mockRejectedValue(new DOMException("in progress", "InvalidStateError"));
    expect(await deliverFile(file, { share: true })).toBe("busy");
    expect(click).not.toHaveBeenCalled();
  });

  it("asks for another tap when the browser refuses to share after the wait", async () => {
    nav.canShare = vi.fn(() => true);
    nav.share = vi.fn().mockRejectedValue(new DOMException("no gesture", "NotAllowedError"));
    expect(await deliverFile(file, { share: true })).toBe("needsTap");
    expect(click).not.toHaveBeenCalled();
  });

  it("downloads when sharing files is not supported", async () => {
    nav.canShare = vi.fn(() => false);
    nav.share = vi.fn();
    expect(await deliverFile(file, { share: true })).toBe("downloaded");
    expect(nav.share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it("downloads when sharing fails for another reason", async () => {
    nav.canShare = vi.fn(() => true);
    nav.share = vi.fn().mockRejectedValue(new TypeError("bad data"));
    expect(await deliverFile(file, { share: true })).toBe("downloaded");
  });

  it("shareFile shares straight away (from a fresh tap)", async () => {
    nav.share = vi.fn().mockResolvedValue(undefined);
    expect(await shareFile(file)).toBe("shared");
    nav.share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    expect(await shareFile(file)).toBe("cancelled");
  });
});
