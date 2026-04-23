import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getPsdLayers } from "@/lib/templates-db";
import {
  renderPsdToPng,
  type LayerEditOverlay,
} from "@/lib/render-psd-to-png";
import type { PsdLayer } from "@/types/template";

/**
 * PSD 导出：把一个模板（或前端临时组装的 layers 数组）合成为 PNG 返回下载。
 * 实际渲染（字体注册 / sharp composite / 文字渲染）集中在 lib/render-psd-to-png.ts，
 * 给"会场 PNG 导出"和"会场组件缩略图自动生成"共用同一套流水线。
 */

function isValidLayers(arr: unknown): arr is PsdLayer[] {
  if (!Array.isArray(arr)) return false;
  return arr.every((l) => {
    if (!l || typeof l !== "object") return false;
    const r = l as Record<string, unknown>;
    return (
      typeof r.id === "string" &&
      typeof r.x === "number" &&
      typeof r.y === "number" &&
      typeof r.width === "number" &&
      typeof r.height === "number" &&
      typeof r.zIndex === "number" &&
      typeof r.layerType === "string"
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      templateId,
      edits,
      canvasWidth,
      canvasHeight,
      layers: bodyLayers,
      bgColor,
    } = body as {
      templateId: string;
      edits?: Record<string, LayerEditOverlay>;
      canvasWidth?: number;
      canvasHeight?: number;
      /** 可选：前端直接下发完整 layers（会场插入组件后用这个分支，绕过 DB 拉取） */
      layers?: unknown;
      /** 可选：画布背景色（hex，含 #）；未传或非法时回退白色 */
      bgColor?: string;
    };

    if (!templateId) {
      return Response.json({ error: "Missing templateId" }, { status: 400 });
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

    // 优先使用 body.layers（前端会场含插入组件时走这个分支）；校验失败
    // 或未传时回退到 DB 按 templateId 拉取，保证导出至少能出会场原图。
    let allLayers: PsdLayer[];
    if (bodyLayers !== undefined) {
      if (isValidLayers(bodyLayers)) {
        allLayers = bodyLayers;
      } else {
        console.warn(
          "[export/psd] invalid layers payload, fallback to DB by templateId",
        );
        allLayers = await getPsdLayers(templateId);
      }
    } else {
      allLayers = await getPsdLayers(templateId);
    }

    const result = await renderPsdToPng({
      layers: allLayers,
      edits: edits ?? {},
      canvasWidth: cw,
      canvasHeight: ch,
      bgColor,
    });

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
