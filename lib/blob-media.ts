/** 允许经 /api/blob/media 代理读取的 Blob pathname 前缀（须与上传 folder 一致） */
export const BLOB_MEDIA_PREFIXES = [
  "thumbnails/",
  "templates/",
  "uploads/",
  "fonts/",
  "psd-originals/",
  "psd-layers/",
  "venue-components/",
  "ai-edits/",
] as const;

export function isAllowedBlobPathname(pathname: string): boolean {
  if (!pathname || pathname.includes("..") || pathname.startsWith("/")) {
    return false;
  }
  return BLOB_MEDIA_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** 私有 Blob 在浏览器中通过同源 API 拉取内容 */
export function clientBlobMediaUrl(pathname: string): string {
  return `/api/blob/media?pathname=${encodeURIComponent(pathname)}`;
}
