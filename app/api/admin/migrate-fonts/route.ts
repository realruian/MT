import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { resolvePsName } from "@/lib/font-resolver";

/**
 * 一次性迁移：把 psd_layers 表里 text 图层的 font_family / font_weight 走
 * resolver 归一化。已经干净的行不会被改写。
 *
 * - GET ?dryRun=1 → 只统计，不写库
 * - POST           → 实际执行
 *
 * 安全：resolver 失败时保留原值，绝不破坏数据。每条变更都打 log。
 */

interface LayerRow {
  id: string;
  template_id: string;
  font_family: string | null;
  font_weight: string | null;
}

interface MigrationChange {
  id: string;
  templateId: string;
  fromFamily: string | null;
  toFamily: string | null;
  fromWeight: string | null;
  toWeight: string | null;
  source: string;
}

async function dryRun(): Promise<{
  total: number;
  changes: MigrationChange[];
  unchanged: number;
}> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, template_id, font_family, font_weight
    FROM psd_layers
    WHERE layer_type = 'text' AND font_family IS NOT NULL
  `) as unknown as LayerRow[];

  const changes: MigrationChange[] = [];
  let unchanged = 0;

  for (const row of rows) {
    const r = await resolvePsName(row.font_family, row.font_weight);
    const newFamily = r.family || row.font_family;
    const newWeight =
      r.source !== "raw-fallback" && r.source !== "family-fallback"
        ? r.weight
        : row.font_weight;
    if (newFamily === row.font_family && newWeight === row.font_weight) {
      unchanged++;
      continue;
    }
    changes.push({
      id: row.id,
      templateId: row.template_id,
      fromFamily: row.font_family,
      toFamily: newFamily,
      fromWeight: row.font_weight,
      toWeight: newWeight,
      source: r.source,
    });
  }

  return { total: rows.length, changes, unchanged };
}

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get("dryRun");
  if (dry === "1" || dry === "true") {
    const result = await dryRun();
    return Response.json({ ok: true, dryRun: true, ...result });
  }
  return Response.json(
    {
      error:
        "GET 仅支持 dryRun 模式。加 ?dryRun=1 看影响面，确认无误后用 POST 实际执行。",
    },
    { status: 400 },
  );
}

export async function POST() {
  const sql = getDb();
  const { total, changes, unchanged } = await dryRun();

  for (const c of changes) {
    await sql`
      UPDATE psd_layers
      SET font_family = ${c.toFamily}, font_weight = ${c.toWeight}
      WHERE id = ${c.id}
    `;
    console.log(
      `[migrate-fonts] ${c.id} (${c.templateId}): ` +
        `${c.fromFamily}/${c.fromWeight} → ${c.toFamily}/${c.toWeight} (${c.source})`,
    );
  }

  return Response.json({
    ok: true,
    dryRun: false,
    total,
    updated: changes.length,
    unchanged,
    sampleChanges: changes.slice(0, 10),
  });
}
