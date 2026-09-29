const firstChar = (value: string) => Array.from(value.trim())[0] ?? "";

/** Up to two initials (first letter of first and last name), uppercased; "?" if there is none. */
export function initials(firstName: string, lastName: string | null): string {
  const result = (firstChar(firstName) + firstChar(lastName ?? "")).toLocaleUpperCase();
  return result || "?";
}
