import { render, screen, waitFor } from "@testing-library/react";
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
  await user.click(await screen.findByRole("menuitem", { name: "Download PDF" }));
}

describe("ExportMenu", () => {
  it("fetches the file and downloads it on a desktop", async () => {
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    await waitFor(() => expect(clicked).toEqual(["knee.pdf"]));
    expect(fetchMock).toHaveBeenCalledWith("/api/export/routines/r1?format=pdf", sameOrigin);
  });

  it("keeps the menu open while toggling tracking; Excel has no tracking boxes", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Include tracking boxes" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Download PDF" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/export/routines/r1?format=pdf&tracking=0",
        sameOrigin,
      ),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Export" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(await screen.findByRole("menuitem", { name: "Download Excel" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/export/routines/r1?format=xlsx", sameOrigin),
    );
  });

  it("shows the export in progress and ignores another click meanwhile", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => (resolve = done)));
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-busy", "true");
    resolve(pdfResponse());
    await waitFor(() => expect(trigger).toBeEnabled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says so when the export fails", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't export. Try again.");
    expect(clicked).toEqual([]);
  });

  it("opens the share sheet on a touch screen", async () => {
    setTouch(true);
    nav.canShare = vi.fn(() => true);
    nav.share = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    await waitFor(() => expect(nav.share).toHaveBeenCalled());
    const [{ files }] = (nav.share as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(files[0].name).toBe("knee.pdf");
    expect(clicked).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for a tap to share when the browser refused after the wait", async () => {
    setTouch(true);
    nav.canShare = vi.fn(() => true);
    nav.share = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("no gesture", "NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    setup();
    await exportPdf(user);
    const dialog = await screen.findByRole("dialog", { name: "Your file is ready" });
    expect(dialog).toHaveTextContent("knee.pdf");
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(nav.share).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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

  it("offers PDF, Excel and the tracking boxes, and exports from there", async () => {
    const user = userEvent.setup();
    inMenu();
    expect(await menuActions(user)).toEqual([
      "Download PDF",
      "Download Excel",
      "Include tracking boxes",
    ]);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Include tracking boxes" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Download PDF" }));
    await waitFor(() => expect(clicked).toEqual(["knee.pdf"]));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export/routines/r1?format=pdf&tracking=0",
      sameOrigin,
    );
  });

  it("shows the export running on the menu button and repeats a failure in the notices", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => (resolve = done)));
    const user = userEvent.setup();
    inMenu();
    await chooseMenuAction(user, "Download Excel");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "More actions" })).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
    resolve(new Response("", { status: 500 }));
    await waitFor(() =>
      expect(screen.getByTestId("page-notices")).toHaveTextContent("Couldn't export. Try again."),
    );
  });
});
