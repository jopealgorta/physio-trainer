"use client";

import { PlusIcon } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

/**
 * A "New …" button that creates the thing straight away (a default name, no dialog): a form of
 * hidden fields posted to a create action that redirects to the editor on success. Works before
 * hydration; disabled while the create is on the way so a double click makes one.
 */
export function CreateButton<S>({
  action,
  initialState,
  fields,
  label,
  pendingLabel,
  errorMessage,
}: {
  action: (state: Awaited<S>, formData: FormData) => Promise<S>;
  initialState: Awaited<S>;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  /** What to tell the physio when the action refused, else null. */
  errorMessage: (state: Awaited<S>) => string | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const error = errorMessage(state);
  return (
    <form action={formAction} className="grid justify-items-end gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" disabled={pending}>
        <PlusIcon aria-hidden /> {pending ? pendingLabel : label}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
