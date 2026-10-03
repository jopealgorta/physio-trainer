import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

import { ExportMenu } from "./export-menu";
import { chooseMenuAction, InPageActions, menuActions } from "@/test/page-actions";

const PDF = "application/pdf";
// Writable stand-ins for the Web Share API, which jsdom lacks.
const nav = navigator as unknown as { share?: unknown; canShare?: unknown };
const realMatchMedia = window.matchMedia;

/** Pretends the screen is touch (`pointer: coarse`) or not. */
function setTouch(touch: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: touch && query === "(pointer: coarse)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const pdfResponse = () =>
  new Response("%PDF", {
    headers: {
      "Content-Type": PDF,
      "Content-Disposition": `attachment; filename="knee.pdf"; filename*=UTF-8''knee.pdf`,
    },
  });

let fetchMock: ReturnType<typeof vi.fn>;
let clicked: string[];

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(async () => pdfResponse());
  vi.stubGlobal("fetch", fetchMock);
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
  URL.createObjectURL = vi.fn(() => "blob:file");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
  delete nav.share;
  delete nav.canShare;
});

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ExportMenu target={{ kind: "routines", id: "r1" }} />
    </NextIntlClientProvider>,
  );
}

const sameOrigin = { credentials: "same-origin" };

async function exportPdf(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Export" }));
  await user.click(await screen.findByRole("menuitem", { name: "Export PDF" }));
}

/** A touch screen whose share sheet takes files. */
function touchWithShare(share = vi.fn().mockResolvedValue(undefined)) {
  setTouch(true);
  nav.canShare = vi.fn(() => true);
  nav.share = share;
  return share;
}

describe("ExportMenu on a desktop", () => {
  it("links straight to the downloads (a native download, nothing fetched)", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Export" }));
    const pdf = await screen.findByRole("menuitem", { name: "Export PDF" });
    expect(pdf).toHaveAttribute("href", "/api/export/routines/r1?format=pdf");
    expect(pdf).toHaveAttribute("download");
    expect(screen.getByRole("menuitem", { name: "Export Excel" })).toHaveAttribute(
      "href",
      "/api/export/routines/r1?format=xlsx",
    );
    // The tracking boxes toggle keeps the menu open and only changes the PDF.
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Include tracking boxes" }));
    expect(screen.getByRole("menuitem", { name: "Export PDF" })).toHaveAttribute(
      "href",
      "/api/export/routines/r1?format=pdf&tracking=0",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ExportMenu on a touch screen", () => {
  it("fetches the file and opens the share sheet with it", async () => {
    const share = touchWithShare();
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/export/routines/r1?format=pdf", sameOrigin);
    expect(share.mock.calls[0]![0].files[0].name).toBe("knee.pdf");
    expect(clicked).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves the tracking boxes out when unticked", async () => {
    touchWithShare();
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Include tracking boxes" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Export PDF" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/export/routines/r1?format=pdf&tracking=0",
        sameOrigin,
      ),
    );
  });

  it("downloads the fetched file where files cannot be shared", async () => {
    setTouch(true);
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    await waitFor(() => expect(clicked).toEqual(["knee.pdf"]));
  });

  it("shows the export in progress and offers no second export meanwhile", async () => {
    touchWithShare();
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => (resolve = done)));
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    // Still focusable (focus comes back to it), but busy, and its items are disabled.
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toHaveAttribute("aria-busy", "true");
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "Export PDF" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");
    resolve(pdfResponse());
    await waitFor(() => expect(trigger).toHaveAttribute("aria-busy", "false"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says so when the export fails, until the menu is opened again", async () => {
    touchWithShare();
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't export. Try again.");
    expect(clicked).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Export" }));
    // The page behind an open menu is aria-hidden: look there too.
    expect(screen.queryByRole("alert", { hidden: true })).not.toBeInTheDocument();
  });

  it("lets a failure go after a while", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      touchWithShare();
      fetchMock.mockResolvedValue(new Response("", { status: 500 }));
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup();
      await exportPdf(user);
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for a tap to share when the browser refused after the wait", async () => {
    const share = touchWithShare(
      vi
        .fn()
        .mockRejectedValueOnce(new DOMException("no gesture", "NotAllowedError"))
        .mockResolvedValueOnce(undefined),
    );
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    const dialog = await screen.findByRole("dialog", { name: "Your file is ready" });
    expect(dialog).toHaveTextContent("knee.pdf");
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("downloads the file when the second share is refused too", async () => {
    touchWithShare(vi.fn().mockRejectedValue(new DOMException("no gesture", "NotAllowedError")));
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    await screen.findByRole("dialog", { name: "Your file is ready" });
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(clicked).toEqual(["knee.pdf"]));
  });

  it("shares once on a double tap, and never downloads because a share was still open", async () => {
    let finish!: () => void;
    const share = touchWithShare(
      vi
        .fn()
        .mockRejectedValueOnce(new DOMException("no gesture", "NotAllowedError"))
        .mockImplementationOnce(() => new Promise<void>((done) => (finish = done)))
        .mockRejectedValue(new DOMException("in progress", "InvalidStateError")),
    );
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    const shareButton = await screen.findByRole("button", { name: "Share" });
    await user.dblClick(shareButton);
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(share).toHaveBeenCalledTimes(2);
    expect(clicked).toEqual([]);
  });
});

describe("ExportMenu in a page's More actions menu", () => {
  const inMenu = () =>
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <InPageActions>
          <ExportMenu target={{ kind: "routines", id: "r1" }} />
        </InPageActions>
      </NextIntlClientProvider>,
    );

  it("offers PDF, Excel and the tracking boxes as downloads on a desktop", async () => {
    const user = userEvent.setup();
    inMenu();
    expect(await menuActions(user)).toEqual([
      "Export PDF",
      "Export Excel",
      "Include tracking boxes",
    ]);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Export PDF" })).toHaveAttribute("download");
  });

  it("exports from there on a touch screen, with the tracking choice", async () => {
    const share = touchWithShare();
    const user = userEvent.setup();
    inMenu();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Include tracking boxes" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Export PDF" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export/routines/r1?format=pdf&tracking=0",
      sameOrigin,
    );
  });

  it("shows the export running on the menu button and repeats a failure in the notices", async () => {
    touchWithShare();
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => (resolve = done)));
    const user = userEvent.setup();
    inMenu();
    await chooseMenuAction(user, "Export Excel");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "More actions" })).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
    await waitFor(() => expect(screen.getByTestId("page-notices")).toHaveTextContent("Exporting…"));
    resolve(new Response("", { status: 500 }));
    await waitFor(() =>
      expect(screen.getByTestId("page-notices")).toHaveTextContent("Couldn't export. Try again."),
    );
    // Opening the menu again clears it.
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByTestId("page-notices")).toBeEmptyDOMElement();
  });
});
