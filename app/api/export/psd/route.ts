import { NextRequest } from "next/server";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { getDb } from "@/lib/db";
import { getPsdLayers } from "@/lib/templates-db";
import type { PsdLayer } from "@/types/template";
import path from "path";
import fs from "fs";

interface LayerEdit {
  textContent?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  imageUrl?: string;
  x?: number;
  y?: number;
}

function registerLocalFonts() {
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  if (!fs.existsSync(fontsDir)) return;

  const fontFiles = [
    { file: "Meituan Type-Regular.TTF", family: "MeiTuan" },
    { file: "Meituan Type-Bold.TTF", family: "MeiTuan-Bold" },
    { file: "FZLTHJW.TTF", family: "FZLanTingHei" },
    { file: "FZLTZCHJW.TTF", family: "FZLanTingZCH" },
    { file: "MiSans-Regular.otf", family: "MiSans" },
    { file: "造字工房元黑体.ttf", family: "ZaoZiYuanHei" },
  ];

  for (const { file, family } of fontFiles) {
    const fp = path.join(fontsDir, file);
    if (fs.existsSync(fp)) {
      try { GlobalFonts.registerFromPath(fp, family); } catch { /* skip */ }
    }
  }

  const mollyDir = path.join(fontsDir, "molly");
  if (fs.existsSync(mollyDir)) {
    const mollyFonts = [
      { file: "FZShengSKSJW_Da.ttf", family: "FZShengDa" },
      { file: "FZShengSKSJW_Zhong.ttf", family: "FZShengZhong" },
    ];
    for (const { file, family } of mollyFonts) {
      const fp = path.join(mollyDir, file);
      if (fs.existsSync(fp)) {
        try { GlobalFonts.registerFromPath(fp, family); } catch { /* skip */ }
      }
    }
  }
}

let fontsRegistered = false;

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const parsed = new URL(imageUrl, "http://localhost");
  const pathname = parsed.searchParams.get("pathname");

  if (pathname) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Blob not found: ${pathname}`);
    }
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  if (imageUrl.startsWith("http")) {
    const res = await fetch(imageUrl);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error(`Cannot fetch image: ${imageUrl}`);
}

function renderTextToPng(
  text: string,
  fontSize: number,
  fontColor: string,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string,
  width: number,
  height: number,
): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = fontColor;
  const italic = fontStyle === "italic" ? "italic " : "";
  ctx.font = `${italic}${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
  ctx.textBaseline = "top";

  const lines = text.split(/\r?\n/);
  const lineH = fontSize * 1.3;
  let y = 0;
  for (const line of lines) {
    ctx.fillText(line, 0, y);
    y += lineH;
  }

  return Buffer.from(canvas.toBuffer("image/png"));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, edits } = body as {
      templateId: string;
      edits: Record<string, LayerEdit>;
    };

    if (!templateId) {
      return Response.json({ error: "Missing templateId" }, { status: 400 });
    }

    if (!fontsRegistered) {
      registerLocalFonts();
      fontsRegistered = true;
    }

    const sql = getDb();
    const rows = await sql`SELECT * FROM templates WHERE id = ${templateId}`;
    if (rows.length === 0) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }
    const tpl = rows[0];
    const cw = (tpl.canvas_width ?? tpl.width) as number;
    const ch = (tpl.canvas_height ?? tpl.height) as number;

    const allLayers = await getPsdLayers(templateId);
    const sorted = allLayers
      .filter((l) => l.visible === true || String(l.visible) === "true")
      .sort((a, b) => a.zIndex - b.zIndex);

    const compositeInputs: sharp.OverlayOptions[] = [];

    for (const layer of sorted) {
      const edit = edits?.[layer.id];
      const isTextEdited = edit && (
        edit.textContent !== undefined ||
        edit.fontSize !== undefined ||
        edit.fontColor !== undefined
      );

      let inputBuffer: Buffer | null = null;

      if (layer.layerType === "text" && isTextEdited) {
        const text = edit.textContent ?? layer.textContent ?? "";
        const fontSize = edit.fontSize ?? layer.fontSize ?? 24;
        const fontColor = edit.fontColor ?? layer.fontColor ?? "#000000";
        const fontFamily = edit.fontFamily ?? layer.fontFamily ?? "sans-serif";
        const fontWeight = layer.fontWeight ?? "normal";
        const fontStyleVal = layer.fontStyle ?? "normal";

        let textPng = renderTextToPng(
          text, fontSize, fontColor, fontFamily, fontWeight, fontStyleVal,
          layer.width, layer.height,
        );

        const rotation = layer.rotation ?? 0;
        if (Math.abs(rotation) > 0.5) {
          textPng = await sharp(textPng)
            .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        }

        inputBuffer = textPng;
      } else if (layer.imageUrl) {
        const imgUrl = edit?.imageUrl ?? layer.imageUrl;
        try {
          const raw = await fetchImageBuffer(imgUrl);
          inputBuffer = await sharp(raw)
            .resize(layer.width, layer.height, { fit: "fill" })
            .png()
            .toBuffer();
        } catch {
          continue;
        }
      }

      if (inputBuffer) {
        let left = edit?.x ?? layer.x;
        let top = edit?.y ?? layer.y;
        let buf = inputBuffer;

        const meta = await sharp(buf).metadata();
        let imgW = meta.width ?? layer.width;
        let imgH = meta.height ?? layer.height;

        if (left < 0) {
          const cropLeft = Math.abs(left);
          if (cropLeft >= imgW) continue;
          buf = await sharp(buf).extract({ left: cropLeft, top: 0, width: imgW - cropLeft, height: imgH }).png().toBuffer();
          imgW -= cropLeft;
          left = 0;
        }
        if (top < 0) {
          const cropTop = Math.abs(top);
          if (cropTop >= imgH) continue;
          buf = await sharp(buf).extract({ left: 0, top: cropTop, width: imgW, height: imgH - cropTop }).png().toBuffer();
          imgH -= cropTop;
          top = 0;
        }
        if (left + imgW > cw) {
          const newW = cw - left;
          if (newW <= 0) continue;
          buf = await sharp(buf).extract({ left: 0, top: 0, width: newW, height: imgH }).png().toBuffer();
          imgW = newW;
        }
        if (top + imgH > ch) {
          const newH = ch - top;
          if (newH <= 0) continue;
          buf = await sharp(buf).extract({ left: 0, top: 0, width: imgW, height: newH }).png().toBuffer();
        }

        compositeInputs.push({ input: buf, left, top });
      }
    }

    const whiteBg = Buffer.alloc(cw * ch * 4, 0);
    for (let i = 0; i < cw * ch; i++) {
      whiteBg[i * 4] = 255;
      whiteBg[i * 4 + 1] = 255;
      whiteBg[i * 4 + 2] = 255;
      whiteBg[i * 4 + 3] = 255;
    }

    const result = await sharp(whiteBg, { raw: { width: cw, height: ch, channels: 4 } })
      .composite(compositeInputs)
      .png()
      .toBuffer();

    return new Response(new Uint8Array(result), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(tpl.name || "template")}.png`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export/psd]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
