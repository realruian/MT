import type { PsdLayer } from "@/types/template";

/**
 * 会场组件（venue component）：可插入到当前会场画布的"业务积木"，
 * 在 SlotPanel 的「会场」tab 下以"会场组件卡片（venue component card）"形式
 * 呈现。将来由后台上传功能生产数据，接口返回结构按这个 type 对齐；
 * Step 1 消费方只渲染 thumbnail / name / group，payload 暂留空。
 */
export interface VenueComponent {
  id: string;
  /** 会场组件卡片下方展示名，≤ 6 字 */
  name: string;
  /** 分组名；VenueComponentLibrary 按 group 首次出现顺序聚合渲染 */
  group: string;
  /** 缩略图 URL（生产环境是 blob URL，正方形） */
  thumbnail: string;
  /** 插入时克隆并 id 重映射；Step 1 mock 先留空数组 */
  payload: { layers: PsdLayer[] };
}

/** 内联 SVG 占位缩略图：纯色方块（无圆角，无文字）。等真实上传数据接入前用这个。
 *  UI 侧会放在 76×76 固定 box 里统一显示，viewBox 直接铺满即可。 */
function mockThumb(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 会场组件分组表：保持严格顺序（VenueComponentLibrary 按 groups[i].name 首次
 * 出现顺序渲染）。每组一个代表色，组内 A/B 两卡共用同色，以"同色 = 同组"
 * 强化视觉聚合。
 */
const GROUPS: { name: string; short: string; color: string }[] = [
  { name: "头图模块", short: "头图", color: "#FF5D6E" },
  { name: "优惠券", short: "优惠券", color: "#FF8A3D" },
  { name: "开礼包", short: "开礼包", color: "#FFC93D" },
  { name: "膨半价节日神券", short: "膨半价", color: "#10B981" },
  { name: "1对1急送", short: "1对1急送", color: "#3BA7FF" },
  { name: "站台", short: "站台", color: "#6C63FF" },
  { name: "免单", short: "免单", color: "#EC4899" },
];

/**
 * 会场组件 mock 列表：严格按 GROUPS 顺序展开，每组 2 张会场组件卡片（A / B）。
 * Step 2 将替换为真实接口：GET /api/admin/venue-components → VenueComponent[]
 */
export const MOCK_VENUE_COMPONENTS: VenueComponent[] = GROUPS.flatMap((g) =>
  (["A", "B"] as const).map((suffix) => ({
    id: `venue_${g.short}_${suffix.toLowerCase()}`,
    name: `${g.short} ${suffix}`,
    group: g.name,
    thumbnail: mockThumb(g.color),
    payload: { layers: [] },
  })),
);
