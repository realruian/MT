import { getFontScan } from "./font-scan";
import {
  familyToAggregationKey,
  normalizeWeight,
} from "./font-aggregation";

/**
 * PSD 字体名解析器：把 PSD 里存的 PostScript 名（如 `FZLTDHJW--GB1-0`）归一化
 * 成 `{ family: 聚合 key, weight: CSS weight }`，让前端下拉、画布渲染、服务端
 * 导出全部读到同一份干净 family。
 *
 * 核心策略：
 *   1. 剥掉 PSD/CID 编码后缀（`--GB1-0` / `--BIG5` / `--Adobe-Japan1-x` 等），
 *      得到 base PS 名
 *   2. 在 fontkit 扫描结果里按 base PS 名 / 完整 PS 名前缀匹配
 *   3. 命中后用 font-aggregation 的 familyToAggregationKey + normalizeWeight
 *      返回干净的 family + weight
 *   4. 一个都找不到 → 至少把 family 也走一遍 familyToAggregationKey 兜底
 *      （让自由扩展新字体不依赖此处映射表）
 *
 * 使用场景：
 *   - PSD 上传 route 在写库前调一次
 *   - migrate-fonts route 对存量数据批量调
 *   - 新功能（搜索/统计/AI 推荐字体）直接读 DB 里干净的 family，无需再调本模块
 */

/**
 * 剥离 PostScript 名末尾的 CMap / CID 编码后缀。
 * - `FZLTDHJW--GB1-0` → `FZLTDHJW`
 * - `STSongStd-Light-Adobe-GB1-3` → `STSongStd-Light`
 * - `Identity-H` 这类单破折号 CID 不裁（保留以免误吞普通字体名）
 */
const CMAP_SUFFIX_RE =
  /--(?:GB[0-9]?(?:[-A-Za-z0-9]*)|GBpc-EUC-[HV]|BIG5|B5pc-[HV]|HKSCS(?:-B5pc)?-[HV]|Adobe-(?:GB1|CNS1|Japan1|Korea1)-[0-9]+|Identity-[HV])$/;

const ADOBE_LONG_SUFFIX_RE =
  /-Adobe-(?:GB1|CNS1|Japan1|Korea1)-[0-9]+$/;

export function stripCMapSuffix(psName: string): string {
  if (!psName) return psName;
  let out = psName.replace(CMAP_SUFFIX_RE, "");
  out = out.replace(ADOBE_LONG_SUFFIX_RE, "");
  return out;
}

export interface ResolvedFont {
  family: string; // 聚合 key（如 "FZLanTingHeiS-GB" / "Meituan Type"）
  weight: string; // CSS weight ("100"-"800")
  /** 命中策略，便于调试 */
  source:
    | "exact-ps"
    | "stripped-ps"
    | "ps-prefix"
    | "family-fallback"
    | "raw-fallback";
}

let cache: Promise<Map<string, ResolvedFont>> | null = null;

/**
 * 构建 PS 名 → ResolvedFont 的查找表（按 fontkit 扫描结果，进程内缓存）。
 * 单次扫描结果产出多种 key：完整 PS 名、剥后缀 PS 名，提高命中率。
 */
async function buildLookup(): Promise<Map<string, ResolvedFont>> {
  if (cache) return cache;
  cache = (async () => {
    const scan = await getFontScan();
    const map = new Map<string, ResolvedFont>();
    for (const face of scan.faces) {
      const family = familyToAggregationKey(face.family);
      const weight = normalizeWeight(
        face.family,
        face.subfamily,
        face.usWeightClass,
        face.postscriptName,
      );
      const fullPs = face.postscriptName;
      const strippedPs = stripCMapSuffix(fullPs);
      // 完整 PS 名优先（最稳）
      if (fullPs && !map.has(fullPs)) {
        map.set(fullPs, { family, weight, source: "exact-ps" });
      }
      // 剥后缀 PS 名兜底（文件 PS 名是 base，PSD 里写带后缀也能命中）
      if (strippedPs && strippedPs !== fullPs && !map.has(strippedPs)) {
        map.set(strippedPs, { family, weight, source: "stripped-ps" });
      }
    }
    return map;
  })();
  return cache;
}

/** 测试 / migration 用：清理进程内缓存。 */
export function invalidateFontResolverCache(): void {
  cache = null;
}

/**
 * 把 PSD 里存的 PS 名（可能带 `--GB1-0` 等编码后缀）解析成干净 family + weight。
 *
 * 解析顺序：
 *   1. 完整 PS 名直接命中
 *   2. 剥编码后缀后命中
 *   3. PS 名前缀匹配（PSD 给的 PS 名比文件 PS 名长一截的情况，少见）
 *   4. 把 PS 名当 family 走一遍 familyToAggregationKey，至少格式化
 *   5. 原样返回（最后兜底）
 */
export async function resolvePsName(
  psName: string | null | undefined,
  /** 可选：PSD 也存了 fontWeight，可作为 weight 兜底参考 */
  hintWeight?: string | null,
): Promise<ResolvedFont> {
  const fallbackWeight = hintWeight === "bold" ? "700" : "400";
  if (!psName) {
    return { family: "", weight: fallbackWeight, source: "raw-fallback" };
  }
  const lookup = await buildLookup();

  // 1. 完整 PS 名
  const direct = lookup.get(psName);
  if (direct) return direct;

  // 2. 剥后缀
  const stripped = stripCMapSuffix(psName);
  if (stripped !== psName) {
    const hit = lookup.get(stripped);
    if (hit) return hit;
  }

  // 3. PS 名前缀（PSD 引用的 PS 名比文件 PS 名长，例：
  //    PSD 里写 "FZLTDHJW-Bold"，文件 PS 名是 "FZLTDHJW"）
  for (const [key, val] of lookup) {
    if (psName.startsWith(key) && key.length >= 4) {
      return { ...val, source: "ps-prefix" };
    }
  }

  // 4. family 聚合兜底（即使没注册，至少格式干净；下拉会显示"未安装"，但不影响
  //    后续重传字体后立即生效）
  const familyKey = familyToAggregationKey(stripped);
  return {
    family: familyKey,
    weight: fallbackWeight,
    source: "family-fallback",
  };
}
