import { invalidateFontScan } from "@/lib/font-scan";
import { invalidateFontRegistration } from "@/lib/render-psd-to-png";

/**
 * 管理员：手动刷新字体扫描 + 注册缓存。
 *
 * 使用场景：往 public/fonts/ 扔了新字体文件，但不想重启 dev server。
 * 调用后：
 * - lib/font-scan.ts 的内存缓存清空，下次 getFontScan 触发重扫
 * - lib/render-psd-to-png.ts 的 `fontsRegistered` 标记清空，下次
 *   renderPsdToPng 时会重跑 ensureFontsRegistered（重新注册 + 重建
 *   FAMILY_WEIGHT_TO_PS）
 * - lib/fonts.ts 客户端缓存靠 TTL 自然失效，或前端直接 `fetchExposedFamilies({ force: true })`
 */
export async function POST() {
  invalidateFontScan();
  invalidateFontRegistration();
  return Response.json({ ok: true });
}
