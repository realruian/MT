import { NextRequest } from "next/server";
import {
  editImageMultipart,
  FridayError,
  type FridayMultipartImage,
} from "@/lib/friday-client";
import { localPut } from "@/lib/local-storage";
import { fetchAsBase64, extFromMime } from "@/lib/server-image-fetch";
import { hasTransparency, removeBg } from "@/lib/remove-bg";

/**
 * AI 图像编辑入口（框选区域模式）。
 *
 * 协议移植自同事 yimin/main.py 的 process_unified_regions：
 * 用户在主图上画 1–8 个矩形区域，每个区域独立选 改字 / 换图，
 * 后端把所有区域合并成一个 Gemini prompt 一次性提交。
 *
 * 流程：
 *   1. 收 { imageUrl, regions[] }
 *   2. 拉主图 → base64
 *   3. 收集所有 referenceImage 当参考图
 *   4. 构造 prompt（按区域类型生成对应描述行 + 末尾禁止事项）
 *   5. 调 editImageMultipart（主图 + 参考图）
 *   6. 结果 localPut 到 data/blob/ai-edits/，返回自有 URL
 */

export const runtime = "nodejs";
export const maxDuration = 360;

const MAX_REGIONS = 8;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_NEW_TEXT = 100;
const MAX_IMAGE_PROMPT = 200;

interface RegionInput {
  editType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  newText?: string;
  imagePrompt?: string;
  referenceImage?: { base64?: string; mimeType?: string };
}

interface RegionsRequest {
  imageUrl?: string;
  regions?: RegionInput[];
}

interface NormalizedRegion {
  editType: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  newText?: string;
  imagePrompt?: string;
  referenceImage?: FridayMultipartImage;
}

function isPercent(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
}

/** 校验 + 归一化 regions。失败抛 Error，调用方转 400。 */
function normalizeRegions(input: RegionInput[]): NormalizedRegion[] {
  if (!Array.isArray(input)) {
    throw new Error("regions 必须是数组");
  }
  if (input.length === 0) {
    throw new Error("至少需要 1 个区域");
  }
  if (input.length > MAX_REGIONS) {
    throw new Error(`最多 ${MAX_REGIONS} 个区域`);
  }

  const out: NormalizedRegion[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = input[i];
    const idx = i + 1;
    const et = r.editType;
    if (et !== "text" && et !== "image") {
      throw new Error(`区域${idx} editType 仅支持 text 或 image`);
    }
    if (
      !isPercent(r.x) ||
      !isPercent(r.y) ||
      !isPercent(r.width) ||
      !isPercent(r.height)
    ) {
      throw new Error(`区域${idx} 坐标非法（x/y/width/height 应为 0–100）`);
    }
    if (r.width === 0 || r.height === 0) {
      throw new Error(`区域${idx} 宽高不能为 0`);
    }
    if ((r.x ?? 0) + (r.width ?? 0) > 100 + 1e-6) {
      throw new Error(`区域${idx} x+width 超出 100`);
    }
    if ((r.y ?? 0) + (r.height ?? 0) > 100 + 1e-6) {
      throw new Error(`区域${idx} y+height 超出 100`);
    }

    const norm: NormalizedRegion = {
      editType: et,
      x: r.x as number,
      y: r.y as number,
      width: r.width as number,
      height: r.height as number,
    };

    if (et === "text") {
      const t = (r.newText ?? "").trim();
      if (!t) {
        throw new Error(`区域${idx}（改字）的新文案不能为空`);
      }
      if (t.length > MAX_NEW_TEXT) {
        throw new Error(`区域${idx} 新文案过长（≤ ${MAX_NEW_TEXT} 字）`);
      }
      norm.newText = t;
    } else {
      const desc = (r.imagePrompt ?? "").trim();
      const ref = r.referenceImage;
      const hasRef =
        !!ref &&
        typeof ref.base64 === "string" &&
        ref.base64.length > 0 &&
        typeof ref.mimeType === "string" &&
        ref.mimeType.length > 0;
      if (!desc && !hasRef) {
        throw new Error(`区域${idx}（换图）请填写描述或参考图`);
      }
      if (desc.length > MAX_IMAGE_PROMPT) {
        throw new Error(`区域${idx} 图像描述过长（≤ ${MAX_IMAGE_PROMPT} 字）`);
      }
      if (desc) norm.imagePrompt = desc;
      if (hasRef) {
        norm.referenceImage = {
          base64: ref!.base64 as string,
          mimeType: ref!.mimeType as string,
        };
      }
    }
    out.push(norm);
  }
  return out;
}

/**
 * 构造合并 prompt + 收集参考图（保持 prompt 内"附图N"序号和数组顺序一致）。
 * 移植自 yimin/main.py:188 process_unified_regions。
 */
function buildPromptAndRefs(regions: NormalizedRegion[]): {
  promptText: string;
  references: FridayMultipartImage[];
} {
  const textLines: string[] = [];
  const imageLines: string[] = [];
  const references: FridayMultipartImage[] = [];

  regions.forEach((region, i) => {
    const idx = i + 1;
    const x1 = region.x;
    const y1 = region.y;
    const x2 = region.x + region.width;
    const y2 = region.y + region.height;
    const coord = `x:${x1.toFixed(2)}%~${x2.toFixed(
      2,
    )}%, y:${y1.toFixed(2)}%~${y2.toFixed(2)}%`;

    if (region.editType === "text") {
      textLines.push(
        `区域${idx}：坐标范围 ${coord}，仅将文字内容替换为「${region.newText}」。` +
          `严格保持原有字体样式（无描边/阴影/渐变）、颜色、字号、对齐方式。` +
          `如果该区域内文字有背景色块、标签框、装饰边框等背景装饰元素，` +
          `需同步调整背景装饰的宽度以适配新文字的长度，保持视觉比例协调，不要留白或溢出。`,
      );
    } else {
      let refPhrase = "";
      if (region.referenceImage) {
        references.push(region.referenceImage);
        const refIdx = references.length;
        refPhrase = `请参考附图${refIdx}的内容和风格，`;
      }

      const desc = region.imagePrompt;
      if (region.referenceImage && desc) {
        imageLines.push(
          `区域${idx}：坐标范围 ${coord}，${refPhrase}` +
            `并结合以下描述生成该区域的替换图像：${desc}。` +
            `光影与周围环境一致，边缘自然融合，无明显接缝。`,
        );
      } else if (region.referenceImage) {
        imageLines.push(
          `区域${idx}：坐标范围 ${coord}，${refPhrase}` +
            `将指定区域替换为与参考图一致或相近的图像内容，光影与周围环境一致，边缘自然融合。`,
        );
      } else {
        imageLines.push(
          `区域${idx}：坐标范围 ${coord}，将指定区域的图像内容替换为：${desc}，` +
            `光影和色调与周围环境保持一致，边缘自然融合。`,
        );
      }
    }
  });

  const bodyParts: string[] = ["请对这张海报图片进行局部修改，严格遵守以下规则。"];
  if (textLines.length > 0) {
    bodyParts.push("【改字修改】\n" + textLines.join("\n"));
  }
  if (imageLines.length > 0) {
    bodyParts.push("【换图修改】\n" + imageLines.join("\n"));
  }
  bodyParts.push(
    "【绝对禁止事项——违反任何一条均视为失败】\n" +
      "1. 禁止修改任何未在上方明确列出的区域，包括但不限于：标题文字、副标题、" +
      "活动文案、价格数字、品牌 Logo、背景色、装饰图案、边框、角标等——这些必须与原图像素级一致\n" +
      "2. 禁止对指定修改区域以外的任何文字做任何改动（不得替换、不得重排、不得改变样式）\n" +
      "3. 禁止改变整体色调、亮度、对比度或添加任何滤镜效果\n" +
      "4. 改字时禁止添加描边、阴影、渐变、发光等原图没有的视觉效果，只替换文字内容本身\n" +
      "5. 换图时边缘需自然融合，但融合范围不得超出指定坐标区域\n" +
      "你的唯一任务是：仅对上方列出的区域做最小化修改，其余所有内容保持原样不动。",
  );

  const prefix =
    "以下第一张图片为待编辑海报；其后依次为参考附图（按顺序对应文中的附图1、附图2……）。\n\n";
  return { promptText: prefix + bodyParts.join("\n\n"), references };
}

export async function POST(req: NextRequest) {
  // 体积兜底（参考图 inline base64，多张时可能膨胀）
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: `请求体过大（>${MAX_BODY_BYTES / 1024 / 1024}MB），请减少参考图` },
      { status: 413 },
    );
  }

  let body: RegionsRequest;
  try {
    body = (await req.json()) as RegionsRequest;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { imageUrl, regions } = body;
  if (!imageUrl || typeof imageUrl !== "string") {
    return Response.json({ error: "imageUrl 不能为空" }, { status: 400 });
  }
  if (!Array.isArray(regions)) {
    return Response.json({ error: "regions 必须是数组" }, { status: 400 });
  }

  let normalized: NormalizedRegion[];
  try {
    normalized = normalizeRegions(regions);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 400 });
  }

  const origin = req.nextUrl.origin;

  try {
    const {
      buf: srcBuf,
      base64: srcBase64,
      mime: srcMime,
    } = await fetchAsBase64(imageUrl, origin);
    const srcHasAlpha = await hasTransparency(srcBuf);

    const { promptText, references } = buildPromptAndRefs(normalized);

    console.log(
      `[ai-edit/regions] regions=${normalized.length} refs=${references.length} prompt=${promptText.length}chars hasAlpha=${srcHasAlpha}`,
    );

    const result = await editImageMultipart({
      promptText,
      mainImage: { base64: srcBase64, mimeType: srcMime },
      referenceImages: references,
    });

    let outBuf = Buffer.from(result.imageBase64, "base64");
    let outMime = result.mimeType;
    if (srcHasAlpha) {
      try {
        const t0 = Date.now();
        outBuf = await removeBg(outBuf, result.mimeType);
        outMime = "image/png";
        console.log(
          `[ai-edit/regions] removeBg ok in ${Date.now() - t0}ms, size=${
            outBuf.length
          }B`,
        );
      } catch (e) {
        console.warn(
          `[ai-edit/regions] removeBg failed, fallback to flat output: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    const ext = extFromMime(outMime);
    const filename = `ai-edits/${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const stored = await localPut(filename, outBuf);

    return Response.json({
      ok: true,
      imageUrl: stored.url,
      mimeType: outMime,
    });
  } catch (e) {
    if (e instanceof FridayError) {
      return Response.json(
        { error: `AI 服务错误：${e.message}` },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
