import type { ScannedFontFace } from "./font-scan";
import { FAMILY_DISPLAY_NAMES } from "./font-display-names";

/**
 * 字体家族归并 + 字重标准化的核心。
 *
 * 两层职责：
 * 1. `familyToAggregationKey(rawFamily)` —— 把 fontkit 读出的 familyName
 *    归并到"稳定聚合 key"。例如：
 *      "MiSans" / "MiSans Thin" / "MiSans Heavy" → "MiSans"
 *      "Alibaba PuHuiTi 3.0 35 Thin" / "3.0 85 Bold" → "Alibaba PuHuiTi 3.0"
 *      "FZLanTingHeiS-B-GB" / "-DB-GB" / ... → "FZLanTingHeiS-GB"
 *      "FZPanHuBaoZhuangTiS W07 B" / "W07 L" → "FZPanHuBaoZhuangTiS W07"
 *    厂商把每个字重做成独立 family 是常态，直接按 fontkit family 分组
 *    会把下拉散成一人一组 —— 这里做二次归并。
 *
 * 2. `normalizeWeight(...)` —— 把"Thin / Light / R / B / Heavy / W05-B..."
 *    这些五花八门的关键字映射到 CSS 标准字重字符串（"100" - "800"）。
 *    family 名 / subfamily / PostScript 名里的关键字优先，OS/2 usWeightClass
 *    只当 fallback（厂商 OS/2 值极度不可靠：MiSans Regular 标 330，
 *    Bold 标 630；方正兰亭黑 Heavy 只标 400）。
 *
 * 3. `aggregateFamilies(faces)` —— 结合上面两步 + EXPOSED 白名单，产出
 *    前端下拉用的 FontFamilyDef[]。白名单外的家族仍由 render-psd-to-png
 *    全量注册，resolver 可命中（下拉清单 ≠ 可用字体清单）。
 */

export interface FontVariant {
  /** CSS font-weight 字符串："100" / "300" / "400" / "500" / "600" / "700" / "800" */
  weight: string;
  label: string;
  /** 前端 `<url>` 用：`/fonts/<...>` */
  url: string;
  /** 供服务端 resolver 对齐用（避免下拉选中 ≠ 实际注册的 PS 名） */
  postscriptName: string;
}

export interface FontFamilyDef {
  /** 聚合 key（稳定英文标识） */
  family: string;
  displayName: string;
  variants: FontVariant[];
}

// ---- family 聚合规则 ------------------------------------------------------

// 厂商特化规则优先处理（他们的命名模式不是"尾部关键字剥离"能覆盖的）
const ALIBABA_PUHUITI = /^(Alibaba PuHuiTi 3\.0)\s+\d+\s+\S.*$/;
const FZ_LANTING_HEIS_GB = /^(FZLanTingHeiS)-[A-Z0-9]{1,3}-GB$/;
const FZ_LANTING_HEI_BIG5 = /^(FZLanTingHei)-[A-Z0-9]{1,3}-BIG5$/;
const FZ_LANTING_HEIS_BIG5 = /^(FZLanTingHeiS)-[A-Z0-9]{1,3}-BIG5$/;
const FZ_LANTING_YUANS_GB = /^(FZLanTingYuanS)-[A-Z]{1,3}-GB$/;
const FZ_JUN_HEIS_GB = /^(FZJunHeiS)-[A-Z]{1,3}-GB$/;
const FZ_FEIFAN_TIJF = /^(FZFeiFanTiJF)\s+\S+$/;
// FZPanHuBaoZhuangTiS 保留 W0x 字号做独立聚合 key（W07 是中间字号系列，
// 其他 W05/W06/W08/W09/W10 不进 EXPOSED 但 key 仍规范化便于 resolver）
const FZ_PANHU_W = /^(FZPanHuBaoZhuangTiS\s+W\d{2})\s+[A-Z]{1,2}$/;
const IBM_PLEX = /^(IBM Plex Sans Cond)\s+\S.*$/;
const SOURCE_HAN_SERIF = /^(Source Han Serif CN)\s+\S.*$/;
const SOURCE_HAN_SANS = /^(Source Han Sans CN)\s+\S.*$/;

// 通用尾缀剥离：覆盖 MiSans 系列、大部分英文字族
const WEIGHT_SUFFIX_RE =
  /\s+(Thin|ExtraLight|ExtLight|UltraLight|Ultrabold|UltraBold|Light|Normal|Regular|Text|Medium|Medm|DemiBold|Demibold|SemiBold|Semibold|SmBld|Bold|ExtraBold|Heavy|Black)$/;

export function familyToAggregationKey(rawFamily: string): string {
  if (!rawFamily) return "";
  let m: RegExpExecArray | null;
  if ((m = ALIBABA_PUHUITI.exec(rawFamily))) return m[1];
  if ((m = FZ_LANTING_HEIS_GB.exec(rawFamily))) return `${m[1]}-GB`;
  if ((m = FZ_LANTING_HEIS_BIG5.exec(rawFamily))) return `${m[1]}-BIG5`;
  if ((m = FZ_LANTING_HEI_BIG5.exec(rawFamily))) return `${m[1]}-BIG5`;
  if ((m = FZ_LANTING_YUANS_GB.exec(rawFamily))) return `${m[1]}-GB`;
  if ((m = FZ_JUN_HEIS_GB.exec(rawFamily))) return `${m[1]}-GB`;
  if ((m = FZ_FEIFAN_TIJF.exec(rawFamily))) return m[1];
  if ((m = FZ_PANHU_W.exec(rawFamily))) return m[1];
  if ((m = IBM_PLEX.exec(rawFamily))) return m[1];
  if ((m = SOURCE_HAN_SERIF.exec(rawFamily))) return m[1];
  if ((m = SOURCE_HAN_SANS.exec(rawFamily))) return m[1];
  // 兜底：尾部字重关键字剥离
  const stripped = rawFamily.replace(WEIGHT_SUFFIX_RE, "").trim();
  return stripped || rawFamily;
}

// ---- weight 标准化 --------------------------------------------------------

/**
 * family/subfamily/PS 名中的字重关键字 → CSS weight 字符串。
 * 顺序很重要：长关键字放前面（"ExtraLight" / "SemiBold"），短关键字放后面
 * （"L" / "B"），避免 "Black" 被 "B" 提前命中。
 *
 * 用户决策的映射规则（Chat 2026-04-23）：
 *   Thin / ExtraLight / UltraLight        → 100
 *   Light / EL                             → 300
 *   Normal / Regular / R                   → 400
 *   Medium / DB / M                        → 500
 *   SemiBold / Demibold / SmBld / SB       → 600
 *   Bold / B                               → 700
 *   Heavy / Black / H / EB                 → 800
 *
 * DB → 500 / EL → 300 / EB → 800 是按方正"单字母简写"习惯定的，不是字面
 * DemiBold 的标准值。保持和用户决策一致。
 */
const WEIGHT_PATTERNS: Array<[RegExp, string]> = [
  // 800: Heavy / Black / EB / ExtraBold / Ultrabold / H（FZLT-H 等）
  [
    /(?:\bHeavy\b|\bBlack\b|\bExtraBold\b|\bUltraBold\b|\bUltrabold\b|\bEB\b|(?:^|[^A-Za-z])H(?:$|[^A-Za-z]))/,
    "800",
  ],
  // 100: Thin / ExtraLight / UltraLight / XI（方正"纤"）
  [/(?:\bThin\b|\bExtraLight\b|\bUltraLight\b|\bXI\b|\bExtLight\b)/, "100"],
  // 600: SemiBold / Demibold / SmBld / SB
  [
    /(?:\bSemiBold\b|\bSemibold\b|\bDemibold\b|\bDemiBold\b|\bSmBld\b|(?:^|[^A-Za-z])SB(?:$|[^A-Za-z]))/,
    "600",
  ],
  // 700: Bold / B（注意：必须在 Black/SB 之后，否则会误吞）
  [/(?:\bBold\b|(?:^|[^A-Za-z])B(?:$|[^A-Za-z]))/, "700"],
  // 500: Medium / M / DB
  [
    /(?:\bMedium\b|\bMedm\b|(?:^|[^A-Za-z])M(?:$|[^A-Za-z])|(?:^|[^A-Za-z])DB(?:$|[^A-Za-z]))/,
    "500",
  ],
  // 300: Light / EL
  [
    /(?:\bLight\b|(?:^|[^A-Za-z])L(?:$|[^A-Za-z])|(?:^|[^A-Za-z])EL(?:$|[^A-Za-z]))/,
    "300",
  ],
  // 400: Regular / Normal / Text / R
  [
    /(?:\bRegular\b|\bNormal\b|\bText\b|(?:^|[^A-Za-z])R(?:$|[^A-Za-z])|(?:^|[^A-Za-z])N(?:$|[^A-Za-z]))/,
    "400",
  ],
];

function weightFromUsClass(usWeightClass: number | null): string {
  // OS/2 fallback：只在关键字全不命中时使用。厂商值经常失真，粗分桶即可。
  if (usWeightClass == null) return "400";
  if (usWeightClass <= 150) return "100";
  if (usWeightClass <= 300) return "300";
  if (usWeightClass <= 420) return "400";
  if (usWeightClass <= 520) return "500";
  if (usWeightClass <= 620) return "600";
  if (usWeightClass <= 720) return "700";
  return "800";
}

export function normalizeWeight(
  family: string,
  subfamily: string,
  usWeightClass: number | null,
  postscriptName: string,
): string {
  const haystack = [family, subfamily, postscriptName]
    .filter(Boolean)
    .join(" ");
  for (const [re, w] of WEIGHT_PATTERNS) {
    if (re.test(haystack)) return w;
  }
  return weightFromUsClass(usWeightClass);
}

// ---- 下拉精选白名单 ------------------------------------------------------

/**
 * 暴露到编辑器字体下拉的家族白名单（aggregation key 列表）。
 *
 * 新字体要出现在下拉 → 加到这里（同时按需在 FAMILY_DISPLAY_NAMES 配中文名）。
 * 不加的字体依然通过 lib/render-psd-to-png.ts 的全量注册被 resolver 命中，
 * PSD 引用它们时导出不会回退。
 *
 * 数组顺序 = 下拉分组顺序（按业务优先级排，不按字母序）。
 */
export const EXPOSED_FAMILIES: string[] = [
  "Meituan Type",
  "Alibaba PuHuiTi 3.0",
  "MiSans",
  "Source Han Serif CN",
  "IBM Plex Sans Cond",
  "Smiley Sans Oblique",
  "DingTalk JinBuTi",
  "Douyin Sans",
  "Alimama ShuHeiTi",
  "Alimama FangYuanTi VF",
  "FZLanTingHeiS-GB",
  "FZLanTingYuanS-GB",
  "FZJunHeiS-GB",
  "FZPanHuBaoZhuangTiS W07",
  "MT New Digital Display",
];

const WEIGHT_LABELS: Record<string, string> = {
  "100": "极细",
  "300": "细",
  "400": "常规",
  "500": "中等",
  "600": "半粗",
  "700": "加粗",
  "800": "特粗",
};

/**
 * 把扫描结果聚合成前端下拉用的 FontFamilyDef[]。
 * - 只保留 EXPOSED_FAMILIES 里的家族
 * - 同家族同 weight 出现多个 face → 取第一个，其余 console.warn
 * - variants 按 weight 数值升序
 * - 家族顺序按 EXPOSED_FAMILIES 数组顺序（= 产品意图的视觉优先级）
 */
export function aggregateFamilies(faces: ScannedFontFace[]): FontFamilyDef[] {
  const bucket = new Map<string, Map<string, ScannedFontFace>>();
  const duplicates: string[] = [];

  for (const face of faces) {
    if (!face.family) continue;
    const key = familyToAggregationKey(face.family);
    if (!EXPOSED_FAMILIES.includes(key)) continue;
    const weight = normalizeWeight(
      face.family,
      face.subfamily,
      face.usWeightClass,
      face.postscriptName,
    );
    let variants = bucket.get(key);
    if (!variants) {
      variants = new Map();
      bucket.set(key, variants);
    }
    const existing = variants.get(weight);
    if (existing) {
      duplicates.push(
        `${key}|${weight} 多文件命中，保留首个:\n    keep = ${existing.filename}\n    skip = ${face.filename}`,
      );
      continue;
    }
    variants.set(weight, face);
  }

  if (duplicates.length > 0) {
    console.warn(
      `[font-aggregation] 发现 ${duplicates.length} 处 family+weight 冲突:`,
    );
    for (const d of duplicates) console.warn("  " + d);
  }

  const result: FontFamilyDef[] = [];
  for (const key of EXPOSED_FAMILIES) {
    const variants = bucket.get(key);
    if (!variants || variants.size === 0) continue;
    const sorted = [...variants.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map<FontVariant>(([weight, face]) => ({
        weight,
        label: WEIGHT_LABELS[weight] ?? weight,
        url: face.url,
        postscriptName: face.postscriptName,
      }));
    result.push({
      family: key,
      displayName: FAMILY_DISPLAY_NAMES[key] ?? key,
      variants: sorted,
    });
  }
  return result;
}
