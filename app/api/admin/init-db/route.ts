import { initDatabase } from "@/lib/db-init";

export async function POST() {
  try {
    await initDatabase();
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
