import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { clientBlobMediaUrl, isAllowedBlobPathname } from "@/lib/blob-media";

const ALLOWED_FOLDERS = new Set(["thumbnails", "templates", "uploads", "fonts", "psd-originals", "psd-layers"]);

function safeBasename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").replace(/\.\./g, "_");
  return base.trim() || "file";
}

function isPrivateStorePublicAccessError(message: string): boolean {
  return (
    message.includes("private store") ||
    message.includes("private access") ||
    message.includes("Cannot use public access")
  );
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

    try {
      const blob = await put(pathname, file, { access: "public", allowOverwrite: true });
      return Response.json({ url: blob.url, pathname: blob.pathname });
    } catch (first: unknown) {
      const msg = first instanceof Error ? first.message : "";
      if (!isPrivateStorePublicAccessError(msg)) {
        throw first;
      }
      const blob = await put(pathname, file, { access: "private", allowOverwrite: true });
      return Response.json({
        url: clientBlobMediaUrl(blob.pathname),
        pathname: blob.pathname,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
