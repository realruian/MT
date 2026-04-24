import path from "path";
import fs from "fs";
import sharp from "sharp";
import { localPut, LOCAL_BLOB_ROOT } from "./local-storage";
import { parsePsdBuffer } from "./psd-parser";
import { renderPsdToPng } from "./render-psd-to-png";
import type { PsdLayer } from "@/types/template";

/**
 * 会场组件标准宽度（与编辑器 VENUE_CONTENT_WIDTH 对齐）
 * upload / PATCH 重传 PSD 时都走这个校验。
 */
export const VENUE_COMPONENT_WIDTH = 702;

/** PSD 文件大小上限 */
export const MAX_PSD_SIZE = 50 * 1024 * 1024;
/** 用户自上传缩略图大小上限 */
export const MAX_THUMB_SIZE = 1 * 1024 * 1024;
/** 自动生成缩略图的目标宽度 */
export const AUTO_THUMB_WIDTH = 200;

export interface BuiltPsdResult {
  /** 应用层 PsdLayer 记录（x/y 已归零，含 raster URL） */
  layers: PsdLayer[];
  /** 组件高度（取 max(y+height)） */
  height: number;
  /** PSD 原文件的 blob pathname（相对 LOCAL_BLOB_ROOT） */
  sourcePsdPathname: string;
  /** PSD 原文件的代理 URL */
  sourcePsdUrl: string;
}

function generateLayerId(index: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `layer_${index}_${rand}`;
}

/**
 * 将上传的 PSD buffer 处理成「可入库的会场组件 payload」：
 * - 校验宽度（必须为 VENUE_COMPONENT_WIDTH）
 * - 所有 layer x/y 减去最小值做坐标归零
 * - text 字段、parentId 全部回填
 * - 图层 raster 存到 data/blob/venue-components/<componentId>/<layerId>.png
 * - PSD 原文件存到 data/blob/venue-components/<componentId><ext>
 * 调用方（upload / PATCH）把返回值写到 DB。
 */
export async function buildVenueComponentFromPsd(params: {
  componentId: string;
  psdBuffer: ArrayBuffer;
  psdFileName: string;
}): Promise<BuiltPsdResult> {
  const { componentId, psdBuffer, psdFileName } = params;

  const psdExt = path.extname(psdFileName) || ".psd";
  const psdBlob = await localPut(
    `venue-components/${componentId}${psdExt}`,
    new File([psdBuffer], psdFileName, {
      type: "application/octet-stream",
    }),
  );

  const parsed = await parsePsdBuffer(psdBuffer);
  if (parsed.width !== VENUE_COMPONENT_WIDTH) {
    throw new PsdWidthMismatchError(parsed.width);
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const l of parsed.layers) {
    if (l.x < minX) minX = l.x;
    if (l.y < minY) minY = l.y;
  }
  if (!isFinite(minX)) minX = 0;
  if (!isFinite(minY)) minY = 0;

  const layerIds: string[] = parsed.layers.map((_, i) => generateLayerId(i));
  const psdLayers: PsdLayer[] = [];
  for (let i = 0; i < parsed.layers.length; i++) {
    const l = parsed.layers[i];
    const layerId = layerIds[i];

    let imageUrl: string | undefined;
    if (l.type !== "group" && l.imageBuffer) {
      const up = await localPut(
        `venue-components/${componentId}/${layerId}.png`,
        Buffer.from(l.imageBuffer),
      );
      imageUrl = up.url;
    }

    const parentId =
      typeof l.parentIndex === "number"
        ? (layerIds[l.parentIndex] ?? null)
        : null;

    psdLayers.push({
      id: layerId,
      templateId: componentId,
      name: l.name,
      layerType: l.type,
      zIndex: l.zIndex,
      x: l.x - minX,
      y: l.y - minY,
      width: l.width,
      height: l.height,
      visible: l.visible,
      opacity: l.opacity,
      rotation: l.rotation,
      imageUrl,
      textContent: l.text?.content,
      fontFamily: l.text?.fontFamily,
      fontSize: l.text?.fontSize,
      fontColor: l.text?.color,
      fontWeight: l.text?.fontWeight,
      fontStyle: l.text?.fontStyle,
      textAlign: l.text?.textAlign,
      lineHeight: l.text?.lineHeight,
      locked: false,
      parentId,
    });
  }

  const { layers: finalLayers, height: computedHeight } = ensureRootGroup(
    psdLayers,
    componentId,
  );
  const height = computedHeight === 0 ? parsed.height : computedHeight;

  return {
    layers: finalLayers,
    height,
    sourcePsdPathname: psdBlob.pathname,
    sourcePsdUrl: psdBlob.url,
  };
}

/**
 * 规范化 venue 组件 layers：保证存在「顶层根 group」。
 *
 * 为什么需要：运营的 PSD 经常没有把组件包进一个 Group 图层，parsePsdBuffer
 * 解析出的就是一堆扁平 leaf（所有 parentId 都是 null）。编辑器端所有"模块级"
 * 交互（选中模块 → 拖拽换位、删除模块、属性面板显示组件总尺寸）都依赖
 * `parentId` 链收敛到唯一一个根 group，缺根 group 会触发一连串 footgun：
 * - insertComponentIntoLayers 的 `rootOrigId = find(parentId == null)` 取到
 *   第一个 leaf（常是背景图），editor-shell 判 `rootType !== "group"` 走
 *   叶子选中分支，用户只选中了背景图
 * - canvas-stage 的 leaf click 里 `parentId` 为 null → handleLeafClick 未绑定，
 *   点击不响应
 * - venue-instance 拖拽模式的 `group.instanceId` 条件永远假，拖拽换位入口失效
 *
 * 约定：
 * - 检测：已有任何"顶层 group"（`layerType === "group"` && `parentId == null`）
 *   则跳过（mock 组件、运营规范上传的 PSD 都免受影响）
 * - 合成：insert 一个虚拟根 group，把所有原顶层 leaf 的 parentId 指向它
 *   - id 用 `root_<nonce>`，前缀固定便于 grep / 日志识别
 *   - zIndex 设 -1：低于所有原 leaf，保持 leaf 的相对绘制顺序（group 本身
 *     不渲染，z 值只影响 sort 稳定性）
 *   - **width 强制固定 702**（不从子 layer union 算）：子 layer 边缘常留白，
 *     union bbox 可能 < 702，会在组件右边缘造成 hit testing 死角。固定
 *     702 保证整个视觉区间都能命中
 *   - height 用所有子 leaf 的 `max(y + height)`（= computedHeight）
 *   - x/y 固定 0（坐标已在上层归零）
 *
 * 返回值里的 height 同时也是"组件内容总高度"，调用方可直接写库。
 */
function ensureRootGroup(
  layers: PsdLayer[],
  templateId: string,
): { layers: PsdLayer[]; height: number } {
  let height = 0;
  for (const l of layers) {
    if (l.layerType === "group") continue;
    const b = l.y + l.height;
    if (b > height) height = b;
  }

  const hasRootGroup = layers.some(
    (l) => l.layerType === "group" && l.parentId == null,
  );
  if (hasRootGroup) return { layers, height };

  const rootId = `root_${Math.random().toString(36).slice(2, 8)}`;
  const rootGroup: PsdLayer = {
    id: rootId,
    templateId,
    name: "组件根",
    layerType: "group",
    zIndex: -1,
    x: 0,
    y: 0,
    width: VENUE_COMPONENT_WIDTH,
    height,
    visible: true,
    opacity: 1,
    rotation: 0,
    locked: false,
    parentId: null,
  };

  const rewired = layers.map((l) =>
    l.parentId == null && l.layerType !== "group"
      ? { ...l, parentId: rootId }
      : l,
  );

  return { layers: [rootGroup, ...rewired], height };
}

export class PsdWidthMismatchError extends Error {
  constructor(public actualWidth: number) {
    super(
      `会场组件宽度必须为 ${VENUE_COMPONENT_WIDTH}px，当前 PSD 宽度为 ${actualWidth}px，请调整后重新上传`,
    );
    this.name = "PsdWidthMismatchError";
  }
}

/**
 * 基于已构建的 layers 生成「自动缩略图」—— 先按原尺寸合成全图，再 sharp 缩到
 * AUTO_THUMB_WIDTH。会把结果写到 `venue-components/<id>-thumb.png` 固定路径。
 */
export async function generateAutoThumbnail(params: {
  componentId: string;
  layers: PsdLayer[];
  height: number;
}): Promise<{ url: string; pathname: string }> {
  const { componentId, layers, height } = params;
  const fullPng = await renderPsdToPng({
    layers,
    canvasWidth: VENUE_COMPONENT_WIDTH,
    canvasHeight: height,
  });
  const resized = await sharp(fullPng)
    .resize({ width: AUTO_THUMB_WIDTH })
    .png()
    .toBuffer();
  return localPut(`venue-components/${componentId}-thumb.png`, resized);
}

/**
 * 存用户自上传的缩略图。保留原 ext（前端已做 image/* 校验）。
 */
export async function storeUserThumbnail(params: {
  componentId: string;
  file: File;
}): Promise<{ url: string; pathname: string }> {
  const { componentId, file } = params;
  const ext = path.extname(file.name).toLowerCase() || ".png";
  const buffer = await file.arrayBuffer();
  return localPut(
    `venue-components/${componentId}-thumb${ext}`,
    new File([buffer], file.name, { type: file.type || "image/png" }),
  );
}

/**
 * 删除组件名下「PSD 源文件 + 所有 layer raster 子目录」。
 * 用于 PATCH 重传 PSD 前清理旧资源，避免 blob 目录越堆越多。
 * 缩略图单独由 {@link removeBlobIfManaged} 管理（可能由用户手动保留）。
 */
export function cleanupPsdFiles(componentId: string, sourcePsdUrl: string | null) {
  if (sourcePsdUrl) {
    const pathname = extractBlobPathname(sourcePsdUrl);
    if (pathname) removeBlobIfExists(pathname);
  }
  const layerDir = path.join(LOCAL_BLOB_ROOT, "venue-components", componentId);
  if (fs.existsSync(layerDir)) {
    try {
      fs.rmSync(layerDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(
        `[venue-component-psd] rm layer dir failed ${layerDir}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * 清理 layer 目录下「本次 build 没再写入」的残留 PNG。
 * build 会按 layerIds 落盘到 venue-components/<id>/<layerId>.png；新旧 layerId
 * 是随机后缀不会重叠，所以此处遍历目录、跳过本次 build 产物就是旧残留。
 * 不删除子目录本身（外层 delete 会整目录 rmSync）。
 */
export function cleanupStaleLayerFiles(
  componentId: string,
  keepFilenames: Set<string>,
) {
  const dir = path.join(LOCAL_BLOB_ROOT, "venue-components", componentId);
  if (!fs.existsSync(dir)) return;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (keepFilenames.has(entry)) continue;
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) fs.unlinkSync(full);
      } catch (err) {
        console.warn(
          `[venue-component-psd] stale layer unlink failed ${entry}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    console.warn(
      `[venue-component-psd] readdir layer dir failed ${dir}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * 只删一个由 /api/blob/media?pathname= 编码的文件；其它形态 URL（例如外链）
 * 一律忽略。调用方用于清理旧缩略图。
 */
export function removeBlobIfManaged(url: string | null | undefined) {
  if (!url) return;
  const pathname = extractBlobPathname(url);
  if (pathname) removeBlobIfExists(pathname);
}

function extractBlobPathname(url: string): string | null {
  if (!url.startsWith("/api/blob/media")) return null;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("pathname");
  } catch {
    return null;
  }
}

function removeBlobIfExists(pathname: string) {
  const full = path.join(LOCAL_BLOB_ROOT, pathname);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (err) {
    console.warn(
      `[venue-component-psd] unlink failed ${pathname}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** 计数字符长度（中文算 1） */
export function nameCharLength(s: string): number {
  return Array.from(s).length;
}
