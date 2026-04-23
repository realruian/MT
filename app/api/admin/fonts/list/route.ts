import { getFontScan } from "@/lib/font-scan";
import {
  EXPOSED_FAMILIES,
  aggregateFamilies,
  familyToAggregationKey,
  normalizeWeight,
} from "@/lib/font-aggregation";

/**
 * [管理员诊断] 字体全量清单。
 * 返回 lib/font-scan.ts 的原始扫描结果 + 经过聚合后的 EXPOSED families，
 * 便于对比"磁盘上有什么"和"下拉暴露了什么"。
 *
 * 查看每张 face 在聚合/归一化之后落到的 (aggKey, weight)，用来排查
 * "某个字体选了但导出字体不对" 之类的问题 —— 如果某 face 的
 * normalizedKey 和预期下拉选项的 family 对不上，说明 font-aggregation
 * 的规则需要补一条。
 */
export async function GET() {
  try {
    const scan = await getFontScan();
    const families = aggregateFamilies(scan.faces);

    const normalized = scan.faces.map((face) => {
      const aggKey = familyToAggregationKey(face.family);
      const weight = normalizeWeight(
        face.family,
        face.subfamily,
        face.usWeightClass,
        face.postscriptName,
      );
      return {
        filename: face.filename,
        postscriptName: face.postscriptName,
        family: face.family,
        subfamily: face.subfamily,
        usWeightClass: face.usWeightClass,
        italic: face.italic,
        aggregationKey: aggKey,
        normalizedWeight: weight,
        exposed: EXPOSED_FAMILIES.includes(aggKey),
      };
    });

    return Response.json({
      ok: true,
      fontsDir: scan.fontsDir,
      scannedFileCount: scan.scannedFileCount,
      faceCount: scan.faceCount,
      scanDurationMs: scan.scanDurationMs,
      scannedAt: scan.scannedAt,
      exposedCount: families.length,
      exposedFamilies: families,
      faces: normalized,
      errors: scan.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin/fonts/list] GET", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
