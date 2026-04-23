/**
 * 会场组件的 7 个固定业务分组。
 * - 服务端（上传 API 校验、DB schema）和前端（admin UI 下拉、编辑器组件库
 *   分组标题）共用这一份来源，避免字面量散落多处
 * - 顺序即显示顺序；新增/调整需同时改运营侧宣贯
 */
export const VENUE_COMPONENT_GROUPS = [
  "头图模块",
  "优惠券",
  "开礼包",
  "膨半价节日神券",
  "1对1急送",
  "站台",
  "免单",
] as const;

export type VenueComponentGroup = (typeof VENUE_COMPONENT_GROUPS)[number];

export function isVenueComponentGroup(v: unknown): v is VenueComponentGroup {
  return (
    typeof v === "string" &&
    (VENUE_COMPONENT_GROUPS as readonly string[]).includes(v)
  );
}
