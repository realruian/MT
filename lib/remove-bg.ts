/**
 * AI 编辑结果背景去除：用 BiRefNet 重抠 alpha 通道。
 *
 * 用途：Gemini 3.1 Flash 不保留输入图的透明通道，输出永远是 RGB。
 * 当原图带 alpha 时，对 AI 结果跑一次 background removal，恢复透明背景。
 *
 * 模型 ~80MB，首次调用时下载到 onnx-runtime 缓存。
 * 1500px 输入 Node CPU 跑 2–6s。
 */

import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

/**
 * 检测 buffer 对应的图片是否真的有非全不透明的 alpha 通道。
 * - meta.hasAlpha 仅说明文件格式带 alpha 通道
 * - 用 stats 看 alpha 通道最小值 < 255 才算真有透明像素
 */
export async function hasTransparency(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf).metadata();
    if (!meta.hasAlpha) return false;
    const stats = await sharp(buf).stats();
    const ch = stats.channels;
    if (!ch || ch.length === 0) return false;
    const alpha = ch[ch.length - 1];
    return typeof alpha.min === "number" && alpha.min < 255;
  } catch {
    return false;
  }
}

/**
 * 对输入图跑背景去除，返回透明 PNG buffer。
 * 失败会抛错（调用方应捕获并 fallback 到原 buffer）。
 */
export async function removeBg(
  buf: Buffer,
  mimeType = "image/png",
): Promise<Buffer<ArrayBuffer>> {
  // 关键：@imgly/background-removal-node 的 imageDecode 不接受 Buffer / Uint8Array，
  // 只认 Blob（实测 Buffer/Uint8Array 都报 "Unsupported format"）。必须先包成 Blob。
  const inputBlob = new Blob([new Uint8Array(buf)], { type: mimeType });
  const outBlob = await removeBackground(inputBlob);
  const arr = await outBlob.arrayBuffer();
  const out = Buffer.alloc(arr.byteLength);
  out.set(new Uint8Array(arr));
  return out;
}
