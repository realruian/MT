import { getDb } from "./db";

export async function initDatabase() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      html_file TEXT NOT NULL,
      editable_fields JSONB NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
