import { NextRequest } from "next/server";
import { localRead, contentTypeOf } from "@/lib/local-storage";

const FONT_EXTENSIONS = new Set(["ttf", "otf", "woff", "woff2"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const pathname = path.join("/");

  if (!pathname || pathname.includes("..") || path.some((seg) => seg.startsWith("."))) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
  if (!FONT_EXTENSIONS.has(ext)) {
    return Response.json({ error: "Not a font file" }, { status: 400 });
  }

  const blobPathname = `fonts/${pathname}`;
  const buf = localRead(blobPathname);
  if (!buf) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", contentTypeOf(blobPathname));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(new Uint8Array(buf), { headers });
}
