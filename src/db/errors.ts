type PgErrorLike = { code?: unknown; constraint_name?: unknown; cause?: unknown };

/** True when `error` (possibly wrapped by Drizzle) is a Postgres unique violation. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = findPgError(error);
  return (
    pgError?.code === "23505" &&
    (constraint === undefined || pgError.constraint_name === constraint)
  );
}

function findPgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const candidate = current as PgErrorLike;
    if (typeof candidate.code === "string") return candidate;
    current = candidate.cause;
  }
  return null;
}
