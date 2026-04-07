import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM templates ORDER BY sort_order ASC, created_at DESC
    `;
    return Response.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, category, thumbnail, width, height, html_file, editable_fields, sort_order } = body;

    if (!id || !name || !category || !thumbnail || !width || !height || !html_file) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sql = getDb();
    await sql`
      INSERT INTO templates (id, name, category, thumbnail, width, height, html_file, editable_fields, sort_order)
      VALUES (${id}, ${name}, ${category}, ${thumbnail}, ${width}, ${height}, ${html_file}, ${JSON.stringify(editable_fields)}, ${sort_order ?? 0})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        thumbnail = EXCLUDED.thumbnail,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        html_file = EXCLUDED.html_file,
        editable_fields = EXCLUDED.editable_fields,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
    `;

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
