import { NextRequest } from "next/server";
import { isAllowedBlobPathname } from "@/lib/blob-media";
import { localPut } from "@/lib/local-storage";

const ALLOWED_FOLDERS = new Set([
  "thumbnails",
  "templates",
  "uploads",
  "fonts",
  "psd-originals",
  "psd-layers",
]);

function safeBasename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").replace(/\.\./g, "_");
  return base.trim() || "file";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = ((formData.get("folder") as string) || "uploads").replace(/\/+$/, "");

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    const topFolder = folder.split("/")[0];
    if (!ALLOWED_FOLDERS.has(topFolder)) {
      return Response.json({ error: "Invalid folder" }, { status: 400 });
    }

    const pathname = `${folder}/${safeBasename(file.name)}`;
    if (!isAllowedBlobPathname(pathname)) {
      return Response.json({ error: "Invalid pathname" }, { status: 400 });
    }

    const result = await localPut(pathname, file);
    return Response.json({ url: result.url, pathname: result.pathname });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
