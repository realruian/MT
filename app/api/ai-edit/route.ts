import { NextRequest } from "next/server";
import { editImage, FridayError } from "@/lib/friday-client";
import { localPut } from "@/lib/local-storage";
import { fetchAsBase64, extFromMime } from "@/lib/server-image-fetch";
import { hasTransparency, removeBg } from "@/lib/remove-bg";

/**
 * AI 图像编辑入口（整图模式）。
 *
 * 流程：
 *   1. 接收前端的 `imageUrl`（layer 当前 imageUrl，可能是 /api/blob/media/... 或外链）
 *      和 `prompt`（用户填的 AI 修改诉求）
 *   2. 把 imageUrl 拉成 buffer，转 base64 + 探测 mime
 *   3. 调 Friday Gemini 图像编辑（提交 + 轮询）
 *   4. 把生成结果二进制写到我们自己的 blob 存储（uploads/ai-edits/{uuid}.png）
 *   5. 返回我们自己的 URL，前端写进 editState.imageUrl
 *
 * 关键设计：结果图**永远转存到自有 blob**，避免依赖 Friday 的临时 URL。
 */

export const runtime = "nodejs";
// 等 Friday 轮询最多 5 分钟，next route 默认 10 分钟，这里显式声明 6 分钟兜底
export const maxDuration = 360;

interface AiEditRequest {
  imageUrl: string;
  prompt: string;
}

export async function POST(req: NextRequest) {
  let body: AiEditRequest;
  try {
    body = (await req.json()) as AiEditRequest;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { imageUrl, prompt } = body;
  if (!imageUrl || typeof imageUrl !== "string") {
    return Response.json({ error: "imageUrl 不能为空" }, { status: 400 });
  }
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return Response.json({ error: "prompt 不能为空" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return Response.json(
      { error: "prompt 过长（≤ 500 字）" },
      { status: 400 },
    );
  }

  const origin = req.nextUrl.origin;

  try {
    const {
      buf: srcBuf,
      base64: srcBase64,
      mime: srcMime,
    } = await fetchAsBase64(imageUrl, origin);
    const srcHasAlpha = await hasTransparency(srcBuf);

    const result = await editImage({
      imageBase64: srcBase64,
      mimeType: srcMime,
      prompt: prompt.trim(),
    });

    let outBuf = Buffer.from(result.imageBase64, "base64");
    let outMime = result.mimeType;
    if (srcHasAlpha) {
      try {
        const t0 = Date.now();
        outBuf = await removeBg(outBuf, result.mimeType);
        outMime = "image/png";
        console.log(
          `[ai-edit] removeBg ok in ${Date.now() - t0}ms, size=${outBuf.length}B`,
        );
      } catch (e) {
        console.warn(
          `[ai-edit] removeBg failed, fallback to flat output: ${
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
