export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  // `email` is what was submitted, so the field can show it again after React resets the form.
  | { status: "error"; error: "emailInvalid" | "sendFailed"; email: string };
