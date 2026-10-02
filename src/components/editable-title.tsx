"use client";

import { PencilIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A page title that reads as a heading, with a pencil button to rename it. Renaming swaps in an
 * input (focused, text selected): Enter or leaving the field confirms, Escape cancels. A name the
 * `validate` check refuses, or an error `onConfirm` returns, keeps the input open and says why.
 */
export function EditableTitle({
  value,
  label,
  editLabel,
  validate,
  onConfirm,
  error,
  describedBy,
  className,
}: {
  value: string;
  /** The input's accessible name ("Routine name"). */
  label: string;
  /** The pencil button's accessible name ("Rename routine"). */
  editLabel: string;
  /** The error message for a trimmed name, or null when it is fine. */
  validate: (name: string) => string | null;
  /** Takes the trimmed, changed name; an error message keeps the input open. */
  onConfirm: (name: string) => void | string | null | Promise<string | null | void>;
  /** An error from elsewhere (a refused save), shown under the title. */
  error?: string | null;
  /** A hint about the name, read along with both the button and the input. */
  describedBy?: string;
  className?: string;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  // Set by Enter and Escape: the keyboard user goes back to the pencil. Leaving the field by
  // clicking elsewhere keeps focus where it went.
  const refocus = useRef(false);
  // Escape unmounts the focused input, and its blur must not confirm what was cancelled.
  const closing = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      pencil.current?.focus();
    }
  }, [editing]);

  function start() {
    closing.current = false;
    setDraft(value);
    setProblem(null);
    setEditing(true);
  }

  function stop(viaKeyboard: boolean) {
    closing.current = true;
    refocus.current = viaKeyboard;
    setProblem(null);
    setEditing(false);
  }

  async function confirm(viaKeyboard: boolean) {
    if (pending || closing.current) return;
    const name = draft.trim();
    if (name === value) {
      stop(viaKeyboard);
      return;
    }
    const invalid = validate(name);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setPending(true);
    try {
      const refused = await onConfirm(name);
      if (refused) setProblem(refused);
      else stop(viaKeyboard);
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirm(true);
    } else if (event.key === "Escape") {
      // Inside a dialog or drawer, Escape cancels the rename only.
      event.preventDefault();
      event.stopPropagation();
      if (!pending) stop(true);
    }
  }

  const shown = problem ?? error ?? null;
  const errorId = `${id}-error`;
  const descriptions = [describedBy, shown ? errorId : undefined].filter(Boolean).join(" ");

  return (
    <div className="grid min-w-0 gap-1">
      {editing ? (
        <Input
          ref={input}
          value={draft}
          readOnly={pending}
          aria-busy={pending}
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => void confirm(false)}
          aria-label={label}
          aria-invalid={shown !== null}
          aria-describedby={descriptions || undefined}
          autoComplete="off"
          enterKeyHint="done"
          className="h-auto min-w-0 px-2 py-1 text-2xl font-semibold tracking-tight md:text-2xl"
        />
      ) : (
        <div className="flex min-w-0 items-start gap-1">
          <h1
            className={cn(
              "min-w-0 px-2 py-1 text-2xl font-semibold tracking-tight wrap-anywhere",
              className,
            )}
          >
            {value}
          </h1>
          <Button
            ref={pencil}
            type="button"
            variant="ghost"
            size="icon-lg"
            className="text-muted-foreground mt-1 shrink-0"
            aria-label={editLabel}
            aria-describedby={describedBy}
            onClick={start}
          >
            <PencilIcon aria-hidden />
          </Button>
        </div>
      )}
      {shown ? (
        <p id={errorId} role="alert" className="text-destructive px-2 text-sm">
          {shown}
        </p>
      ) : null}
    </div>
  );
}
