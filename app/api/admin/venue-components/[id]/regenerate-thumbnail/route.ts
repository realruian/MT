import { NextRequest } from "next/server";
import {
  getVenueComponent,
  updateVenueComponent,
} from "@/lib/venue-components-db";
import {
  generateAutoThumbnail,
  removeBlobIfManaged,
} from "@/lib/venue-component-psd";

/**
 * 基于 DB 里已有的 payload.layers 重新合成缩略图。
 * - 不重解析 PSD 源文件，所以即使 source_psd_url 丢失也能跑（数据迁移兜底）
 * - 成功后才更新 thumbnail_url 并删旧文件，半途失败不脏原缩略图
 * 场景：编辑器端 renderPsdToPng 升级（字体 / 布局 bug 修复）后批量刷
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await getVenueComponent(id);
    if (!existing) {
      return Response.json({ error: "组件不存在" }, { status: 404 });
    }

    if (!existing.payload.layers.length) {
      return Response.json(
        { error: "组件 layers 为空，无法合成缩略图" },
        { status: 400 },
      );
    }

    const up = await generateAutoThumbnail({
      componentId: id,
      layers: existing.payload.layers,
      height: existing.height,
    });

    const updated = await updateVenueComponent(id, { thumbnailUrl: up.url });
    if (!updated) {
      return Response.json({ error: "组件已被删除" }, { status: 404 });
    }

    if (up.url !== existing.thumbnailUrl) {
      removeBlobIfManaged(existing.thumbnailUrl);
    }

    return Response.json({ ok: true, component: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components/[id]/regenerate-thumbnail] POST", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
