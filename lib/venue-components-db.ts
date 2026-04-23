import path from "path";
import fs from "fs";
import { getDb } from "./db";
import { LOCAL_BLOB_ROOT } from "./local-storage";
import type { PsdLayer } from "@/types/template";
import type { VenueComponentRecord } from "@/types/venue-component";

// Re-export 方便 API / server-only 消费方就近引用（UI 侧直接从 types 取）
export type { VenueComponentRecord } from "@/types/venue-component";

interface VenueComponentRow {
  id: string;
  name: string;
  group_name: string;
  thumbnail_url: string;
  payload_json: string;
  width: number;
  height: number;
  source_psd_url: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

function rowToRecord(row: VenueComponentRow): VenueComponentRecord {
  let payload: { layers: PsdLayer[] } = { layers: [] };
  try {
    const parsed = JSON.parse(row.payload_json);
    if (parsed && Array.isArray(parsed.layers)) payload = parsed;
  } catch (err) {
    console.warn(
      `[venue-components-db] payload JSON parse failed for ${row.id}:`,
      err instanceof Error ? err.message : err,
    );
  }
  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name,
    thumbnailUrl: row.thumbnail_url,
    payload,
    width: row.width,
    height: row.height,
    sourcePsdUrl: row.source_psd_url ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listVenueComponents(): Promise<VenueComponentRecord[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM venue_components
    ORDER BY group_name ASC, sort_order ASC, created_at ASC
  `) as unknown as VenueComponentRow[];
  return rows.map(rowToRecord);
}

export async function getVenueComponent(
  id: string,
): Promise<VenueComponentRecord | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM venue_components WHERE id = ${id}
  `) as unknown as VenueComponentRow[];
  if (rows.length === 0) return null;
  return rowToRecord(rows[0]);
}

export interface CreateVenueComponentInput {
  id: string;
  name: string;
  groupName: string;
  thumbnailUrl: string;
  payload: { layers: PsdLayer[] };
  width: number;
  height: number;
  sourcePsdUrl?: string | null;
  sortOrder?: number;
}

export async function createVenueComponent(
  input: CreateVenueComponentInput,
): Promise<VenueComponentRecord> {
  const sql = getDb();
  const now = Date.now();
  const sortOrder = input.sortOrder ?? now; // 默认用时间戳做排序，新的排在同组后面
  const payloadJson = JSON.stringify(input.payload);
  await sql`
    INSERT INTO venue_components (
      id, name, group_name, thumbnail_url, payload_json,
      width, height, source_psd_url, sort_order, created_at, updated_at
    ) VALUES (
      ${input.id}, ${input.name}, ${input.groupName}, ${input.thumbnailUrl}, ${payloadJson},
      ${input.width}, ${input.height}, ${input.sourcePsdUrl ?? null}, ${sortOrder}, ${now}, ${now}
    )
  `;
  const created = await getVenueComponent(input.id);
  if (!created) throw new Error("createVenueComponent: insert succeeded but row missing");
  return created;
}

/**
 * 删组件 = 删 DB 行 + 删 blob 目录下的 PSD / 缩略图 / layer 子目录。
 * 文件删除失败（文件不存在 / 权限等）只打 warn，DB 删除成功就算完成，
 * 避免运营侧看到"删除失败"但 DB 已经脏了 的不一致状态。
 */
export async function deleteVenueComponent(id: string): Promise<boolean> {
  const existing = await getVenueComponent(id);
  if (!existing) return false;

  // 1. 单文件：PSD 原文件 + 缩略图
  const singleFiles: string[] = [];
  if (existing.sourcePsdUrl) {
    const pathname = extractBlobPathname(existing.sourcePsdUrl);
    if (pathname) singleFiles.push(pathname);
  }
  if (existing.thumbnailUrl) {
    const pathname = extractBlobPathname(existing.thumbnailUrl);
    if (pathname) singleFiles.push(pathname);
  }
  for (const pathname of singleFiles) {
    const full = path.join(LOCAL_BLOB_ROOT, pathname);
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (err) {
      console.warn(
        `[venue-components-db] delete blob failed ${pathname}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 2. layer 子目录 venue-components/<id>/（含所有 layer_*.png）
  const layerDir = path.join(LOCAL_BLOB_ROOT, "venue-components", id);
  try {
    if (fs.existsSync(layerDir)) {
      fs.rmSync(layerDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(
      `[venue-components-db] delete layer dir failed ${layerDir}:`,
      err instanceof Error ? err.message : err,
    );
  }

  const sql = getDb();
  await sql`DELETE FROM venue_components WHERE id = ${id}`;
  return true;
}

/** 从 /api/blob/media?pathname=xxx 这种 URL 里取出 pathname；非此形态返回 null */
function extractBlobPathname(url: string): string | null {
  if (!url.startsWith("/api/blob/media")) return null;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("pathname");
  } catch {
    return null;
  }
}
