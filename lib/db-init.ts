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

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'templates' AND column_name = 'template_type'
      ) THEN
        ALTER TABLE templates ADD COLUMN template_type TEXT NOT NULL DEFAULT 'html';
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'templates' AND column_name = 'psd_file'
      ) THEN
        ALTER TABLE templates ADD COLUMN psd_file TEXT;
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'templates' AND column_name = 'canvas_width'
      ) THEN
        ALTER TABLE templates ADD COLUMN canvas_width INTEGER;
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'templates' AND column_name = 'canvas_height'
      ) THEN
        ALTER TABLE templates ADD COLUMN canvas_height INTEGER;
      END IF;
    END $$
  `;

  await sql`
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
      visible BOOLEAN NOT NULL DEFAULT true,
      opacity REAL NOT NULL DEFAULT 1,
      image_url TEXT,
      text_content TEXT,
      font_family TEXT,
      font_size REAL,
      font_color TEXT,
      font_weight TEXT,
      text_align TEXT,
      line_height REAL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'psd_layers' AND column_name = 'rotation'
      ) THEN
        ALTER TABLE psd_layers ADD COLUMN rotation REAL NOT NULL DEFAULT 0;
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'psd_layers' AND column_name = 'font_style'
      ) THEN
        ALTER TABLE psd_layers ADD COLUMN font_style TEXT DEFAULT 'normal';
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'psd_layers' AND column_name = 'locked'
      ) THEN
        ALTER TABLE psd_layers ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false;
      END IF;
    END $$
  `;
}
