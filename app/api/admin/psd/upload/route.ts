import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { parsePsdBuffer } from "@/lib/psd-parser";
import { localPut } from "@/lib/local-storage";

const MAX_SIZE = 200 * 1024 * 1024; // 200 MB

function generatePsdId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `psd_${now}_${rand}`;
}

function generateLayerId(index: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `layer_${index}_${rand}`;
}

async function uploadToBlob(
  pathname: string,
  data: Buffer | File,
): Promise<{ url: string; pathname: string }> {
  return localPut(pathname, data);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".psd")) {
      return Response.json({ error: "Only .psd files are accepted" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max 200MB.` },
        { status: 400 },
      );
    }

    const templateId = generatePsdId();
    const buffer = await file.arrayBuffer();

    const psdBlob = await uploadToBlob(
      `psd-originals/${templateId}/${file.name}`,
      new File([buffer], file.name, { type: "application/octet-stream" }),
    );

    const parseResult = await parsePsdBuffer(buffer);

    const layerRecords: Array<{
      id: string;
      name: string;
      layerType: string;
      zIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      visible: boolean;
      opacity: number;
      rotation: number;
      imageUrl: string | null;
      textContent: string | null;
      fontFamily: string | null;
      fontSize: number | null;
      fontColor: string | null;
      fontWeight: string | null;
      fontStyle: string | null;
      textAlign: string | null;
      lineHeight: number | null;
      parentId: string | null;
    }> = [];

    // 先给每个 ParsedLayer 分配一个稳定 id，便于后面 parentIndex → parent_id 回填
    const layerIds: string[] = parseResult.layers.map((_, i) => generateLayerId(i));

    for (let i = 0; i < parseResult.layers.length; i++) {
      const layer = parseResult.layers[i];
      const layerId = layerIds[i];
      let imageUrl: string | null = null;

      // Group 本身不产生位图；text/image 走原逻辑
      if (layer.type !== "group" && layer.imageBuffer) {
        const ext = "png";
        const uploadResult = await uploadToBlob(
          `psd-layers/${templateId}/${layerId}.${ext}`,
          Buffer.from(layer.imageBuffer),
        );
        imageUrl = uploadResult.url;
      }

      const parentId =
        typeof layer.parentIndex === "number" ? layerIds[layer.parentIndex] ?? null : null;

      layerRecords.push({
        id: layerId,
        name: layer.name,
        layerType: layer.type,
        zIndex: layer.zIndex,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        visible: layer.visible,
        opacity: layer.opacity,
        rotation: layer.rotation,
        imageUrl,
        textContent: layer.text?.content ?? null,
        fontFamily: layer.text?.fontFamily ?? null,
        fontSize: layer.text?.fontSize ?? null,
        fontColor: layer.text?.color ?? null,
        fontWeight: layer.text?.fontWeight ?? null,
        fontStyle: layer.text?.fontStyle ?? null,
        textAlign: layer.text?.textAlign ?? null,
        lineHeight: layer.text?.lineHeight ?? null,
        parentId,
      });
    }

    let thumbnailUrl = "";
    if (parseResult.compositeImage) {
      const thumbResult = await uploadToBlob(
        `thumbnails/${templateId}-composite.png`,
        Buffer.from(parseResult.compositeImage),
      );
      thumbnailUrl = thumbResult.url;
    }

    const sql = getDb();

    await sql`
      INSERT INTO templates (
        id, name, category, thumbnail, width, height, html_file,
        editable_fields, sort_order, template_type, psd_file, canvas_width, canvas_height
      ) VALUES (
        ${templateId},
        ${file.name.replace(/\.psd$/i, "")},
        ${"站内资源位"},
        ${thumbnailUrl},
        ${parseResult.width},
        ${parseResult.height},
        ${""},
        ${JSON.stringify({ texts: [], colors: [], images: [] })},
        ${0},
        ${"psd"},
        ${psdBlob.url},
        ${parseResult.width},
        ${parseResult.height}
      )
    `;

    // 父 Group 必须先落库，子图层后落库；parseResult.layers 已按 [group, ...children, group, ...] 顺序
    // 从 parser 产出，这里直接按数组顺序逐条 INSERT 即可保证 FK 约束满足。
    for (const lr of layerRecords) {
      await sql`
        INSERT INTO psd_layers (
          id, template_id, name, layer_type, z_index,
          x, y, width, height, visible, opacity, rotation,
          image_url, text_content, font_family, font_size,
          font_color, font_weight, font_style, text_align, line_height,
          sort_order, parent_id
        ) VALUES (
          ${lr.id}, ${templateId}, ${lr.name}, ${lr.layerType}, ${lr.zIndex},
          ${lr.x}, ${lr.y}, ${lr.width}, ${lr.height}, ${lr.visible}, ${lr.opacity}, ${lr.rotation},
          ${lr.imageUrl}, ${lr.textContent}, ${lr.fontFamily}, ${lr.fontSize},
          ${lr.fontColor}, ${lr.fontWeight}, ${lr.fontStyle}, ${lr.textAlign}, ${lr.lineHeight},
          ${lr.zIndex}, ${lr.parentId}
        )
      `;
    }

    return Response.json({
      ok: true,
      template: {
        id: templateId,
        name: file.name.replace(/\.psd$/i, ""),
        width: parseResult.width,
        height: parseResult.height,
        psdFile: psdBlob.url,
        thumbnail: thumbnailUrl,
        layerCount: layerRecords.length,
      },
      layers: layerRecords.map((lr) => ({
        id: lr.id,
        name: lr.name,
        layerType: lr.layerType,
        x: lr.x,
        y: lr.y,
        width: lr.width,
        height: lr.height,
        visible: lr.visible,
        imageUrl: lr.imageUrl,
        textContent: lr.textContent,
        fontFamily: lr.fontFamily,
        fontSize: lr.fontSize,
        fontColor: lr.fontColor,
        parentId: lr.parentId,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[psd/upload]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
