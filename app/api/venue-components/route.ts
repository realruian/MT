import { listVenueComponents } from "@/lib/venue-components-db";

/**
 * 公开的会场组件列表接口（编辑器「会场」tab 消费）。
 * - 不在 /admin 下，无鉴权（运营 + 本地 dev 无登录态也能拉）
 * - 返回形状对齐 `VenueComponent`（components/editor/venue-components.ts）：
 *   `group_name → group`、`thumbnail_url → thumbnail`、payload 原样透传
 * - 排序由 lib/venue-components-db.ts::listVenueComponents 负责
 *   （group_name ASC, sort_order ASC, created_at ASC），前端按
 *   VENUE_COMPONENT_GROUPS 常量顺序再分组，不依赖 DB 排序结果
 */
export async function GET() {
  try {
    const records = await listVenueComponents();
    const components = records.map((r) => ({
      id: r.id,
      name: r.name,
      group: r.groupName,
      thumbnail: r.thumbnailUrl,
      width: r.width,
      height: r.height,
      payload: r.payload,
    }));
    return Response.json({ ok: true, components });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components] GET", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
