export interface FontVariant {
  /** CSS font-weight 字符串："100" / "300" / "400" / "500" / "600" / "700" / "800" */
  weight: string;
  label: string;
  /** 前端 `<url>` 用：`/fonts/<filename>` */
  url: string;
  /** 供服务端 resolver 对齐用（避免"下拉选中 ≠ 实际注册 PS 名"） */
  postscriptName: string;
}

export interface FontFamilyDef {
  /** 聚合 key（稳定英文标识，= lib/font-aggregation.ts 的 aggregationKey） */
  family: string;
  /** 下拉展示名（来自 lib/font-display-names.ts，或 fallback 到 family） */
  displayName: string;
  variants: FontVariant[];
}

/**
 * 【心智说明】下拉清单 ≠ 可用字体清单。
 *
 *   fontkit 注册层全量加载 public/fonts/ 下 200+ 个字体文件，resolver 可
 *   命中任意已注册字体；下拉只暴露运营常用的精选子集（见
 *   lib/font-aggregation.ts 的 EXPOSED_FAMILIES 白名单），避免 200+
 *   项压垮交互。
 *
 *   新字体进下拉 → 编辑 EXPOSED_FAMILIES（服务端白名单）
 *   新字体被 PSD 引用 → 自动 resolver 兜底，无需改下拉
 *
 *   字体数据是运行时从 /api/fonts/families 拉取，不再维护静态
 *   FONT_FAMILIES 常量——加字体只需要扔文件到 public/fonts/，然后
 *   POST /api/admin/fonts/rescan 即可（或重启 dev server）。
 */

let cachedFamilies: FontFamilyDef[] | null = null;
let cachedAt = 0;
/** 客户端内存缓存 TTL：2 分钟。运营刚上传新字体后"刷新"按钮应绕过此缓存。 */
const CACHE_TTL = 2 * 60 * 1000;

/**
 * 拉取编辑器精选字体家族。
 * - 默认走 2 分钟内存缓存（同一会话里切 slot / 切 layer 不重复请求）
 * - `opts.force: true` 绕过缓存（管理员刷新 / 上传新字体后调用）
 */
export async function fetchExposedFamilies(
  opts: { force?: boolean } = {},
): Promise<FontFamilyDef[]> {
  if (
    !opts.force &&
    cachedFamilies &&
    Date.now() - cachedAt < CACHE_TTL
  ) {
    return cachedFamilies;
  }
  const res = await fetch("/api/fonts/families", { cache: "no-store" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `加载字体失败 (${res.status})`);
  }
  const data = (await res.json()) as { families?: FontFamilyDef[] };
  cachedFamilies = data.families ?? [];
  cachedAt = Date.now();
  return cachedFamilies;
}

/**
 * 预加载传入的 families 到 `document.fonts`。
 * - 每个 (family, weight) 做一个 `new FontFace`，精确匹配字重
 * - 单个加载失败只打 warn，不阻断其他 variant
 * - 浏览器端幂等：重复 add 同 FontFace 不会报错
 */
export async function preloadFonts(families: FontFamilyDef[]): Promise<void> {
  if (typeof document === "undefined") return;
  const tasks = families.flatMap((f) =>
    f.variants.map(async (v) => {
      try {
        const face = new FontFace(f.family, `url(${encodeURI(v.url)})`, {
          weight: v.weight,
          style: "normal",
        });
        const loaded = await face.load();
        document.fonts.add(loaded);
      } catch (err) {
        console.warn(
          `[font] 加载失败 family="${f.family}" weight=${v.weight} url=${v.url}`,
          err,
        );
      }
    }),
  );
  await Promise.all(tasks);
}
