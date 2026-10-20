import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { uploadDir } from "@/lib/paths";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export async function GET(_request: Request, context: { params: Promise<{ file: string[] }> }) {
  const { file } = await context.params;
  const root = path.resolve(uploadDir());
  const target = path.resolve(root, ...file);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }
  const type = TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
  const body = fs.readFileSync(target);
  return new NextResponse(body, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
}
