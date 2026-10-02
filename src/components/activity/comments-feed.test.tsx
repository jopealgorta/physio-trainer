import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ActivityComment } from "@/server/activity/queries";
import messages from "../../../messages/en.json";
import { CommentsFeed } from "./comments-feed";

const comment = (patch: Partial<ActivityComment> = {}): ActivityComment => ({
  id: "1",
  routineName: "Knee rehab",
  performedOn: "2026-10-07",
  comment: "A bit pinchy",
  pain: 6,
  seen: false,
  ...patch,
});

const setup = (comments: ActivityComment[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CommentsFeed comments={comments} />
    </NextIntlClientProvider>,
  );

describe("CommentsFeed", () => {
  it("lists each comment with its routine, day and pain, flagging new ones", () => {
    setup([comment(), comment({ id: "2", comment: "Fine", pain: null, seen: true })]);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("A bit pinchy")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Knee rehab")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Oct 7, 2026")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Pain 6/10")).toBeInTheDocument();
    expect(within(items[0]!).getByText("New")).toBeInTheDocument();
    expect(within(items[1]!).queryByText("New")).not.toBeInTheDocument();
    expect(within(items[1]!).queryByText(/Pain/)).not.toBeInTheDocument();
  });

  it("shows comments as plain text, never as markup", () => {
    setup([comment({ comment: "<b>bold</b> **x**" })]);
    expect(screen.getByText("<b>bold</b> **x**")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("says when there are none", () => {
    setup([]);
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
