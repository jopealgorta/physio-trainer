"use client";

import { PencilIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A page title that reads as a heading, with a pencil button to rename it. Renaming swaps in an
 * input (focused, text selected): Enter or leaving the field confirms, Escape cancels. A name the
 * `validate` check refuses, or an error `onConfirm` returns, keeps the input open and says why.
 * The heading sits flush with the content around it; the input reaches out by its own padding so
 * the text stays put.
 */
export function EditableTitle({
  value,
  label,
  editLabel,
  validate,
  onConfirm,
  onDraftChange,
  error,
  hint,
  after,
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
  /**
   * Gets every keystroke (and the old name back on Escape), for an editor that saves the name
   * with its own Save button: tapping Save mid-edit then saves what was typed.
   */
  onDraftChange?: (draft: string) => void;
  /** An error from elsewhere (a refused save), shown under the title. */
  error?: string | null;
  /** About the name: shown while renaming, and describes the rename button all along. */
  hint?: string;
  /** Shown after the heading in its row (status badges). */
  after?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The name when the edit started, for Escape to put back.
  const [origin, setOrigin] = useState(value);
  // A title arriving that is neither ours nor the draft echoed back (a restored version) ends
  // the edit.
  const [base, setBase] = useState(value);
  if (value !== base) {
    setBase(value);
    if (editing && !pending && value !== draft) {
      setEditing(false);
      setProblem(null);
    }
  }
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
    setOrigin(value);
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
    // With live drafts `value` already echoes the draft: compare with where the edit started.
    if (name === (onDraftChange ? origin : value)) {
      if (onDraftChange && draft !== origin) onDraftChange(origin);
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
      if (pending) return;
      if (onDraftChange && draft !== origin) onDraftChange(origin);
      stop(true);
    }
  }

  const shown = problem ?? error ?? null;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = hint ? hintId : undefined;
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
            onDraftChange?.(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => void confirm(false)}
          aria-label={label}
          aria-invalid={shown !== null}
          aria-describedby={descriptions || undefined}
          autoComplete="off"
          enterKeyHint="done"
          className="-mx-2 -my-1 h-auto w-[calc(100%+1rem)] min-w-0 px-2 py-1 text-2xl font-semibold tracking-tight md:text-2xl"
        />
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
          <h1
            className={cn("min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere", className)}
          >
            {value}
          </h1>
          <Button
            ref={pencil}
            type="button"
            variant="ghost"
            size="icon-lg"
            className="text-muted-foreground mr-2 shrink-0"
            aria-label={editLabel}
            aria-describedby={describedBy}
            onClick={start}
          >
            <PencilIcon aria-hidden />
          </Button>
          {after}
        </div>
      )}
      {hint ? (
        <p id={hintId} hidden={!editing} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {shown ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {shown}
        </p>
      ) : null}
    </div>
  );
}
