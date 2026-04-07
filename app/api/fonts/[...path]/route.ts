import { get } from "@vercel/blob";
import { NextRequest } from "next/server";

const FONT_EXTENSIONS = new Set(["ttf", "otf", "woff", "woff2"]);

const MIME_TYPES: Record<string, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const pathname = path.join("/");

  if (
    !pathname ||
    pathname.includes("..") ||
    path.some((seg) => seg.startsWith("."))
  ) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
  if (!FONT_EXTENSIONS.has(ext)) {
    return Response.json({ error: "Not a font file" }, { status: 400 });
  }

  const blobPathname = `fonts/${pathname}`;

  try {
    const result = await get(blobPathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(result.stream, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/fonts]", blobPathname, message);
    return Response.json({ error: message }, { status: 502 });
  }
}
