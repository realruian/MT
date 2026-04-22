export interface FontVariant {
  /** CSS font-weight 值："400" / "500" / "700" 等 */
  weight: string;
  /** UI 显示标签 */
  label: string;
  url: string;
}

export interface FontFamilyDef {
  /** CSS font-family 名，也是内部 key */
  family: string;
  /** UI 显示字体名 */
  displayName: string;
  variants: FontVariant[];
}

export const FONT_FAMILIES: FontFamilyDef[] = [
  {
    family: "MeiTuan",
    displayName: "美团体",
    variants: [
      { weight: "400", label: "常规", url: "/fonts/Meituan Type-Regular.TTF" },
      { weight: "700", label: "加粗", url: "/fonts/Meituan Type-Bold.TTF" },
    ],
  },
  {
    family: "MiSans",
    displayName: "MiSans",
    variants: [
      { weight: "400", label: "常规", url: "/fonts/MiSans-Regular.otf" },
      { weight: "500", label: "中等", url: "/fonts/MiSans-Medium.otf" },
      { weight: "600", label: "半粗", url: "/fonts/MiSans-Demibold.otf" },
    ],
  },
  {
    family: "FZLanTingHei",
    displayName: "方正兰亭黑",
    variants: [{ weight: "400", label: "常规", url: "/fonts/FZLTHJW.TTF" }],
  },
  {
    family: "FZLanTingZCH",
    displayName: "方正兰亭准粗黑",
    variants: [{ weight: "400", label: "常规", url: "/fonts/FZLTZCHJW.TTF" }],
  },
  {
    family: "ZaoZiYuanHei",
    displayName: "造字工房元黑",
    variants: [{ weight: "400", label: "常规", url: "/fonts/造字工房元黑体.ttf" }],
  },
  {
    family: "SmileySans",
    displayName: "得意黑",
    variants: [{ weight: "400", label: "常规", url: "/fonts/SmileySans-Oblique-2.ttf" }],
  },
  {
    family: "FZShengDa",
    displayName: "方正盛世大",
    variants: [{ weight: "700", label: "大", url: "/fonts/molly/FZShengSKSJW_Da.ttf" }],
  },
  {
    family: "FZShengZhong",
    displayName: "方正盛世中",
    variants: [{ weight: "500", label: "中", url: "/fonts/molly/FZShengSKSJW_Zhong.ttf" }],
  },
];

/**
 * 预加载所有内置字体的所有 variant。
 * 对每个 (family, weight) 组合单独 new FontFace 注册，浏览器在渲染 `font-weight: xxx`
 * 时会精确匹配对应的字重文件，避免合成粗体 / 合成细体。
 */
export async function preloadAllFonts(): Promise<void> {
  const tasks = FONT_FAMILIES.flatMap((f) =>
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

/**
 * @deprecated 兜底路径下对应 TTF 文件不存在，调用只会刷 404 warn。
 * 未来若要恢复需先补齐 public/fonts/ 下的对应文件。
 */
export async function preloadExtraFont(family: string): Promise<void> {
  try {
    const face = new FontFace(
      family,
      `url(/fonts/${encodeURIComponent(family)}.ttf)`,
    );
    const loaded = await face.load();
    document.fonts.add(loaded);
  } catch (err) {
    console.warn(`[font] 兜底加载失败 family="${family}"`, err);
  }
}
