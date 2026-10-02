import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarkCommentsSeen } from "./mark-comments-seen";

const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/server/activity/actions", () => ({ markCommentsSeenAction: m.action }));

beforeEach(() => m.action.mockReset().mockResolvedValue({ ok: true }));

describe("MarkCommentsSeen", () => {
  it("marks the customer's comments as seen once the tab has shown them", () => {
    render(<MarkCommentsSeen customerId="c1" pending={2} />);
    expect(m.action).toHaveBeenCalledTimes(1);
    expect(m.action).toHaveBeenCalledWith("c1");
  });

  it("does nothing when there is nothing new", () => {
    render(<MarkCommentsSeen customerId="c1" pending={0} />);
    expect(m.action).not.toHaveBeenCalled();
  });
});
