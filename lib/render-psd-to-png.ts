import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";
import { getFontScan } from "./font-scan";
import { familyToAggregationKey, normalizeWeight } from "./font-aggregation";
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
//
// 注册全量 public/fonts/ 下的所有 face 到 GlobalFonts，并构建
// FAMILY_WEIGHT_TO_PS 映射。数据来源是 lib/font-scan.ts 的缓存扫描结果，
// 所以这里不再重复 fontkit 扫描。
//
// 映射 key 的选择：用 `familyToAggregationKey(face.family) | normalizeWeight(...)`
// 作为 key —— 前端下拉选中的 family 也是同一套聚合 key，两端自然对齐。
// 非 EXPOSED 白名单的家族也入表，所以 resolver 对任意已扫描字体都能命中。

const FAMILY_WEIGHT_TO_PS = new Map<string, string>();

let fontsRegistered = false;
let fontsRegisteringPending: Promise<void> | null = null;

export async function ensureFontsRegistered(): Promise<void> {
  if (fontsRegistered) return;
  if (fontsRegisteringPending) return fontsRegisteringPending;
  fontsRegisteringPending = (async () => {
    const scan = await getFontScan();

    let registeredCount = 0;
    for (const face of scan.faces) {
      try {
        GlobalFonts.registerFromPath(face.filePath, face.postscriptName);
        registeredCount++;
      } catch (err) {
        console.warn(
          `[fonts] register failed for ${face.postscriptName}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    FAMILY_WEIGHT_TO_PS.clear();
    for (const face of scan.faces) {
      if (!face.family) continue;
      const aggKey = familyToAggregationKey(face.family);
      const weight = normalizeWeight(
        face.family,
        face.subfamily,
        face.usWeightClass,
        face.postscriptName,
      );
      const key = `${aggKey}|${weight}`;
      if (FAMILY_WEIGHT_TO_PS.has(key)) continue; // 保留首个
      FAMILY_WEIGHT_TO_PS.set(key, face.postscriptName);
    }

    console.log(
      `[fonts] registered ${registeredCount}/${scan.faceCount} faces; FAMILY_WEIGHT_TO_PS built with ${FAMILY_WEIGHT_TO_PS.size} entries`,
    );
    fontsRegistered = true;
    fontsRegisteringPending = null;
  })();
  return fontsRegisteringPending;
}

/**
 * 供 POST /api/admin/fonts/rescan 用：下次 ensureFontsRegistered 会重新扫描 +
 * 重注册 + 重构 map。不真的从 GlobalFonts 卸载（@napi-rs/canvas 没暴露
 * unregister，重复注册同 PS 名无害），只重置内部状态让下次进入重建逻辑。
 */
export function invalidateFontRegistration(): void {
  fontsRegistered = false;
  fontsRegisteringPending = null;
  FAMILY_WEIGHT_TO_PS.clear();
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
  // family 解析优先级（从高到低）：
  //   1. aggregationKey|weight —— 前端下拉选中的 family 本就是 aggKey，直接命中
  //   2. aggregationKey|400 —— 历史 PSD weight 字段脏（PR1 之前全部默认 400）
  //   3. rawFamily|weight / rawFamily|400 —— 老 psd-parser 解析出的 fontkit
  //      原 family 名兜底（如 "MiSans Thin" 不经聚合也能落到对应 face）
  //   4. rawFamily —— 当 PSD 里直接存了 PS 名时交给 canvas 自己匹配
  const aggKey = familyToAggregationKey(fontFamily);
  const psName =
    FAMILY_WEIGHT_TO_PS.get(`${aggKey}|${fontWeight}`) ??
    FAMILY_WEIGHT_TO_PS.get(`${aggKey}|400`) ??
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
  await ensureFontsRegistered();

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
