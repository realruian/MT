import type { PsdLayer } from "@/types/template";

/**
 * 会场组件（venue component）：可插入到当前会场画布的"业务积木"。
 * 将来由后台上传功能生产数据，接口返回结构按这个 type 对齐。
 * 目前 Step 1 仅展示卡片，payload.layers 保留但不消费。
 */
export interface VenueComponent {
  id: string;
  /** ≤ 6 字展示名 */
  name: string;
  /** 分组名；SlotPanel 会按 group 聚合排序，相同 group 的组件同组展示 */
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

export const MOCK_VENUE_COMPONENTS: VenueComponent[] = [
  {
    id: "comp_header_a",
    name: "头图 A",
    group: "头部模块",
    thumbnail: mockThumb("#FF5D6E"),
    payload: { layers: [] },
  },
  {
    id: "comp_header_b",
    name: "头图 B",
    group: "头部模块",
    thumbnail: mockThumb("#FF8A3D"),
    payload: { layers: [] },
  },
  {
    id: "comp_card_a",
    name: "卡片 A",
    group: "内容模块",
    thumbnail: mockThumb("#3BA7FF"),
    payload: { layers: [] },
  },
  {
    id: "comp_card_b",
    name: "卡片 B",
    group: "内容模块",
    thumbnail: mockThumb("#6C63FF"),
    payload: { layers: [] },
  },
  {
    id: "comp_btn_group",
    name: "按钮组",
    group: "交互模块",
    thumbnail: mockThumb("#10B981"),
    payload: { layers: [] },
  },
];

/**
 * Step 2 将替换为真实接口：
 *   GET /api/admin/venue-components  → VenueComponent[]
 * 目前消费方直接 import MOCK_VENUE_COMPONENTS。
 */
