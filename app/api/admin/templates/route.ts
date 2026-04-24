import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM templates ORDER BY sort_order ASC, created_at DESC
    `;
    // SQLite 里 editable_fields 存的是 JSON 字符串，管理后台期望对象
    const normalized = rows.map((r) => {
      const ef = (r as Record<string, unknown>).editable_fields;
      if (typeof ef === "string") {
        try {
          return { ...r, editable_fields: JSON.parse(ef) };
        } catch {
          return { ...r, editable_fields: { texts: [], colors: [], images: [] } };
        }
      }
      return r;
    });
    return Response.json(normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id, name, category, thumbnail, width, height, html_file,
      editable_fields, sort_order, template_type, psd_file, canvas_width, canvas_height,
    } = body;

    const isPsd = template_type === "psd";

    if (!id || !name || !category || !width || !height) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!isPsd && !html_file) {
      return Response.json({ error: "Missing html_file for HTML template" }, { status: 400 });
    }

    const sql = getDb();
    await sql`
      INSERT INTO templates (
        id, name, category, thumbnail, width, height, html_file,
        editable_fields, sort_order, template_type, psd_file, canvas_width, canvas_height
      ) VALUES (
        ${id}, ${name}, ${category}, ${thumbnail ?? ""}, ${width}, ${height}, ${html_file ?? ""},
        ${JSON.stringify(editable_fields ?? {})}, ${sort_order ?? 0},
        ${template_type ?? "html"}, ${psd_file ?? null}, ${canvas_width ?? null}, ${canvas_height ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        thumbnail = EXCLUDED.thumbnail,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        html_file = EXCLUDED.html_file,
        editable_fields = EXCLUDED.editable_fields,
        sort_order = EXCLUDED.sort_order,
        template_type = EXCLUDED.template_type,
        psd_file = EXCLUDED.psd_file,
        canvas_width = EXCLUDED.canvas_width,
        canvas_height = EXCLUDED.canvas_height,
        updated_at = CURRENT_TIMESTAMP
    `;

    revalidatePath("/");
    if (id) revalidatePath(`/editor/${id}`);

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
