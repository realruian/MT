import { NextRequest } from "next/server";
import { editImage, FridayError } from "@/lib/friday-client";
import { localPut } from "@/lib/local-storage";

/**
 * AI 图像编辑入口。
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

function inferMimeFromUrl(url: string): string {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** 把外链 / 站内 URL 拉成 buffer。同站点 URL（/api/blob/...）支持相对路径解析。 */
async function fetchImage(
  imageUrl: string,
  origin: string,
): Promise<{ buf: Buffer; mime: string }> {
  // 相对路径补 origin
  const absoluteUrl = imageUrl.startsWith("http")
    ? imageUrl
    : `${origin}${imageUrl}`;
  const resp = await fetch(absoluteUrl, {
    method: "GET",
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    throw new Error(`拉取原图失败：${resp.status} ${absoluteUrl}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  const mime =
    resp.headers.get("content-type")?.split(";")[0] ?? inferMimeFromUrl(imageUrl);
  return { buf, mime };
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
    // 1. 拉原图
    const { buf: srcBuf, mime: srcMime } = await fetchImage(imageUrl, origin);
    const srcBase64 = srcBuf.toString("base64");

    // 2. 调 Friday
    const result = await editImage({
      imageBase64: srcBase64,
      mimeType: srcMime,
      prompt: prompt.trim(),
    });

    // 3. 转存到自有 blob
    const ext = extFromMime(result.mimeType);
    const filename = `ai-edits/${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const outBuf = Buffer.from(result.imageBase64, "base64");
    const stored = await localPut(filename, outBuf);

    return Response.json({
      ok: true,
      imageUrl: stored.url,
      mimeType: result.mimeType,
    });
  } catch (e) {
    if (e instanceof FridayError) {
      // 上游 AI 错误 → 502 Bad Gateway 更准确
      return Response.json(
        { error: `AI 服务错误：${e.message}` },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
