import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * 本地 SQLite 数据库 shim。
 * 保留 Neon 的 tagged-template 风格：`await sql\`SELECT ... WHERE id = ${id}\``，
 * 内部改用 better-sqlite3 同步 API（Promise.resolve 包装出异步签名）。
 *
 * 数据库文件位置：<project root>/data/local.db
 */

let _db: Database.Database | null = null;

function rawDb(): Database.Database {
  if (_db) return _db;
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "local.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

function normalizeParam(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined) return null;
  // SQLite 不支持 Date 对象；序列化为 ISO 字符串
  if (v instanceof Date) return v.toISOString();
  return v;
}

type Row = Record<string, unknown>;

export interface SqlFn {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>;
  /** 逃生舱：拿到底层 Database 实例做事务、prepare 等高级操作。 */
  raw(): Database.Database;
}

export function getDb(): SqlFn {
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    let query = "";
    const params: unknown[] = [];
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        query += "?";
        params.push(normalizeParam(values[i]));
      }
    }
    const db = rawDb();
    const leading = query.trim().slice(0, 8).toUpperCase();
    const isRead =
      leading.startsWith("SELECT") ||
      leading.startsWith("WITH") ||
      leading.startsWith("PRAGMA");
    const stmt = db.prepare(query);
    if (isRead) {
      const rows = stmt.all(...(params as never[])) as Row[];
      return Promise.resolve(rows);
    }
    stmt.run(...(params as never[]));
    return Promise.resolve([]);
  }) as SqlFn;

  fn.raw = rawDb;
  return fn;
}
