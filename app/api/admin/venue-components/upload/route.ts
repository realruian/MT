import { NextRequest } from "next/server";
import path from "path";
import sharp from "sharp";
import { parsePsdBuffer } from "@/lib/psd-parser";
import { localPut } from "@/lib/local-storage";
import {
  createVenueComponent,
  type CreateVenueComponentInput,
} from "@/lib/venue-components-db";
import {
  isVenueComponentGroup,
  VENUE_COMPONENT_GROUPS,
} from "@/lib/venue-component-groups";
import { renderPsdToPng } from "@/lib/render-psd-to-png";
import type { PsdLayer } from "@/types/template";

/** 会场组件标准宽度（与编辑器 VENUE_CONTENT_WIDTH 对齐） */
const VENUE_COMPONENT_WIDTH = 702;
/** PSD 文件大小上限 */
const MAX_PSD_SIZE = 5 * 1024 * 1024;
/** 用户自上传缩略图大小上限 */
const MAX_THUMB_SIZE = 1 * 1024 * 1024;
/** 自动生成缩略图的目标宽度 */
const AUTO_THUMB_WIDTH = 200;

function generateId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `venue_${now}_${rand}`;
}

function generateLayerId(index: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `layer_${index}_${rand}`;
}

function nameCharLength(s: string): number {
  // 简单按 JS 字符串长度计数；中文在 UI 计 1 字，够用
  return Array.from(s).length;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const psdFile = formData.get("psd") as File | null;
    const name = (formData.get("name") as string | null)?.trim() ?? "";
    const group = (formData.get("group") as string | null)?.trim() ?? "";
    const thumbnailFile = formData.get("thumbnail") as File | null;

    // --- 基本入参校验 ----------------------------------------------------
    if (!psdFile) {
      return Response.json({ error: "请选择 PSD 文件" }, { status: 400 });
    }
    if (!psdFile.name.toLowerCase().endsWith(".psd")) {
      return Response.json(
        { error: "仅支持 .psd 文件" },
        { status: 400 },
      );
    }
    if (psdFile.size > MAX_PSD_SIZE) {
      return Response.json(
        {
          error: `PSD 文件过大（${Math.round(psdFile.size / 1024 / 1024)}MB），最大 ${MAX_PSD_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }
    if (!name) {
      return Response.json({ error: "请填写组件名称" }, { status: 400 });
    }
    if (nameCharLength(name) > 6) {
      return Response.json(
        { error: "组件名称不能超过 6 个字" },
        { status: 400 },
      );
    }
    if (!isVenueComponentGroup(group)) {
      return Response.json(
        {
          error: `分组必须是以下之一：${VENUE_COMPONENT_GROUPS.join(" / ")}`,
        },
        { status: 400 },
      );
    }
    if (thumbnailFile && thumbnailFile.size > MAX_THUMB_SIZE) {
      return Response.json(
        {
          error: `缩略图过大（${Math.round(thumbnailFile.size / 1024 / 1024)}MB），最大 ${MAX_THUMB_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }

    // --- 存 PSD 原文件 ---------------------------------------------------
    const componentId = generateId();
    const psdBuffer = await psdFile.arrayBuffer();
    const psdExt = path.extname(psdFile.name) || ".psd";
    const psdBlob = await localPut(
      `venue-components/${componentId}${psdExt}`,
      new File([psdBuffer], psdFile.name, {
        type: "application/octet-stream",
      }),
    );

    // --- 解析 PSD + 校验宽度 --------------------------------------------
    const parsed = await parsePsdBuffer(psdBuffer);
    if (parsed.width !== VENUE_COMPONENT_WIDTH) {
      return Response.json(
        {
          error: `会场组件宽度必须为 ${VENUE_COMPONENT_WIDTH}px，当前 PSD 宽度为 ${parsed.width}px，请调整后重新上传`,
        },
        { status: 400 },
      );
    }

    // --- 坐标归零 --------------------------------------------------------
    // 所有 layer 的 x/y 同时减去最小值，让组件从 (0, 0) 开始；component
    // height 取归零后 max(y + height)
    let minX = Infinity;
    let minY = Infinity;
    for (const l of parsed.layers) {
      if (l.x < minX) minX = l.x;
      if (l.y < minY) minY = l.y;
    }
    if (!isFinite(minX)) minX = 0;
    if (!isFinite(minY)) minY = 0;

    // --- 组装 PsdLayer 记录（同时存 layer raster 到 blob）--------------
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

    // --- 计算组件 height --------------------------------------------------
    let componentHeight = 0;
    for (const l of psdLayers) {
      if (l.layerType === "group") continue;
      const b = l.y + l.height;
      if (b > componentHeight) componentHeight = b;
    }
    if (componentHeight === 0) componentHeight = parsed.height; // 兜底

    // --- 缩略图 -----------------------------------------------------------
    let thumbnailUrl: string;
    if (thumbnailFile) {
      // 用户上传路径：直接存
      const thumbExt = path.extname(thumbnailFile.name).toLowerCase() || ".png";
      const thumbBuffer = await thumbnailFile.arrayBuffer();
      const up = await localPut(
        `venue-components/${componentId}-thumb${thumbExt}`,
        new File([thumbBuffer], thumbnailFile.name, {
          type: thumbnailFile.type || "image/png",
        }),
      );
      thumbnailUrl = up.url;
    } else {
      // 自动生成：先按组件原尺寸合成全图，再 sharp 缩到 AUTO_THUMB_WIDTH
      try {
        const fullPng = await renderPsdToPng({
          layers: psdLayers,
          canvasWidth: VENUE_COMPONENT_WIDTH,
          canvasHeight: componentHeight,
        });
        const resized = await sharp(fullPng)
          .resize({ width: AUTO_THUMB_WIDTH })
          .png()
          .toBuffer();
        const up = await localPut(
          `venue-components/${componentId}-thumb.png`,
          resized,
        );
        thumbnailUrl = up.url;
      } catch (err) {
        console.error(
          "[venue-components/upload] auto thumbnail failed:",
          err instanceof Error ? err.message : err,
        );
        return Response.json(
          {
            error:
              "缩略图自动生成失败，请手动上传缩略图后重试（详情见服务端日志）",
          },
          { status: 500 },
        );
      }
    }

    // --- 写入 DB ----------------------------------------------------------
    const input: CreateVenueComponentInput = {
      id: componentId,
      name,
      groupName: group,
      thumbnailUrl,
      payload: { layers: psdLayers },
      width: VENUE_COMPONENT_WIDTH,
      height: componentHeight,
      sourcePsdUrl: psdBlob.url,
    };
    const created = await createVenueComponent(input);

    return Response.json({ ok: true, component: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components/upload]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
