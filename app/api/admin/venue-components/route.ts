import { listVenueComponents } from "@/lib/venue-components-db";

/** 列出所有会场组件，按 group + sortOrder 排序。 */
export async function GET() {
  try {
    const list = await listVenueComponents();
    return Response.json({ ok: true, components: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components] GET", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
