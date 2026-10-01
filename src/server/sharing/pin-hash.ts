import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Shared by the physio side (set a PIN) and the patient side (check one). Format:
// scrypt$N$r$p$salt$hash (base64url), so the parameters can change without breaking old hashes.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

const derive = (pin: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(pin, salt, KEY_LENGTH, { N: n, r, p }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pin, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Constant-time check of a PIN against a stored hash; false for a malformed hash. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const params = [Number(n), Number(r), Number(p)];
  if (!params.every(Number.isSafeInteger) || expected.length !== KEY_LENGTH) return false;
  try {
    const actual = await derive(
      pin,
      Buffer.from(salt, "base64url"),
      ...(params as [number, number, number]),
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
