import path from "path";
import fs from "fs";
import { isAllowedBlobPathname, clientBlobMediaUrl } from "./blob-media";

/**
 * 本地文件存储（替代 Vercel Blob）。
 * 所有上传文件落到 <project root>/data/blob/<pathname>，
 * 读取统一通过 /api/blob/media?pathname=... 代理返回，保持 URL 形态与以前一致。
 */
export const LOCAL_BLOB_ROOT = path.join(process.cwd(), "data", "blob");

function ensureSafePathname(pathname: string): string {
  if (!isAllowedBlobPathname(pathname)) {
    throw new Error(`Pathname not allowed: ${pathname}`);
  }
  const full = path.join(LOCAL_BLOB_ROOT, pathname);
  // 防止 path 越狱
  const rel = path.relative(LOCAL_BLOB_ROOT, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Invalid pathname: ${pathname}`);
  }
  return full;
}

export interface LocalPutResult {
  /** 供前端使用的同源代理 URL */
  url: string;
  /** 相对 LOCAL_BLOB_ROOT 的路径（即 folder/filename） */
  pathname: string;
}

export async function localPut(
  pathname: string,
  data: Buffer | Uint8Array | ArrayBuffer | Blob | File,
): Promise<LocalPutResult> {
  const full = ensureSafePathname(pathname);
  fs.mkdirSync(path.dirname(full), { recursive: true });

  let buf: Buffer;
  if (Buffer.isBuffer(data)) {
    buf = data;
  } else if (data instanceof Uint8Array) {
    buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof ArrayBuffer) {
    buf = Buffer.from(data);
  } else if (typeof Blob !== "undefined" && data instanceof Blob) {
    // 覆盖 File（extends Blob）场景
    buf = Buffer.from(await data.arrayBuffer());
  } else {
    throw new Error("localPut: unsupported data type");
  }

  fs.writeFileSync(full, buf);
  return { url: clientBlobMediaUrl(pathname), pathname };
}

export function localRead(pathname: string): Buffer | null {
  const full = ensureSafePathname(pathname);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}

/** 推断 Content-Type（够用即可，不追求完备） */
export function contentTypeOf(pathname: string): string {
  const ext = path.extname(pathname).toLowerCase();
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".svg": return "image/svg+xml";
    case ".ttf": return "font/ttf";
    case ".otf": return "font/otf";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    case ".html":
    case ".htm": return "text/html; charset=utf-8";
    case ".json": return "application/json";
    case ".psd": return "application/octet-stream";
    default: return "application/octet-stream";
  }
}
