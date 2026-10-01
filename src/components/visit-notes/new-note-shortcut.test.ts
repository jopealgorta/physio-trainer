import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldOpenNewNote } from "./new-note-shortcut";

const press = (init: KeyboardEventInit, target?: Element) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, ...init });
  Object.defineProperty(event, "target", { value: target ?? document.body });
  return event;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldOpenNewNote", () => {
  it("accepts a bare N", () => {
    expect(shouldOpenNewNote(press({ key: "n" }))).toBe(true);
    expect(shouldOpenNewNote(press({ key: "N" }))).toBe(true);
  });

  it("ignores other keys, modifiers and held keys", () => {
    expect(shouldOpenNewNote(press({ key: "m" }))).toBe(false);
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(shouldOpenNewNote(press({ key: "n", [modifier]: true }))).toBe(false);
    }
    expect(shouldOpenNewNote(press({ key: "n", repeat: true }))).toBe(false);
  });

  it("ignores events already handled", () => {
    const event = press({ key: "n", cancelable: true });
    event.preventDefault();
    expect(shouldOpenNewNote(event)).toBe(false);
  });

  it("ignores typing in fields", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(shouldOpenNewNote(press({ key: "n" }, document.createElement(tag)))).toBe(false);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(shouldOpenNewNote(press({ key: "n" }, editable))).toBe(false);
  });

  it("ignores events while a dialog is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    expect(shouldOpenNewNote(press({ key: "n" }))).toBe(false);
    vi.restoreAllMocks();
  });
});
