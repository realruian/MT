import { get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { isAllowedBlobPathname } from "@/lib/blob-media";

export async function GET(req: NextRequest) {
  const pathname = req.nextUrl.searchParams.get("pathname")?.trim() ?? "";
  if (!pathname || !isAllowedBlobPathname(pathname)) {
    return Response.json({ error: "Invalid pathname" }, { status: 400 });
  }

  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const { stream, blob } = result;
    const headers = new Headers();
    headers.set("Content-Type", blob.contentType || "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=300, s-maxage=300");

    return new Response(stream, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[blob/media]", pathname, message);
    return Response.json({ error: message }, { status: 502 });
  }
}
