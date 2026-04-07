import { getDb } from "./db";
import type { Template } from "@/types/template";

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  width: number;
  height: number;
  html_file: string;
  editable_fields: Template["editableFields"];
  sort_order: number;
}

function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    thumbnail: row.thumbnail,
    width: row.width,
    height: row.height,
    htmlFile: row.html_file,
    editableFields: row.editable_fields,
  };
}

export async function getAllTemplates(): Promise<Template[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM templates ORDER BY sort_order ASC, created_at DESC
  `) as TemplateRow[];
  return rows.map(rowToTemplate);
}

export async function getTemplateById(id: string): Promise<Template | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM templates WHERE id = ${id}
  `) as TemplateRow[];
  if (rows.length === 0) return null;
  return rowToTemplate(rows[0]);
}
