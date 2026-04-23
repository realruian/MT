import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import * as fontkit from "fontkit";
import type { Font } from "fontkit";

/**
 * 字体全量扫描模块：读 public/fonts/（递归，含子目录）下所有 ttf/otf/
 * woff/woff2 文件，用 fontkit 解析出每张 face 的元信息，供下面两个上游
 * 消费：
 * - lib/render-psd-to-png.ts: 全量注册到 GlobalFonts + 构建
 *   FAMILY_WEIGHT_TO_PS（服务端渲染 PSD 时按 family+weight 查 PS 名）
 * - lib/font-aggregation.ts: 按 displayName 映射 + 正则剥离聚合 +
 *   EXPOSED 白名单筛选，派生出 FontFamilyDef[] 供前端下拉
 *
 * 缓存：进程生命周期内只扫一次，POST /api/admin/fonts/rescan 调
 * invalidateFontScan() 后首次读取会重扫。
 */

const SCAN_EXTS = new Set([".ttf", ".otf", ".woff", ".woff2"]);
/** 并发读文件 + fontkit.create 的上限；217 个文件 16 并发实测 < 1s */
const CONCURRENCY = 16;

export interface ScannedFontFace {
  /** 绝对路径，供 GlobalFonts.registerFromPath 使用 */
  filePath: string;
  /** 相对 public/fonts 的路径（含子目录，forward slash 规范化） */
  filename: string;
  /** 前端用 `<url>` 加载的路径：`/fonts/<filename>` */
  url: string;
  postscriptName: string;
  /** fontkit 读出的 familyName；可能为空字符串（部分无 name 表的字体） */
  family: string;
  /** fontkit 读出的 subfamilyName（"Regular" / "Bold" / "Bold Italic"）*/
  subfamily: string;
  /** OS/2 usWeightClass（100-900 或厂商自定义值）；缺失 null */
  usWeightClass: number | null;
  /** OS/2 fsSelection bit 0 */
  italic: boolean;
}

export interface FontScanResult {
  fontsDir: string;
  scannedFileCount: number;
  faceCount: number;
  faces: ScannedFontFace[];
  errors: Array<{ filename: string; error: string }>;
  scannedAt: number;
  scanDurationMs: number;
}

let cached: FontScanResult | null = null;
let pending: Promise<FontScanResult> | null = null;

function walkFonts(dir: string, out: string[] = []): string[] {
  if (!fsSync.existsSync(dir)) return out;
  for (const entry of fsSync.readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = fsSync.statSync(full);
    if (stat.isDirectory()) {
      walkFonts(full, out);
    } else if (SCAN_EXTS.has(path.extname(entry).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function readOs2(font: Font): { weight: number | null; italic: boolean } {
  const rec = font as unknown as Record<string, unknown>;
  const os2 = rec["OS/2"];
  if (!os2 || typeof os2 !== "object") {
    return { weight: null, italic: false };
  }
  const os2Rec = os2 as Record<string, unknown>;
  const weight =
    typeof os2Rec.usWeightClass === "number" ? os2Rec.usWeightClass : null;
  const fsSelection =
    typeof os2Rec.fsSelection === "number" ? os2Rec.fsSelection : 0;
  return { weight, italic: (fsSelection & 1) === 1 };
}

async function parseOne(
  abs: string,
  root: string,
): Promise<ScannedFontFace[] | { error: string }> {
  try {
    const buf = await fs.readFile(abs);
    // fontkit.create 走 buffer 路径，让 fs 读文件部分能被 runConcurrent 真并发
    const parsed = fontkit.create(buf);
    const faces: Font[] =
      "fonts" in parsed && Array.isArray(parsed.fonts)
        ? (parsed.fonts as Font[])
        : [parsed as Font];
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const result: ScannedFontFace[] = [];
    for (const face of faces) {
      if (!face.postscriptName) continue;
      const { weight, italic } = readOs2(face);
      result.push({
        filePath: abs,
        filename: rel,
        url: `/fonts/${rel}`,
        postscriptName: face.postscriptName,
        family: face.familyName ?? "",
        subfamily: face.subfamilyName ?? "",
        usWeightClass: weight,
        italic,
      });
    }
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** 固定大小的并发池：items 按 index 依次被 worker 抢占消费，不超过 limit 个同时 inflight */
async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runScan(): Promise<FontScanResult> {
  const startedAt = Date.now();
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const files = walkFonts(fontsDir);
  const parsedList = await runConcurrent(files, CONCURRENCY, (abs) =>
    parseOne(abs, fontsDir),
  );

  const faces: ScannedFontFace[] = [];
  const errors: FontScanResult["errors"] = [];
  for (let i = 0; i < files.length; i++) {
    const res = parsedList[i];
    const rel = path
      .relative(fontsDir, files[i])
      .split(path.sep)
      .join("/");
    if ("error" in res) {
      errors.push({ filename: rel, error: res.error });
    } else {
      faces.push(...res);
    }
  }

  const scannedAt = Date.now();
  return {
    fontsDir,
    scannedFileCount: files.length,
    faceCount: faces.length,
    faces,
    errors,
    scannedAt,
    scanDurationMs: scannedAt - startedAt,
  };
}

/**
 * 读取（或首次构建）字体扫描结果。进程内缓存；多次并发调用共享同一 pending
 * Promise，避免同时触发两次扫描。
 */
export async function getFontScan(): Promise<FontScanResult> {
  if (cached) return cached;
  if (pending) return pending;
  pending = runScan()
    .then((r) => {
      cached = r;
      pending = null;
      console.log(
        `[font-scan] ${r.scannedFileCount} files → ${r.faceCount} faces in ${r.scanDurationMs}ms (errors: ${r.errors.length})`,
      );
      return r;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}

/** 清空内存缓存；下次 getFontScan 会重扫。供 /api/admin/fonts/rescan 调用。 */
export function invalidateFontScan(): void {
  cached = null;
  console.log("[font-scan] cache invalidated");
}
