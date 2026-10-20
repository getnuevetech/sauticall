import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number };
  return NextResponse.json({ ok: row.n > 0 });
}
