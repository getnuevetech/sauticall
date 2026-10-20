import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { audit, getDb } from "@/lib/db";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "staff")) {
    return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  }
  const form = await request.formData();
  const file = form.get("file");
  const alt = String(form.get("alt") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "");
  const filename = `${Date.now()}-${safe || "image"}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), bytes);
  const url = `/uploads/${filename}`;
  getDb().prepare("INSERT INTO media (url, alt, created_at) VALUES (?, ?, ?)").run(url, alt, new Date().toISOString());
  audit(user.email, "media.upload", url);
  return NextResponse.json({ url });
}
