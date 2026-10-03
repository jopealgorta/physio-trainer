import type { Route } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { after } from "next/server";

import { PatientHome } from "@/components/patient/patient-home";
import { PinGate } from "@/components/patient/pin-gate";
import { Unavailable } from "@/components/patient/unavailable";
import { isLinkPreviewBot } from "@/lib/link-preview-bots";
import { buildSharePath, parseSlugParam } from "@/lib/share-links";
import { firstParam } from "@/lib/search-params";
import { weekLogRange } from "@/lib/session-logs";
import { getLinkAccess } from "@/server/patient/access";
import { loadLink } from "@/server/patient/load";
import { getPatientExerciseLogs } from "@/server/patient/log-exercise";
import { getPatientLogs } from "@/server/patient/log-session";
import { touchLink } from "@/server/patient/touch";
import { getPatientView } from "@/server/patient/view";

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Public patient page: `/{handle}/{slug}-{code}`, no account. The code is the only lookup key;
 * a stale handle or slug redirects (308) to the canonical URL so renames never break links.
 */
export default async function PatientPage({ params, searchParams }: PageProps<"/[handle]/[slug]">) {
  const [{ handle, slug }, sp] = await Promise.all([params, searchParams]);
  const parsed = parseSlugParam(slug);
  if (!parsed) notFound();
  const resolved = await loadLink(parsed.code);
  if (resolved.status === "not_found") notFound();

  const { shell } = resolved;
  const path = buildSharePath(shell.handle, shell.slug, shell.code);
  if (decode(handle) !== shell.handle || decode(slug) !== `${shell.slug}-${shell.code}`) {
    const day = firstParam(sp.day);
    permanentRedirect((day ? `${path}?day=${encodeURIComponent(day)}` : path) as Route);
  }

  if (resolved.status === "unavailable") {
    return <Unavailable reason={resolved.reason} branding={shell.branding} locale={shell.locale} />;
  }

  const { link } = resolved;
  const { owner, unlocked } = await getLinkAccess(shell, link);
  if (!unlocked) return <PinGate code={shell.code} clinicName={shell.branding.clinicName} />;

  const day = Number(firstParam(sp.day));
  const view = await getPatientView(shell, link, Number.isInteger(day) ? day : null);
  const [from, to] = weekLogRange(view.today);
  const [logs, exerciseLogs] = await Promise.all([
    getPatientLogs(shell, link, from, to),
    getPatientExerciseLogs(shell, link, from, to),
  ]);
  // Neither the physio previewing their own link nor a chat app unfurling it is a patient opening it.
  if (!owner && !isLinkPreviewBot((await headers()).get("user-agent"))) {
    after(() => touchLink(link.id));
  }

  return (
    <PatientHome
      view={view}
      firstName={link.customerFirstName}
      locale={shell.locale}
      path={path}
      logging={{ code: shell.code, logs, exerciseLogs, canLog: !owner }}
    />
  );
}
