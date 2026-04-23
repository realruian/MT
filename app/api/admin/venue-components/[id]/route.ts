import { NextRequest } from "next/server";
import { deleteVenueComponent } from "@/lib/venue-components-db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const removed = await deleteVenueComponent(id);
    if (!removed) {
      return Response.json({ error: "组件不存在或已被删除" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components/[id]] DELETE", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
