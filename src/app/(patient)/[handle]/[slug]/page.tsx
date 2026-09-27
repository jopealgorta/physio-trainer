import { notFound } from "next/navigation";

/**
 * Public patient page: /{physio-handle}/{slug}-{shortId}. No account required.
 * Implemented in docs/specs/10-sharing-and-patient-page.md; until then every link 404s.
 */
export default async function PatientPage() {
  notFound();
}
