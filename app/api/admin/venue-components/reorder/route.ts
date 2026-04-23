import { NextRequest } from "next/server";
import { reorderVenueComponents } from "@/lib/venue-components-db";
import { isVenueComponentGroup } from "@/lib/venue-component-groups";

/**
 * 按数组下标批量刷新同一分组内的 sort_order。
 * body: { groupName: string; ids: string[] }
 * - groupName 必须在 VENUE_COMPONENT_GROUPS 里
 * - ids 中的组件若不属于 groupName 会被静默跳过（见 DB 层实现）
 *
 * 设计上限定「同组」是为了让 UI 只能组内拖拽——跨组改分组走 PATCH，
 * 语义更清晰也避免一次 reorder 跨组隐含 group 变更的灰色地带。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { groupName?: unknown; ids?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
    }
    const { groupName, ids } = body;
    if (!isVenueComponentGroup(groupName)) {
      return Response.json({ error: "分组无效" }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.some((v) => typeof v !== "string")) {
      return Response.json(
        { error: "ids 必须是字符串数组" },
        { status: 400 },
      );
    }

    await reorderVenueComponents(groupName, ids as string[]);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components/reorder] POST", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
