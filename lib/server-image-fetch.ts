/**
 * 服务端把图片 URL（站内或外链）拉成 base64 + mime。
 * 给 AI 图像编辑路由共用：/api/ai-edit、/api/ai-edit/regions。
 */

function inferMimeFromUrl(url: string): string {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export interface FetchedImage {
  buf: Buffer;
  base64: string;
  mime: string;
}

/**
 * 把 imageUrl 拉成 buffer + base64 + mime。
 * 相对路径会用 origin 补全（站内 /api/blob/media/... 走自身 origin）。
 */
export async function fetchAsBase64(
  imageUrl: string,
  origin: string,
): Promise<FetchedImage> {
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
  return { buf, base64: buf.toString("base64"), mime };
}
