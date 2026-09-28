/** Next.js searchParams values can repeat; pages only ever want the first one. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
