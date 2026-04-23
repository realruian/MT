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

export interface UpdateVenueComponentInput {
  name?: string;
  groupName?: string;
  thumbnailUrl?: string;
  payload?: { layers: PsdLayer[] };
  width?: number;
  height?: number;
  sourcePsdUrl?: string | null;
  sortOrder?: number;
}

/**
 * 部分更新会场组件。每字段独立 UPDATE（项目约定，避免 COALESCE 绑定风险），
 * 所有成功分支都顺带刷新 updated_at。调用前自行校验字段合法性。
 * 返回更新后的完整行，若 id 不存在返回 null。
 */
export async function updateVenueComponent(
  id: string,
  input: UpdateVenueComponentInput,
): Promise<VenueComponentRecord | null> {
  const sql = getDb();
  const existing = await getVenueComponent(id);
  if (!existing) return null;

  if (input.name !== undefined) {
    await sql`UPDATE venue_components SET name = ${input.name} WHERE id = ${id}`;
  }
  if (input.groupName !== undefined) {
    await sql`UPDATE venue_components SET group_name = ${input.groupName} WHERE id = ${id}`;
  }
  if (input.thumbnailUrl !== undefined) {
    await sql`UPDATE venue_components SET thumbnail_url = ${input.thumbnailUrl} WHERE id = ${id}`;
  }
  if (input.payload !== undefined) {
    const payloadJson = JSON.stringify(input.payload);
    await sql`UPDATE venue_components SET payload_json = ${payloadJson} WHERE id = ${id}`;
  }
  if (input.width !== undefined) {
    await sql`UPDATE venue_components SET width = ${input.width} WHERE id = ${id}`;
  }
  if (input.height !== undefined) {
    await sql`UPDATE venue_components SET height = ${input.height} WHERE id = ${id}`;
  }
  if (input.sourcePsdUrl !== undefined) {
    await sql`UPDATE venue_components SET source_psd_url = ${input.sourcePsdUrl ?? null} WHERE id = ${id}`;
  }
  if (input.sortOrder !== undefined) {
    await sql`UPDATE venue_components SET sort_order = ${input.sortOrder} WHERE id = ${id}`;
  }

  const now = Date.now();
  await sql`UPDATE venue_components SET updated_at = ${now} WHERE id = ${id}`;

  return getVenueComponent(id);
}

/**
 * 按给定顺序重排同一分组内的 sort_order（下标即新 sort_order）。
 * - 只处理传入的 id；同组里没传的行保持原 sort_order 不变
 * - 若列表中某个 id 对应的组件真实 group 与 groupName 不一致，静默跳过
 *   （防御性：拖拽 UI 的 state 偶尔会滞后）
 * 一次性事务，任何一行失败整体回滚。
 */
export async function reorderVenueComponents(
  groupName: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  const sql = getDb();
  const db = sql.raw();
  const now = Date.now();

  const getGroup = db.prepare(
    "SELECT group_name FROM venue_components WHERE id = ?",
  );
  const update = db.prepare(
    "UPDATE venue_components SET sort_order = ?, updated_at = ? WHERE id = ?",
  );

  const txn = db.transaction((ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const row = getGroup.get(id) as { group_name: string } | undefined;
      if (!row) continue;
      if (row.group_name !== groupName) continue;
      update.run(i, now, id);
    }
  });
  txn(orderedIds);
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
