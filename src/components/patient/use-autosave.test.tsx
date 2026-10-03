import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DELAY_MS, useAutosave } from "./use-autosave";

type R = { ok: true; data: string } | { ok: false; error: "date" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const ok = (data = "saved"): R => ({ ok: true, data });

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(save: (v: string) => Promise<R>, onSaved = vi.fn()) {
    const hook = renderHook(() => useAutosave<string, string, "date">({ save, onSaved }));
    return { ...hook, onSaved };
  }

  it("sends values after the delay", async () => {
    const save = vi.fn(async () => ok());
    const { result } = setup(save);
    act(() => result.current.schedule("a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledWith("a");
  });

  it("debounces to the latest values", async () => {
    const save = vi.fn(async () => ok());
    const { result } = setup(save);
    act(() => result.current.schedule("a"));
    act(() => result.current.schedule("b"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
  });

  it("flush sends immediately", async () => {
    const save = vi.fn(async () => ok());
    const { result } = setup(save);
    act(() => {
      result.current.schedule("a");
      result.current.flush();
    });
    expect(save).toHaveBeenCalledWith("a");
  });

  it("runs one request at a time, latest queued values winning", async () => {
    const first = deferred<R>();
    const save = vi.fn<(v: string) => Promise<R>>().mockReturnValueOnce(first.promise);
    save.mockResolvedValue(ok());
    const { result } = setup(save);
    act(() => {
      result.current.schedule("a");
      result.current.flush();
    });
    act(() => {
      result.current.schedule("b");
      result.current.schedule("c");
      result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve(ok());
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");
  });

  it("reports a returned error and retries the failed values", async () => {
    const save = vi
      .fn<(v: string) => Promise<R>>()
      .mockResolvedValueOnce({ ok: false, error: "date" })
      .mockResolvedValueOnce(ok());
    const { result } = setup(save);
    act(() => {
      result.current.schedule("a");
      result.current.flush();
    });
    await act(async () => {});
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("date");
    act(() => result.current.retry());
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("a");
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("maps a throwing save to the generic error", async () => {
    const save = vi.fn<(v: string) => Promise<R>>().mockRejectedValue(new Error("boom"));
    const { result } = setup(save);
    act(() => {
      result.current.schedule("a");
      result.current.flush();
    });
    await act(async () => {});
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("generic");
  });

  it("sends queued values on unmount and still calls onSaved", async () => {
    const save = vi.fn(async () => ok("d"));
    const { result, unmount, onSaved } = setup(save);
    act(() => result.current.schedule("a"));
    unmount();
    expect(save).toHaveBeenCalledWith("a");
    await act(async () => {});
    expect(onSaved).toHaveBeenCalledWith("d", "a");
  });

  it("passes the sent values to onSaved", async () => {
    const save = vi.fn(async () => ok("data"));
    const { result, onSaved } = setup(save);
    act(() => {
      result.current.schedule("x");
      result.current.flush();
    });
    await act(async () => {});
    expect(onSaved).toHaveBeenCalledWith("data", "x");
  });
});
