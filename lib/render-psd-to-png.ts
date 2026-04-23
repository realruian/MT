import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import * as fontkit from "fontkit";
import type { Font } from "fontkit";
import path from "path";
import fs from "fs";
import { FONT_FAMILIES } from "./fonts";
import { localRead } from "./local-storage";
import type { PsdLayer } from "@/types/template";

/**
 * PSD 导出渲染核心（纯计算，不做 DB / HTTP 处理）。
 * 从 `/api/export/psd` 抽出，给"会场导出"和"会场组件缩略图自动生成"两处
 * 共享同一套字体注册 + sharp composite 流水线。
 *
 * 设计原则：
 * - 入参只接受已解析的 layers 数组 + 尺寸 + 可选 edits overlay + 可选 bgColor
 * - 字体注册/映射懒初始化；同进程内只做一次，幂等
 * - 输出 PNG Buffer；调用方负责存盘或直接回 Response
 */

export interface LayerEditOverlay {
  textContent?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  fontWeight?: string;
  imageUrl?: string;
  x?: number;
  y?: number;
  visible?: boolean;
}

export interface RenderPsdOptions {
  layers: PsdLayer[];
  edits?: Record<string, LayerEditOverlay>;
  canvasWidth: number;
  canvasHeight: number;
  /** hex（含 #）；非法或未传回退到白 */
  bgColor?: string;
}

// --- 字体注册（一次性，进程内幂等） --------------------------------------

interface ScannedFont {
  file: string;
  postscriptName: string;
  familyName: string;
}

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
      const faces: Font[] =
        "fonts" in parsed && Array.isArray(parsed.fonts)
          ? parsed.fonts
          : [parsed as Font];
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

/** 前端 family+weight → 实际 PS 名；buildFamilyWeightMap 后用 */
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
          "fonts" in parsed && Array.isArray(parsed.fonts)
            ? parsed.fonts[0]
            : (parsed as Font);
        if (face.postscriptName) {
          FAMILY_WEIGHT_TO_PS.set(
            `${f.family}|${v.weight}`,
            face.postscriptName,
          );
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
export function ensureFontsRegistered() {
  if (fontsRegistered) return;
  registerLocalFonts();
  buildFamilyWeightMap();
  fontsRegistered = true;
}

// --- 图片 / 文字渲染 helper ----------------------------------------------

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const parsed = new URL(imageUrl, "http://localhost");
  const pathname = parsed.searchParams.get("pathname");
  if (pathname) {
    const buf = localRead(pathname);
    if (!buf) throw new Error(`Local blob not found: ${pathname}`);
    return buf;
  }
  if (parsed.pathname.startsWith("/api/fonts/")) {
    const rel = parsed.pathname.replace(/^\/api\/fonts\//, "");
    const buf = localRead(`fonts/${rel}`);
    if (!buf) throw new Error(`Local font not found: ${rel}`);
    return buf;
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    const res = await fetch(imageUrl);
    return Buffer.from(await res.arrayBuffer());
  }
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
  textAlign?: string,
): Buffer {
  const italic = fontStyle === "italic" ? "italic " : "";
  const psName =
    FAMILY_WEIGHT_TO_PS.get(`${fontFamily}|${fontWeight}`) ??
    FAMILY_WEIGHT_TO_PS.get(`${fontFamily}|400`) ??
    fontFamily;
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

  const topPad = Math.ceil(fontSize * 0.2);
  const canvasW = Math.max(width, Math.ceil(maxW) + 4);
  const canvasH = Math.max(height, Math.ceil(lines.length * lineH) + topPad);

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = fontColor;
  ctx.font = fontStr;
  ctx.textBaseline = "top";

  let anchorX = 0;
  if (textAlign === "center") {
    ctx.textAlign = "center";
    anchorX = canvasW / 2;
  } else if (textAlign === "right") {
    ctx.textAlign = "right";
    anchorX = canvasW;
  }

  let y = topPad;
  for (const line of lines) {
    ctx.fillText(line, anchorX, y);
    y += lineH;
  }

  return Buffer.from(canvas.toBuffer("image/png"));
}

function parseHexToRgb(
  hex: string | undefined,
): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// --- 主入口 ---------------------------------------------------------------

/**
 * 把一套 PSD layers 合成为 PNG。
 * - `options.edits` 是 editState overlay：按 layer id 映射 Partial override
 * - 字体注册幂等；首次调用会打印注册日志
 * - 超出画布的图层会做 extract 裁切；text layer 若无 imageUrl 但有 textContent
 *   走服务端字体渲染；text layer 已被 edits 改动走同一分支
 */
export async function renderPsdToPng(options: RenderPsdOptions): Promise<Buffer> {
  ensureFontsRegistered();

  const { layers, edits = {}, canvasWidth: cw, canvasHeight: ch, bgColor } = options;

  // group 隐藏 → 子层级联隐藏
  const hiddenIds = new Set<string>();
  for (const [id, edit] of Object.entries(edits)) {
    if (edit?.visible === false) hiddenIds.add(id);
  }

  const sorted = layers
    .filter((l) => {
      if (l.visible !== true && String(l.visible) !== "true") return false;
      if (hiddenIds.has(l.id)) return false;
      if (l.parentId && hiddenIds.has(l.parentId)) return false;
      return true;
    })
    .sort((a, b) => a.zIndex - b.zIndex);

  const compositeInputs: sharp.OverlayOptions[] = [];

  for (const layer of sorted) {
    const edit = edits[layer.id];
    const isTextEdited =
      edit &&
      (edit.textContent !== undefined ||
        edit.fontSize !== undefined ||
        edit.fontColor !== undefined ||
        edit.fontFamily !== undefined ||
        edit.fontWeight !== undefined);

    let inputBuffer: Buffer | null = null;

    const hasImageUrl = !!(edit?.imageUrl ?? layer.imageUrl);
    const textNoImage =
      layer.layerType === "text" &&
      !hasImageUrl &&
      !!(edit?.textContent ?? layer.textContent);

    if (layer.layerType === "text" && (isTextEdited || textNoImage)) {
      const text = edit?.textContent ?? layer.textContent ?? "";
      const fontSize = edit?.fontSize ?? layer.fontSize ?? 24;
      const fontColor = edit?.fontColor ?? layer.fontColor ?? "#000000";
      const fontFamily = edit?.fontFamily ?? layer.fontFamily ?? "sans-serif";
      const fontWeight = edit?.fontWeight ?? layer.fontWeight ?? "normal";
      const fontStyleVal = layer.fontStyle ?? "normal";
      const textAlignVal = layer.textAlign;

      let textPng = renderTextToPng(
        text,
        fontSize,
        fontColor,
        fontFamily,
        fontWeight,
        fontStyleVal,
        layer.width,
        layer.height,
        textAlignVal,
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
        buf = await sharp(buf)
          .extract({ left: cropLeft, top: 0, width: imgW - cropLeft, height: imgH })
          .png()
          .toBuffer();
        imgW -= cropLeft;
        left = 0;
      }
      if (top < 0) {
        const cropTop = Math.abs(top);
        if (cropTop >= imgH) continue;
        buf = await sharp(buf)
          .extract({ left: 0, top: cropTop, width: imgW, height: imgH - cropTop })
          .png()
          .toBuffer();
        imgH -= cropTop;
        top = 0;
      }
      if (left + imgW > cw) {
        const newW = cw - left;
        if (newW <= 0) continue;
        buf = await sharp(buf)
          .extract({ left: 0, top: 0, width: newW, height: imgH })
          .png()
          .toBuffer();
        imgW = newW;
      }
      if (top + imgH > ch) {
        const newH = ch - top;
        if (newH <= 0) continue;
        buf = await sharp(buf)
          .extract({ left: 0, top: 0, width: imgW, height: newH })
          .png()
          .toBuffer();
      }

      compositeInputs.push({ input: buf, left, top });
    }
  }

  const bgRgb = parseHexToRgb(bgColor) ?? { r: 255, g: 255, b: 255 };
  const baseBg = Buffer.alloc(cw * ch * 4, 0);
  for (let i = 0; i < cw * ch; i++) {
    baseBg[i * 4] = bgRgb.r;
    baseBg[i * 4 + 1] = bgRgb.g;
    baseBg[i * 4 + 2] = bgRgb.b;
    baseBg[i * 4 + 3] = 255;
  }

  return sharp(baseBg, { raw: { width: cw, height: ch, channels: 4 } })
    .composite(compositeInputs)
    .png()
    .toBuffer();
}
