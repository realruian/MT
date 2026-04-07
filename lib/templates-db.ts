import { getDb } from "./db";
import type { Template, PsdLayer } from "@/types/template";

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
  template_type?: string;
  psd_file?: string;
  canvas_width?: number;
  canvas_height?: number;
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
    templateType: (row.template_type as "html" | "psd") ?? "html",
    psdFile: row.psd_file ?? undefined,
    canvasWidth: row.canvas_width ?? undefined,
    canvasHeight: row.canvas_height ?? undefined,
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

interface PsdLayerRow {
  id: string;
  template_id: string;
  name: string;
  layer_type: string;
  z_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  rotation: number;
  image_url: string | null;
  text_content: string | null;
  font_family: string | null;
  font_size: number | null;
  font_color: string | null;
  font_weight: string | null;
  font_style: string | null;
  text_align: string | null;
  line_height: number | null;
  locked: boolean;
  sort_order: number;
}

function rowToPsdLayer(row: PsdLayerRow): PsdLayer {
  return {
    id: row.id,
    templateId: row.template_id,
    name: row.name,
    layerType: row.layer_type as PsdLayer["layerType"],
    zIndex: row.z_index,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    visible: row.visible,
    opacity: row.opacity,
    rotation: row.rotation ?? 0,
    imageUrl: row.image_url ?? undefined,
    textContent: row.text_content ?? undefined,
    fontFamily: row.font_family ?? undefined,
    fontSize: row.font_size ?? undefined,
    fontColor: row.font_color ?? undefined,
    fontWeight: row.font_weight ?? undefined,
    fontStyle: row.font_style ?? undefined,
    textAlign: row.text_align ?? undefined,
    lineHeight: row.line_height ?? undefined,
    locked: row.locked ?? false,
  };
}

export async function getPsdLayers(templateId: string): Promise<PsdLayer[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM psd_layers WHERE template_id = ${templateId} ORDER BY sort_order ASC
  `) as PsdLayerRow[];
  return rows.map(rowToPsdLayer);
}

export async function updatePsdLayer(
  layerId: string,
  updates: Partial<PsdLayer>,
): Promise<void> {
  const sql = getDb();

  const u = updates as Record<string, unknown>;

  if ("layerType" in u) {
    await sql`UPDATE psd_layers SET layer_type = ${u.layerType as string} WHERE id = ${layerId}`;
  }
  if ("name" in u) {
    await sql`UPDATE psd_layers SET name = ${u.name as string} WHERE id = ${layerId}`;
  }
  if ("visible" in u) {
    await sql`UPDATE psd_layers SET visible = ${u.visible as boolean} WHERE id = ${layerId}`;
  }
  if ("locked" in u) {
    await sql`UPDATE psd_layers SET locked = ${u.locked as boolean} WHERE id = ${layerId}`;
  }
  if ("opacity" in u) {
    await sql`UPDATE psd_layers SET opacity = ${u.opacity as number} WHERE id = ${layerId}`;
  }
  if ("imageUrl" in u) {
    await sql`UPDATE psd_layers SET image_url = ${(u.imageUrl as string) ?? null} WHERE id = ${layerId}`;
  }
  if ("textContent" in u) {
    await sql`UPDATE psd_layers SET text_content = ${(u.textContent as string) ?? null} WHERE id = ${layerId}`;
  }
  if ("fontFamily" in u) {
    await sql`UPDATE psd_layers SET font_family = ${(u.fontFamily as string) ?? null} WHERE id = ${layerId}`;
  }
  if ("fontSize" in u) {
    await sql`UPDATE psd_layers SET font_size = ${(u.fontSize as number) ?? null} WHERE id = ${layerId}`;
  }
  if ("fontColor" in u) {
    await sql`UPDATE psd_layers SET font_color = ${(u.fontColor as string) ?? null} WHERE id = ${layerId}`;
  }
  if ("fontWeight" in u) {
    await sql`UPDATE psd_layers SET font_weight = ${(u.fontWeight as string) ?? null} WHERE id = ${layerId}`;
  }
  if ("textAlign" in u) {
    await sql`UPDATE psd_layers SET text_align = ${(u.textAlign as string) ?? null} WHERE id = ${layerId}`;
  }
  if ("lineHeight" in u) {
    await sql`UPDATE psd_layers SET line_height = ${(u.lineHeight as number) ?? null} WHERE id = ${layerId}`;
  }
  if ("x" in u) {
    await sql`UPDATE psd_layers SET x = ${u.x as number} WHERE id = ${layerId}`;
  }
  if ("y" in u) {
    await sql`UPDATE psd_layers SET y = ${u.y as number} WHERE id = ${layerId}`;
  }
  if ("width" in u) {
    await sql`UPDATE psd_layers SET width = ${u.width as number} WHERE id = ${layerId}`;
  }
  if ("height" in u) {
    await sql`UPDATE psd_layers SET height = ${u.height as number} WHERE id = ${layerId}`;
  }
}
