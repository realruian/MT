import { initDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";

export async function POST() {
  try {
    await initDatabase();

    const sql = getDb();
    const editableFields = {
      texts: [
        { key: "mainTitle", label: "主标题", defaultValue: "主标题文案", defaultColor: "#ffffff" },
        { key: "subTitle", label: "副标题", defaultValue: "副标题文案", defaultColor: "#000000" },
      ],
      colors: [],
      images: [
        { key: "bgTemplate", label: "背景图片", defaultSrc: "/templates/background/hotpot.jpg" },
      ],
    };

    await sql`
      INSERT INTO templates (id, name, category, thumbnail, width, height, html_file, editable_fields, sort_order)
      VALUES (
        'header',
        '会场头图 Banner',
        '会场头图',
        '/images/1.jpg',
        750,
        810,
        '/templates/header.html',
        ${JSON.stringify(editableFields)},
        0
      )
      ON CONFLICT (id) DO NOTHING
    `;

    return Response.json({ ok: true, message: "Seed data inserted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
