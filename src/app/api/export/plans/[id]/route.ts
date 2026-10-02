import { exportForPhysio } from "@/server/export/physio";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: RouteContext<"/api/export/plans/[id]">) {
  const { id } = await params;
  return exportForPhysio("plan", id, new URL(request.url));
}
