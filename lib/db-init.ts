import { getDb } from "./db";

/**
 * 本地 SQLite 的建表脚本。幂等：重复调用只建缺失的表/列/索引。
 * JSONB → TEXT（应用层 JSON.parse / JSON.stringify），TIMESTAMPTZ → TEXT（CURRENT_TIMESTAMP）。
 */
export async function initDatabase() {
  const sql = getDb();
  const db = sql.raw();

  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      thumbnail TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      html_file TEXT NOT NULL DEFAULT '',
      editable_fields TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      template_type TEXT NOT NULL DEFAULT 'html',
      psd_file TEXT,
      canvas_width INTEGER,
      canvas_height INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS psd_layers (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      layer_type TEXT NOT NULL,
      z_index INTEGER NOT NULL DEFAULT 0,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      opacity REAL NOT NULL DEFAULT 1,
      rotation REAL NOT NULL DEFAULT 0,
      image_url TEXT,
      text_content TEXT,
      font_family TEXT,
      font_size REAL,
      font_color TEXT,
      font_weight TEXT,
      font_style TEXT DEFAULT 'normal',
      text_align TEXT,
      line_height REAL,
      locked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT REFERENCES psd_layers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_psd_layers_template ON psd_layers(template_id);
    CREATE INDEX IF NOT EXISTS idx_psd_layers_parent_id ON psd_layers(parent_id);
  `);
}
