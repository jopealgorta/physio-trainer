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
    values (${physioId}, ${values.firstName ?? "Ana"}, 'Zyxwsurname', ${values.locale ?? "en"},
      ${values.phone ?? null}, ${values.archived ? sql`now()` : null})
    returning id`;
  return row.id;
}

/** An active routine with one exercise (3 sets of 12, a note and instructions). */
export async function insertRoutine(
  physioId: string,
  customerId: string,
  name: string,
  options: {
    standalone?: boolean;
    sessionsPerWeek?: number;
    exercise?: string;
    /** A second exercise (3 sets of 12) after the first. */
    secondExercise?: string;
    /** Attach this YouTube video (an 11-character id) to the exercise. */
    videoId?: string;
  } = {},
): Promise<string> {
  const [exercise] = await sql<{ id: string }[]>`
    insert into public.exercises (physio_id, name, instructions)
    values (${physioId}, ${options.exercise ?? `${name} exercise`}, 'Keep your back straight.')
    returning id`;
  if (options.videoId) {
    await sql`
      insert into public.exercise_media (physio_id, exercise_id, kind, external_url, external_id, position)
      values (${physioId}, ${exercise.id}, 'youtube', ${`https://www.youtube.com/watch?v=${options.videoId}`}, ${options.videoId}, 0)`;
  }
  const [routine] = await sql<{ id: string }[]>`
    insert into public.routines (physio_id, customer_id, name, notes, status, is_standalone, sessions_per_week)
    values (${physioId}, ${customerId}, ${name}, 'Warm up first.', 'active',
      ${options.standalone ?? true}, ${options.sessionsPerWeek ?? null})
    returning id`;
  const sectionId = await insertSection(physioId, routine.id);
  const [item] = await sql<{ id: string }[]>`
    insert into public.routine_items (physio_id, routine_id, exercise_id, position, section_id)
    values (${physioId}, ${routine.id}, ${exercise.id}, 0, ${sectionId}) returning id`;
  await sql`
    insert into public.routine_item_sets (physio_id, routine_item_id, position, reps)
    select ${physioId}, ${item.id}, n, 12 from generate_series(0, 2) n`;
  if (options.secondExercise) {
    const [second] = await sql<{ id: string }[]>`
      insert into public.exercises (physio_id, name, instructions)
      values (${physioId}, ${options.secondExercise}, 'Keep your back straight.')
      returning id`;
    const [secondItem] = await sql<{ id: string }[]>`
      insert into public.routine_items (physio_id, routine_id, exercise_id, position, section_id)
      values (${physioId}, ${routine.id}, ${second.id}, 1, ${sectionId}) returning id`;
    await sql`
      insert into public.routine_item_sets (physio_id, routine_item_id, position, reps)
      select ${physioId}, ${secondItem.id}, n, 12 from generate_series(0, 2) n`;
  }
  return routine.id;
}

/** Every routine item needs a section (spec 22): seeded routines get one "Main" section. */
async function insertSection(physioId: string, routineId: string): Promise<string> {
  const [section] = await sql<{ id: string }[]>`
    insert into public.routine_sections (physio_id, routine_id, name, position)
    values (${physioId}, ${routineId}, 'Main', 0) returning id`;
  return section.id;
}

/** Activates every draft routine of a customer (routines made through the UI start as drafts). */
export async function activateRoutines(customerId: string): Promise<void> {
  await sql`
    update public.routines set status = 'active', is_standalone = true
    where customer_id = ${customerId} and status = 'draft'`;
}

export async function renameRoutine(routineId: string, name: string): Promise<void> {
  await sql`update public.routines set name = ${name} where id = ${routineId}`;
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

/** The note a plan shows its patient on one weekday (1 = Monday). */
export async function insertDayNote(
  physioId: string,
  planId: string,
  weekday: number,
  notes: string,
): Promise<void> {
  await sql`
    insert into public.weekly_plan_days (physio_id, weekly_plan_id, weekday, notes)
    values (${physioId}, ${planId}, ${weekday}, ${notes})`;
}

export type SeededLink = { code: string; slug: string; path: string };

export async function insertCustomerLink(
  physio: { id: string; handle: string },
  customerId: string,
  options: {
    slug?: string;
    pin?: string;
    revoked?: boolean;
    expired?: boolean;
    /** Share this routine or plan instead of the whole customer. */
    routineId?: string;
    weeklyPlanId?: string;
  } = {},
): Promise<SeededLink> {
  const code = newCode();
  const slug = options.slug ?? "ana";
  const target = options.routineId ? "routine" : options.weeklyPlanId ? "weekly_plan" : "customer";
  await sql`
    insert into public.share_links (physio_id, customer_id, target, routine_id, weekly_plan_id, slug, code, pin_hash, revoked_at, expires_at)
    values (${physio.id}, ${customerId}, ${target}, ${options.routineId ?? null},
      ${options.weeklyPlanId ?? null}, ${slug}, ${code},
      ${options.pin ? hashPin(options.pin) : null},
      ${options.revoked ? sql`now()` : null},
      ${options.expired ? sql`now() - interval '1 day'` : null})`;
  return { code, slug, path: `/${physio.handle}/${slug}-${code}` };
}

export async function revokeLink(code: string) {
  await sql`update public.share_links set revoked_at = now() where code = ${code}`;
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

/**
 * A standalone routine for workout mode: "Bridge" (2 sets of 8 reps, hold 5 s, rest 20 s) then
 * "Plank" (one timed set of 30 s).
 */
export async function insertWorkoutRoutine(
  physioId: string,
  customerId: string,
  name = "Knee rehab",
): Promise<string> {
  const [routine] = await sql<{ id: string }[]>`
    insert into public.routines (physio_id, customer_id, name, status, is_standalone)
    values (${physioId}, ${customerId}, ${name}, 'active', true) returning id`;
  const sectionId = await insertSection(physioId, routine.id);
  const exercise = async (
    title: string,
    position: number,
    hold: number | null,
    rest: number | null,
  ) => {
    const [ex] = await sql<{ id: string }[]>`
      insert into public.exercises (physio_id, name) values (${physioId}, ${title}) returning id`;
    const [item] = await sql<{ id: string }[]>`
      insert into public.routine_items (physio_id, routine_id, exercise_id, position, hold_seconds, rest_seconds, section_id)
      values (${physioId}, ${routine.id}, ${ex.id}, ${position}, ${hold}, ${rest}, ${sectionId}) returning id`;
    return item.id;
  };
  const bridge = await exercise("Bridge", 0, 5, 20);
  await sql`
    insert into public.routine_item_sets (physio_id, routine_item_id, position, reps)
    select ${physioId}, ${bridge}, n, 8 from generate_series(0, 1) n`;
  const plank = await exercise("Plank", 1, null, null);
  await sql`
    insert into public.routine_item_sets (physio_id, routine_item_id, position, duration_seconds)
    values (${physioId}, ${plank}, 0, 30)`;
  return routine.id;
}
