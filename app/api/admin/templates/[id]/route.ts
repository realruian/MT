import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sql = getDb();
    const rows = await sql`SELECT * FROM templates WHERE id = ${id}`;
    if (rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const row = rows[0] as Record<string, unknown>;
    const ef = row.editable_fields;
    if (typeof ef === "string") {
      try {
        row.editable_fields = JSON.parse(ef);
      } catch {
        row.editable_fields = { texts: [], colors: [], images: [] };
      }
    }
    return Response.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM templates WHERE id = ${id}`;
    revalidatePath("/");
    revalidatePath(`/editor/${id}`);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
