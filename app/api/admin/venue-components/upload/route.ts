import { NextRequest } from "next/server";
import {
  createVenueComponent,
  type CreateVenueComponentInput,
} from "@/lib/venue-components-db";
import {
  isVenueComponentGroup,
  VENUE_COMPONENT_GROUPS,
} from "@/lib/venue-component-groups";
import {
  buildVenueComponentFromPsd,
  generateAutoThumbnail,
  storeUserThumbnail,
  nameCharLength,
  PsdWidthMismatchError,
  MAX_PSD_SIZE,
  MAX_THUMB_SIZE,
  VENUE_COMPONENT_WIDTH,
} from "@/lib/venue-component-psd";

function generateId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `venue_${now}_${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const psdFile = formData.get("psd") as File | null;
    const name = (formData.get("name") as string | null)?.trim() ?? "";
    const group = (formData.get("group") as string | null)?.trim() ?? "";
    const thumbnailFile = formData.get("thumbnail") as File | null;

    // --- 基本入参校验 ----------------------------------------------------
    if (!psdFile) {
      return Response.json({ error: "请选择 PSD 文件" }, { status: 400 });
    }
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
    if (!name) {
      return Response.json({ error: "请填写组件名称" }, { status: 400 });
    }
    if (nameCharLength(name) > 6) {
      return Response.json(
        { error: "组件名称不能超过 6 个字" },
        { status: 400 },
      );
    }
    if (!isVenueComponentGroup(group)) {
      return Response.json(
        {
          error: `分组必须是以下之一：${VENUE_COMPONENT_GROUPS.join(" / ")}`,
        },
        { status: 400 },
      );
    }
    if (thumbnailFile && thumbnailFile.size > MAX_THUMB_SIZE) {
      return Response.json(
        {
          error: `缩略图过大（${Math.round(thumbnailFile.size / 1024 / 1024)}MB），最大 ${MAX_THUMB_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }

    // --- 解析 PSD + 存 blob（含宽度校验）--------------------------------
    const componentId = generateId();
    let built;
    try {
      built = await buildVenueComponentFromPsd({
        componentId,
        psdBuffer: await psdFile.arrayBuffer(),
        psdFileName: psdFile.name,
      });
    } catch (err) {
      if (err instanceof PsdWidthMismatchError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // --- 缩略图 -----------------------------------------------------------
    let thumbnailUrl: string;
    if (thumbnailFile) {
      const up = await storeUserThumbnail({
        componentId,
        file: thumbnailFile,
      });
      thumbnailUrl = up.url;
    } else {
      try {
        const up = await generateAutoThumbnail({
          componentId,
          layers: built.layers,
          height: built.height,
        });
        thumbnailUrl = up.url;
      } catch (err) {
        console.error(
          "[venue-components/upload] auto thumbnail failed:",
          err instanceof Error ? err.message : err,
        );
        return Response.json(
          {
            error:
              "缩略图自动生成失败，请手动上传缩略图后重试（详情见服务端日志）",
          },
          { status: 500 },
        );
      }
    }

    // --- 写入 DB ----------------------------------------------------------
    const input: CreateVenueComponentInput = {
      id: componentId,
      name,
      groupName: group,
      thumbnailUrl,
      payload: { layers: built.layers },
      width: VENUE_COMPONENT_WIDTH,
      height: built.height,
      sourcePsdUrl: built.sourcePsdUrl,
    };
    const created = await createVenueComponent(input);

    return Response.json({ ok: true, component: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[venue-components/upload]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
