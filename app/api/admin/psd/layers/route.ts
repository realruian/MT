import { NextRequest } from "next/server";
import { getPsdLayers, updatePsdLayer } from "@/lib/templates-db";

export async function GET(req: NextRequest) {
  const templateId = req.nextUrl.searchParams.get("template_id")?.trim();

  if (!templateId) {
    return Response.json({ error: "Missing template_id parameter" }, { status: 400 });
  }

  try {
    const layers = await getPsdLayers(templateId);
    return Response.json(layers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body as { id: string; [key: string]: unknown };

    if (!id) {
      return Response.json({ error: "Missing layer id" }, { status: 400 });
    }

    await updatePsdLayer(id, updates);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
