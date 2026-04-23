import { getFontScan } from "@/lib/font-scan";
import { aggregateFamilies } from "@/lib/font-aggregation";

/**
 * 编辑器字体下拉的数据源。
 * 返回经过 EXPOSED_FAMILIES 白名单筛选 + 家族归并 + 字重标准化的
 * `FontFamilyDef[]`。非白名单的字体不在这里出现，但仍由服务端 fontkit
 * 注册层覆盖（PSD 引用它们时导出不会回退）。
 *
 * 首次调用会触发 lib/font-scan.ts 的扫描（耗时 ~1s，217 个字体），后续
 * 走进程内缓存。缓存失效：POST /api/admin/fonts/rescan。
 */
export async function GET() {
  try {
    const scan = await getFontScan();
    const families = aggregateFamilies(scan.faces);
    return Response.json({
      ok: true,
      families,
      scannedAt: scan.scannedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[fonts/families] GET", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
