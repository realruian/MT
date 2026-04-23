import { NextRequest } from "next/server";
import {
  deleteVenueComponent,
  getVenueComponent,
  updateVenueComponent,
  type UpdateVenueComponentInput,
} from "@/lib/venue-components-db";
import {
  isVenueComponentGroup,
  VENUE_COMPONENT_GROUPS,
} from "@/lib/venue-component-groups";
import {
  buildVenueComponentFromPsd,
  generateAutoThumbnail,
  storeUserThumbnail,
  cleanupStaleLayerFiles,
  removeBlobIfManaged,
  nameCharLength,
  PsdWidthMismatchError,
  MAX_PSD_SIZE,
  MAX_THUMB_SIZE,
  VENUE_COMPONENT_WIDTH,
} from "@/lib/venue-component-psd";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const removed = await deleteVenueComponent(id);
    if (!removed) {
      return Response.json({ error: "组件不存在或已被删除" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components/[id]] DELETE", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * 部分更新会场组件。所有字段可选，但必须至少带一个；校验规则与 upload 一致。
 * - 传 `psd`：重新解析 + 替换 layers / width / height / sourcePsdUrl；如果没同
 *   时传 `thumbnail`，会自动基于新 layers 重生缩略图，避免缩略图与实际内容错位
 * - 传 `thumbnail`：替换缩略图文件（旧文件由 removeBlobIfManaged 清掉）
 * - 传 `name` / `group`：对应字段 UPDATE
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await getVenueComponent(id);
    if (!existing) {
      return Response.json({ error: "组件不存在" }, { status: 404 });
    }

    const formData = await req.formData();
    const rawName = formData.get("name");
    const rawGroup = formData.get("group");
    const psdFile = formData.get("psd") as File | null;
    const thumbnailFile = formData.get("thumbnail") as File | null;

    const hasName = typeof rawName === "string";
    const hasGroup = typeof rawGroup === "string";
    const hasPsd = psdFile instanceof File && psdFile.size > 0;
    const hasThumbnail = thumbnailFile instanceof File && thumbnailFile.size > 0;

    if (!hasName && !hasGroup && !hasPsd && !hasThumbnail) {
      return Response.json({ error: "没有需要更新的字段" }, { status: 400 });
    }

    // --- 字段校验 --------------------------------------------------------
    const update: UpdateVenueComponentInput = {};

    if (hasName) {
      const name = (rawName as string).trim();
      if (!name) return Response.json({ error: "组件名称不能为空" }, { status: 400 });
      if (nameCharLength(name) > 6) {
        return Response.json(
          { error: "组件名称不能超过 6 个字" },
          { status: 400 },
        );
      }
      update.name = name;
    }

    if (hasGroup) {
      const group = (rawGroup as string).trim();
      if (!isVenueComponentGroup(group)) {
        return Response.json(
          {
            error: `分组必须是以下之一：${VENUE_COMPONENT_GROUPS.join(" / ")}`,
          },
          { status: 400 },
        );
      }
      update.groupName = group;
    }

    if (hasPsd) {
      if (!psdFile.name.toLowerCase().endsWith(".psd")) {
        return Response.json({ error: "仅支持 .psd 文件" }, { status: 400 });
      }
      if (psdFile.size > MAX_PSD_SIZE) {
        return Response.json(
          {
            error: `PSD 文件过大（${Math.round(psdFile.size / 1024 / 1024)}MB），最大 ${MAX_PSD_SIZE / 1024 / 1024}MB`,
          },
          { status: 400 },
        );
      }
    }

    if (hasThumbnail && thumbnailFile.size > MAX_THUMB_SIZE) {
      return Response.json(
        {
          error: `缩略图过大（${Math.round(thumbnailFile.size / 1024 / 1024)}MB），最大 ${MAX_THUMB_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }

    // --- 重传 PSD --------------------------------------------------------
    // 顺序关键：先 build 成功后才清理旧文件，避免解析失败导致旧资源被误删
    let newThumbnailUrl: string | null = null;

    if (hasPsd) {
      let built;
      try {
        built = await buildVenueComponentFromPsd({
          componentId: id,
          psdBuffer: await psdFile.arrayBuffer(),
          psdFileName: psdFile.name,
        });
      } catch (err) {
        if (err instanceof PsdWidthMismatchError) {
          return Response.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }

      // build 已经把新 PSD 和新 layer raster 写到 blob 里了。清理旧残留：
      // - 新旧 layerId 的随机后缀不会重叠，老文件仍在 <id>/ 目录里堆着
      // - 旧 PSD 如果扩展名和新 PSD 不同（.psd → .PSD），老文件还在
      const newLayerFilenames = new Set(
        built.layers
          .filter((l) => l.imageUrl)
          .map((l) => `${l.id}.png`),
      );
      cleanupStaleLayerFiles(id, newLayerFilenames);
      if (existing.sourcePsdUrl && existing.sourcePsdUrl !== built.sourcePsdUrl) {
        removeBlobIfManaged(existing.sourcePsdUrl);
      }

      update.payload = { layers: built.layers };
      update.width = VENUE_COMPONENT_WIDTH;
      update.height = built.height;
      update.sourcePsdUrl = built.sourcePsdUrl;

      // 没传新缩略图 → 自动基于新 layers 重生
      if (!hasThumbnail) {
        try {
          const up = await generateAutoThumbnail({
            componentId: id,
            layers: built.layers,
            height: built.height,
          });
          newThumbnailUrl = up.url;
        } catch (err) {
          console.error(
            "[venue-components/[id]] auto thumbnail after PSD replace failed:",
            err instanceof Error ? err.message : err,
          );
          return Response.json(
            {
              error:
                "新 PSD 已校验通过但自动缩略图生成失败，请手动上传缩略图（详情见服务端日志）",
            },
            { status: 500 },
          );
        }
      }
    }

    // --- 重传缩略图 ------------------------------------------------------
    if (hasThumbnail) {
      const up = await storeUserThumbnail({
        componentId: id,
        file: thumbnailFile,
      });
      newThumbnailUrl = up.url;
    }

    if (newThumbnailUrl && newThumbnailUrl !== existing.thumbnailUrl) {
      // 先把新 URL 写进 DB，再把旧 blob 文件清掉——顺序颠倒会导致
      // 任意一步出错后缩略图彻底丢失
      update.thumbnailUrl = newThumbnailUrl;
    }

    // --- 写库 ------------------------------------------------------------
    const updated = await updateVenueComponent(id, update);
    if (!updated) {
      return Response.json({ error: "组件已被删除" }, { status: 404 });
    }

    // 更新成功后再删旧缩略图（不同文件名才删，避免把新缩略图误删）
    if (newThumbnailUrl && newThumbnailUrl !== existing.thumbnailUrl) {
      removeBlobIfManaged(existing.thumbnailUrl);
    }

    return Response.json({ ok: true, component: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components/[id]] PATCH", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

