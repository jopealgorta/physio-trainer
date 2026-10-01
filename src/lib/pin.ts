// Imported by server code, client components and tests: no server-only modules.

export const PIN_LENGTH = 4;
const PIN_SPACE = 10 ** PIN_LENGTH;
// Largest multiple of 10000 that fits in a Uint32: values from it upwards are redrawn so every
// PIN is equally likely.
const PIN_LIMIT = Math.floor(2 ** 32 / PIN_SPACE) * PIN_SPACE;

type RandomUint32 = () => Uint32Array;
const cryptoUint32: RandomUint32 = () => crypto.getRandomValues(new Uint32Array(1));

/** Four random digits ("0042" is possible). */
export function generatePin(random: RandomUint32 = cryptoUint32): string {
  for (;;) {
    const value = random()[0]!;
    if (value < PIN_LIMIT) return String(value % PIN_SPACE).padStart(PIN_LENGTH, "0");
  }
}

export const isValidPin = (value: string): boolean => /^[0-9]{4}$/.test(value);

/** What a patient typed, without surrounding whitespace. */
export const normalizePin = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value.trim() : "";
