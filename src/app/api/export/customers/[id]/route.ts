import { exportForPhysio } from "@/server/export/physio";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/export/customers/[id]">,
) {
  const { id } = await params;
  return exportForPhysio("customer", id, new URL(request.url));
}
