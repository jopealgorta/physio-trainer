/** Escapes %, _ and \ so user text matches literally inside a LIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
