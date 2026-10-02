import { adherence, type LogFact, type PlanFact, type SingleFact } from "./adherence";
import { addDays } from "./phases";
import { attentionWindows, needsAttention, type AttentionReason } from "./attention";
import { isoWeekday } from "./calendar-date";

/** The dashboard's lists (spec 13), built from plain facts so the rules stay unit-testable. */
export const RECENT_LIMIT = 8;

export type CustomerFacts = {
  id: string;
  name: string;
  plans: PlanFact[];
  singles: SingleFact[];
  /** The last 14 days of logs; `updatedAt` orders "recently active". */
  logs: (LogFact & { updatedAt: Date })[];
  /** Whether the patient still has a link that works, i.e. can log at all. */
  hasLink: boolean;
};

/** A customer's unseen comments, already reduced to how many and which one is newest. */
export type UnseenSummary = {
  customerId: string;
  count: number;
  latest: { comment: string; performedOn: string; routineName: string };
};

export type Dashboard = {
  totals: { activeCustomers: number; sessionsThisWeek: number };
  attention: { customerId: string; name: string; reasons: AttentionReason[] }[];
  newComments: {
    customerId: string;
    name: string;
    count: number;
    latest: { comment: string; performedOn: string; routineName: string };
  }[];
  recentlyActive: {
    customerId: string;
    name: string;
    lastLoggedAt: Date;
    sessionsLast7: number;
  }[];
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function buildDashboard(input: {
  today: string;
  customers: readonly CustomerFacts[];
  unseen: readonly UnseenSummary[];
}): Dashboard {
  const { today, customers, unseen } = input;
  const windows = attentionWindows(today);
  const monday = addDays(today, -(isoWeekday(today) - 1));
  const sunday = addDays(monday, 6);

  let sessionsThisWeek = 0;
  const attention: Dashboard["attention"] = [];
  const recentlyActive: Dashboard["recentlyActive"] = [];

  for (const customer of customers) {
    sessionsThisWeek += customer.logs.filter(
      (entry) => entry.completed && entry.performedOn >= monday && entry.performedOn <= sunday,
    ).length;

    const reasons = needsAttention({
      today,
      logs: customer.logs,
      adherence: adherence(
        windows.adherence[0],
        windows.adherence[1],
        customer.plans,
        customer.singles,
        customer.logs,
      ),
      hasLink: customer.hasLink,
    });
    if (reasons.length > 0)
      attention.push({ customerId: customer.id, name: customer.name, reasons });

    // A session that was undone is not activity.
    const recent = customer.logs.filter(
      (entry) => entry.completed && entry.performedOn >= windows.recent[0],
    );
    if (recent.length > 0) {
      recentlyActive.push({
        customerId: customer.id,
        name: customer.name,
        lastLoggedAt: new Date(Math.max(...recent.map((entry) => entry.updatedAt.getTime()))),
        sessionsLast7: recent.length,
      });
    }
  }

  // Most reasons first, then the highest pain, then by name.
  const painOf = (reasons: AttentionReason[]) =>
    Math.max(0, ...reasons.map((reason) => (reason.rule === "highPain" ? reason.pain : 0)));
  attention.sort(
    (a, b) =>
      b.reasons.length - a.reasons.length || painOf(b.reasons) - painOf(a.reasons) || byName(a, b),
  );
  recentlyActive.sort(
    (a, b) => b.lastLoggedAt.getTime() - a.lastLoggedAt.getTime() || byName(a, b),
  );

  const names = new Map(customers.map((customer) => [customer.id, customer.name]));
  const newComments: Dashboard["newComments"] = unseen
    .filter((entry) => names.has(entry.customerId))
    .map((entry) => ({
      customerId: entry.customerId,
      name: names.get(entry.customerId)!,
      count: entry.count,
      latest: entry.latest,
    }))
    .sort((a, b) => b.latest.performedOn.localeCompare(a.latest.performedOn) || byName(a, b));

  return {
    totals: { activeCustomers: customers.length, sessionsThisWeek },
    attention,
    newComments,
    recentlyActive: recentlyActive.slice(0, RECENT_LIMIT),
  };
}
