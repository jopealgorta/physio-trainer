import { randomBytes, scryptSync } from "node:crypto";

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** A fresh valid share code (the same alphabet as src/lib/share-links.ts). */
export const newCode = () => Array.from(randomBytes(8), (byte) => ALPHABET[byte & 31]).join("");

/** Same format as src/server/sharing/pin-hash.ts: scrypt$N$r$p$salt$hash. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** ISO weekday (1 = Monday) of today plus `days`, in UTC (the test physios' time zone). */
export const isoWeekdayIn = (days = 0) =>
  ((new Date(Date.now() + days * 86_400_000).getUTCDay() + 6) % 7) + 1;

export async function insertCustomer(
  physioId: string,
  values: { firstName?: string; locale?: string; phone?: string | null; archived?: boolean } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.customers (physio_id, first_name, last_name, locale, phone, archived_at)
    values (${physioId}, ${values.firstName ?? "Ana"}, 'Private', ${values.locale ?? "en"},
      ${values.phone ?? null}, ${values.archived ? sql`now()` : null})
    returning id`;
  return row.id;
}

/** An active routine with one exercise (3 sets of 12, a note and instructions). */
export async function insertRoutine(
  physioId: string,
  customerId: string,
  name: string,
  options: { standalone?: boolean; sessionsPerWeek?: number; exercise?: string } = {},
): Promise<string> {
  const [exercise] = await sql<{ id: string }[]>`
    insert into public.exercises (physio_id, name, instructions)
    values (${physioId}, ${options.exercise ?? `${name} exercise`}, 'Keep your back straight.')
    returning id`;
  const [routine] = await sql<{ id: string }[]>`
    insert into public.routines (physio_id, customer_id, name, notes, status, is_standalone, sessions_per_week)
    values (${physioId}, ${customerId}, ${name}, 'Warm up first.', 'active',
      ${options.standalone ?? true}, ${options.sessionsPerWeek ?? null})
    returning id`;
  const [item] = await sql<{ id: string }[]>`
    insert into public.routine_items (physio_id, routine_id, exercise_id, position)
    values (${physioId}, ${routine.id}, ${exercise.id}, 0) returning id`;
  await sql`
    insert into public.routine_item_sets (physio_id, routine_item_id, position, reps)
    select ${physioId}, ${item.id}, n, 12 from generate_series(0, 2) n`;
  return routine.id;
}

export async function insertPlan(
  physioId: string,
  customerId: string,
  name: string,
  entries: { weekday: number; routineId: string; label?: string }[],
): Promise<string> {
  const [plan] = await sql<{ id: string }[]>`
    insert into public.weekly_plans (physio_id, customer_id, name, status)
    values (${physioId}, ${customerId}, ${name}, 'active') returning id`;
  for (const [position, entry] of entries.entries()) {
    await sql`
      insert into public.weekly_plan_entries (physio_id, weekly_plan_id, weekday, routine_id, position, label)
      values (${physioId}, ${plan.id}, ${entry.weekday}, ${entry.routineId}, ${position}, ${entry.label ?? null})`;
  }
  return plan.id;
}

export type SeededLink = { code: string; slug: string; path: string };

export async function insertCustomerLink(
  physio: { id: string; handle: string },
  customerId: string,
  options: { slug?: string; pin?: string; revoked?: boolean; expired?: boolean } = {},
): Promise<SeededLink> {
  const code = newCode();
  const slug = options.slug ?? "ana";
  await sql`
    insert into public.share_links (physio_id, customer_id, target, slug, code, pin_hash, revoked_at, expires_at)
    values (${physio.id}, ${customerId}, 'customer', ${slug}, ${code},
      ${options.pin ? hashPin(options.pin) : null},
      ${options.revoked ? sql`now()` : null},
      ${options.expired ? sql`now() - interval '1 day'` : null})`;
  return { code, slug, path: `/${physio.handle}/${slug}-${code}` };
}

export async function linkRow(code: string) {
  const [row] = await sql<{ open_count: number; revoked_at: Date | null }[]>`
    select open_count, revoked_at from public.share_links where code = ${code}`;
  return row;
}

export async function setBranding(
  physioId: string,
  values: { clinicName: string; accent?: string; contactPhone?: string },
) {
  await sql`
    update public.physios
    set clinic_name = ${values.clinicName}, accent_color = ${values.accent ?? null},
      contact_phone = ${values.contactPhone ?? null}
    where id = ${physioId}`;
}
