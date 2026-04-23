import type { PsdLayer } from "./template";

/**
 * 会场组件应用层对象（DB → API → UI 统一用这个结构）。
 * 放在 types 目录下是为了让客户端组件可以安全 import，不会误拉
 * lib/venue-components-db.ts（server-only，依赖 better-sqlite3）。
 */
export interface VenueComponentRecord {
  id: string;
  name: string;
  groupName: string;
  thumbnailUrl: string;
  payload: { layers: PsdLayer[] };
  width: number;
  height: number;
  sourcePsdUrl: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}
