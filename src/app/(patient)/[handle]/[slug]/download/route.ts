import { exportForPatient } from "@/server/patient/download";

export const runtime = "nodejs";

// The proxy's patient-path rules don't cover this path, so the privacy headers are set by
// `exportForPatient` itself.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/[handle]/[slug]/download">,
) {
  return exportForPatient(await params);
}
