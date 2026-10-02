import { exportForPhysio } from "@/server/export/physio";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: RouteContext<"/api/export/routines/[id]">) {
  const { id } = await params;
  return exportForPhysio("routine", id, new URL(request.url));
}
