import { NextRequest } from "next/server";
import { isAllowedBlobPathname } from "@/lib/blob-media";
import { localRead, contentTypeOf } from "@/lib/local-storage";

export async function GET(req: NextRequest) {
  const pathname = req.nextUrl.searchParams.get("pathname")?.trim() ?? "";
  if (!pathname || !isAllowedBlobPathname(pathname)) {
    return Response.json({ error: "Invalid pathname" }, { status: 400 });
  }

  const buf = localRead(pathname);
  if (!buf) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", contentTypeOf(pathname));
  headers.set(
    "Cache-Control",
    "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
  );

  return new Response(new Uint8Array(buf), { headers });
}
