import { NextRequest } from "next/server";
import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import * as fontkit from "fontkit";
import type { Font } from "fontkit";
import { getDb } from "@/lib/db";
import { getPsdLayers } from "@/lib/templates-db";
import { localRead } from "@/lib/local-storage";
import { FONT_FAMILIES } from "@/lib/fonts";
import path from "path";
import fs from "fs";

interface LayerEdit {
  textContent?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  fontWeight?: string;
  imageUrl?: string;
  x?: number;
  y?: number;
  /** 用户通过"删除模块"等操作在前端标记为隐藏；true=强制显示（暂无路径），false=强制隐藏 */
  visible?: boolean;
}

interface ScannedFont {
  file: string;
  postscriptName: string;
  familyName: string;
}

/** 递归扫描目录下所有 .ttf / .otf，读 PostScript / family name */
function scanFontDir(dir: string): ScannedFont[] {
  if (!fs.existsSync(dir)) return [];
  const results: ScannedFont[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...scanFontDir(full));
      continue;
    }
    const ext = path.extname(entry).toLowerCase();
    if (ext !== ".ttf" && ext !== ".otf") continue;
    try {
      const parsed = fontkit.openSync(full);
      // TTC 字体集合返回 { fonts: [...] }；单字体直接返回 Font
      const faces: Font[] =
        "fonts" in parsed && Array.isArray(parsed.fonts) ? parsed.fonts : [parsed as Font];
      for (const f of faces) {
        if (!f.postscriptName) continue;
        results.push({
          file: full,
          postscriptName: f.postscriptName,
          familyName: f.familyName ?? f.postscriptName,
        });
      }
    } catch (err) {
      console.warn(
        `[fonts] scan failed for ${entry}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return results;
}

function registerLocalFonts() {
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const scanned = scanFontDir(fontsDir);
  const registered: ScannedFont[] = [];

  for (const font of scanned) {
    try {
      // 用 PostScript name 注册：PSD 解析出的字体原值本身就是 PostScript name，
      // 这样 ctx.font 里写 "FZLTDHJW--GB1-0" 能直接命中对应文件，无需再做别名归一化
      GlobalFonts.registerFromPath(font.file, font.postscriptName);
      registered.push(font);
    } catch (err) {
      console.warn(
        `[fonts] register failed for ${font.postscriptName}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`[fonts] registered ${registered.length} fonts:`);
  for (const r of registered) {
    console.log(
      `  ${r.postscriptName}  (family: ${r.familyName}, file: ${path.basename(r.file)})`,
    );
  }
}

/** 前端自定义 family 名 + weight → 对应文件的 PostScript 名。
 * 前端 UI 里用户选「美团体 加粗」传过来的是 (family="MeiTuan", fontWeight="700")，
 * 需要映射到实际已 register 的 PostScript 名才能让 @napi-rs/canvas 命中字重文件。 */
const FAMILY_WEIGHT_TO_PS = new Map<string, string>();

function buildFamilyWeightMap() {
  FAMILY_WEIGHT_TO_PS.clear();
  for (const f of FONT_FAMILIES) {
    for (const v of f.variants) {
      const abs = path.join(process.cwd(), "public", v.url);
      if (!fs.existsSync(abs)) {
        console.warn(`[fonts] missing file for ${f.family}/${v.weight}: ${abs}`);
        continue;
      }
      try {
        const parsed = fontkit.openSync(abs);
        const face: Font =
          "fonts" in parsed && Array.isArray(parsed.fonts) ? parsed.fonts[0] : (parsed as Font);
        if (face.postscriptName) {
          FAMILY_WEIGHT_TO_PS.set(`${f.family}|${v.weight}`, face.postscriptName);
        }
      } catch (err) {
        console.warn(
          `[fonts] resolve PS name failed for ${f.family}/${v.weight}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  console.log(`[fonts] family+weight map (${FAMILY_WEIGHT_TO_PS.size} entries):`);
  for (const [k, v] of FAMILY_WEIGHT_TO_PS) console.log(`  ${k}  →  ${v}`);
}

let fontsRegistered = false;

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  // 形态 1：同源代理 URL /api/blob/media?pathname=xxx → 直接读本地文件
  const parsed = new URL(imageUrl, "http://localhost");
  const pathname = parsed.searchParams.get("pathname");
  if (pathname) {
    const buf = localRead(pathname);
    if (!buf) throw new Error(`Local blob not found: ${pathname}`);
    return buf;
  }

  // 形态 2：/api/fonts/... 及其他内部路由也转本地 FS
  if (parsed.pathname.startsWith("/api/fonts/")) {
    const rel = parsed.pathname.replace(/^\/api\/fonts\//, "");
    const buf = localRead(`fonts/${rel}`);
    if (!buf) throw new Error(`Local font not found: ${rel}`);
    return buf;
  }

  // 形态 3：绝对 http(s) URL（兼容外链图片）
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    const res = await fetch(imageUrl);
    return Buffer.from(await res.arrayBuffer());
  }

  // 形态 4：/xxx.png 形式的 public/ 静态资源
  if (imageUrl.startsWith("/")) {
    const fp = path.join(process.cwd(), "public", imageUrl);
    if (fs.existsSync(fp)) return fs.readFileSync(fp);
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
  const italic = fontStyle === "italic" ? "italic " : "";

  // 优先按 (family, weight) 查 FONT_FAMILIES 对应的 PostScript 名；
  // 查不到说明 fontFamily 本身已经是 PSD 原始 PS 名（旧路径），原样使用。
  const psName =
    FAMILY_WEIGHT_TO_PS.get(`${fontFamily}|${fontWeight}`) ??
    FAMILY_WEIGHT_TO_PS.get(`${fontFamily}|400`) ??
    fontFamily;

  // PS 名已经是字重特定的字形，ctx.font 强制 weight=normal 避免再次错配
  const fontStr = `${italic}normal ${fontSize}px "${psName}", "FZLTHJW--GB1-0", "MEITUANTYPE-REGULAR", sans-serif`;

  const lines = text.split(/\r?\n/);
  const lineH = fontSize * 1.3;

  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = fontStr;
  let maxW = 0;
  for (const line of lines) {
    const w = measureCtx.measureText(line).width;
    if (w > maxW) maxW = w;
  }

  // 顶部留 fontSize*0.2 的余量，防止中文字体 ascender 略超 "top" baseline 时被裁切；
  // 底部已有 lineH 1.3 倍行距自然富余，不再额外加。
  const topPad = Math.ceil(fontSize * 0.2);
  const canvasW = Math.max(width, Math.ceil(maxW) + 4);
  const canvasH = Math.max(height, Math.ceil(lines.length * lineH) + topPad);

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = fontColor;
  ctx.font = fontStr;
  ctx.textBaseline = "top";

  let y = topPad;
  for (const line of lines) {
    ctx.fillText(line, 0, y);
    y += lineH;
  }

  return Buffer.from(canvas.toBuffer("image/png"));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, edits, canvasWidth, canvasHeight } = body as {
      templateId: string;
      edits: Record<string, LayerEdit>;
      canvasWidth?: number;
      canvasHeight?: number;
    };

    if (!templateId) {
      return Response.json({ error: "Missing templateId" }, { status: 400 });
    }

    if (!fontsRegistered) {
      registerLocalFonts();
      buildFamilyWeightMap();
      fontsRegistered = true;
    }

    const sql = getDb();
    const rows = await sql`SELECT * FROM templates WHERE id = ${templateId}`;
    if (rows.length === 0) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }
    const tpl = rows[0];
    // slot 尺寸优先：前端导出时按当前 slot 的 width/height 渲染；未传则落回 template 尺寸
    const cw = canvasWidth ?? ((tpl.canvas_width ?? tpl.width) as number);
    const ch = canvasHeight ?? ((tpl.canvas_height ?? tpl.height) as number);

    const allLayers = await getPsdLayers(templateId);

    // 先收集被 editState 标记为 visible=false 的所有图层 id（主要是 group），
    // 用于下面对子层做级联隐藏
    const hiddenIds = new Set<string>();
    for (const [id, edit] of Object.entries(edits ?? {})) {
      if (edit?.visible === false) hiddenIds.add(id);
    }

    const sorted = allLayers
      .filter((l) => {
        // DB 原值不可见 → 跳过
        if (l.visible !== true && String(l.visible) !== "true") return false;
        // editState 标记该图层 visible=false → 跳过
        if (hiddenIds.has(l.id)) return false;
        // 父 Group 被 editState 标记隐藏 → 子层级联跳过
        if (l.parentId && hiddenIds.has(l.parentId)) return false;
        return true;
      })
      .sort((a, b) => a.zIndex - b.zIndex);

    const compositeInputs: sharp.OverlayOptions[] = [];

    for (const layer of sorted) {
      const edit = edits?.[layer.id];
      const isTextEdited = edit && (
        edit.textContent !== undefined ||
        edit.fontSize !== undefined ||
        edit.fontColor !== undefined ||
        edit.fontFamily !== undefined ||
        edit.fontWeight !== undefined
      );

      let inputBuffer: Buffer | null = null;

      if (layer.layerType === "text" && isTextEdited) {
        const text = edit.textContent ?? layer.textContent ?? "";
        const fontSize = edit.fontSize ?? layer.fontSize ?? 24;
        const fontColor = edit.fontColor ?? layer.fontColor ?? "#000000";
        const fontFamily = edit.fontFamily ?? layer.fontFamily ?? "sans-serif";
        const fontWeight = edit?.fontWeight ?? layer.fontWeight ?? "normal";
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
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(tpl.name ?? "template"))}.png`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export/psd]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
